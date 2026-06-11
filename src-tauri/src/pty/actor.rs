use anyhow::{Context, Result};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};

use super::registry::{PtyCommand, PtyHandle};

pub struct SpawnConfig {
    pub id: String,
    pub shell: String,
    pub cwd: Option<String>,
    pub rows: u16,
    pub cols: u16,
    /// Optional command typed into the shell after a warm-up delay (e.g. "claude").
    /// Used to launch an agent CLI inside the spawned shell rather than spawning the
    /// CLI's .cmd shim directly under ConPTY.
    pub command: Option<String>,
    /// IPC channel that receives raw output bytes (coalesced batches).
    pub on_data: Channel<InvokeResponseBody>,
}

pub fn exit_channel(id: &str) -> String {
    format!("pty://exit/{id}")
}

/// Max bytes per coalesced IPC message.
const BATCH_CAP: usize = 64 * 1024;

/// Appends every immediately-available chunk to `batch` (no waiting), stopping at
/// BATCH_CAP. Coalesces only when the PTY outpaces the IPC consumer, so single
/// chunks are forwarded with zero added latency.
fn drain_pending(rx: &mut mpsc::Receiver<Vec<u8>>, mut batch: Vec<u8>) -> Vec<u8> {
    while batch.len() < BATCH_CAP {
        match rx.try_recv() {
            Ok(more) => batch.extend_from_slice(&more),
            Err(_) => break,
        }
    }
    batch
}

/// Opens a PTY, spawns the shell, and wires reader + command loop.
/// Raw bytes go to the `on_data` IPC channel; exit to the `pty://exit/<id>` event.
pub fn spawn(app: AppHandle, cfg: SpawnConfig) -> Result<PtyHandle> {
    let (cmd_tx, mut cmd_rx) = mpsc::channel::<PtyCommand>(256);

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: cfg.rows,
            cols: cfg.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .context("openpty failed")?;

    let mut cmd = CommandBuilder::new(&cfg.shell);
    if let Some(dir) = cfg.cwd.clone() {
        cmd.cwd(dir);
    }
    let mut child = pair.slave.spawn_command(cmd).context("spawn_command failed")?;

    let writer = Arc::new(Mutex::new(pair.master.take_writer().context("take_writer")?));
    let master = Arc::new(parking_lot::Mutex::new(pair.master));
    let reader_master = master.clone();

    // Reader thread: blocking read -> bounded queue. Dropping the sender on EOF
    // closes the queue, which makes the forwarder emit the exit event.
    let (chunk_tx, mut chunk_rx) = mpsc::channel::<Vec<u8>>(256);
    std::thread::spawn(move || {
        let mut reader = {
            let guard = reader_master.lock();
            match guard.try_clone_reader() {
                Ok(r) => r,
                Err(_) => return,
            }
        };
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if chunk_tx.blocking_send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // Forwarder: coalesce queued chunks into one raw binary IPC message.
    let forward_app = app.clone();
    let on_data = cfg.on_data.clone();
    let exit_id = cfg.id.clone();
    tokio::spawn(async move {
        while let Some(first) = chunk_rx.recv().await {
            let batch = drain_pending(&mut chunk_rx, first);
            if on_data.send(InvokeResponseBody::Raw(batch)).is_err() {
                break;
            }
        }
        let _ = forward_app.emit(&exit_channel(&exit_id), ());
    });

    // Optional auto-run: type the command into the shell once it has warmed up.
    if let Some(cmd_line) = cfg.command.clone() {
        let inject_writer = writer.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(700)).await;
            let mut w = inject_writer.lock().await;
            let _ = w.write_all(format!("{cmd_line}\r\n").as_bytes());
            let _ = w.flush();
        });
    }

    // Command loop on the tokio runtime.
    tokio::spawn(async move {
        while let Some(c) = cmd_rx.recv().await {
            match c {
                PtyCommand::Write(b) => {
                    let mut w = writer.lock().await;
                    let _ = w.write_all(&b);
                    let _ = w.flush();
                }
                PtyCommand::Resize { rows, cols } => {
                    let guard = master.lock();
                    let _ = guard.resize(PtySize {
                        rows,
                        cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    });
                }
                PtyCommand::Kill => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
            }
        }
    });

    Ok(PtyHandle { cmd_tx })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exit_channel_is_namespaced_by_id() {
        assert_eq!(exit_channel("abc"), "pty://exit/abc");
    }

    #[test]
    fn drain_pending_concatenates_available_chunks() {
        let (tx, mut rx) = mpsc::channel::<Vec<u8>>(8);
        tx.try_send(vec![2, 3]).unwrap();
        tx.try_send(vec![4]).unwrap();
        assert_eq!(drain_pending(&mut rx, vec![1]), vec![1, 2, 3, 4]);
    }

    #[test]
    fn drain_pending_returns_first_alone_when_queue_is_empty() {
        let (_tx, mut rx) = mpsc::channel::<Vec<u8>>(8);
        assert_eq!(drain_pending(&mut rx, vec![9]), vec![9]);
    }

    #[test]
    fn drain_pending_stops_at_the_batch_cap() {
        let (tx, mut rx) = mpsc::channel::<Vec<u8>>(8);
        tx.try_send(vec![1]).unwrap();
        let batch = drain_pending(&mut rx, vec![0; BATCH_CAP]);
        assert_eq!(batch.len(), BATCH_CAP); // queued chunk stays for the next batch
        assert_eq!(rx.try_recv().unwrap(), vec![1]);
    }
}
