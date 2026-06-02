use anyhow::{Context, Result};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::Arc;
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
}

pub fn data_channel(id: &str) -> String {
    format!("pty://data/{id}")
}

pub fn exit_channel(id: &str) -> String {
    format!("pty://exit/{id}")
}

/// Opens a PTY, spawns the shell, and wires reader + command loop.
/// Raw bytes are emitted to `pty://data/<id>`; exit to `pty://exit/<id>`.
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

    // Reader thread: blocking read -> emit raw bytes; emit exit on EOF.
    let reader_app = app.clone();
    let id = cfg.id.clone();
    std::thread::spawn(move || {
        let mut reader = {
            let mut guard = reader_master.lock();
            match guard.try_clone_reader() {
                Ok(r) => r,
                Err(_) => return,
            }
        };
        let data_ch = data_channel(&id);
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let bytes = buf[..n].to_vec();
                    if reader_app.emit(&data_ch, bytes).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = reader_app.emit(&exit_channel(&id), ());
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
    fn channels_are_namespaced_by_id() {
        assert_eq!(data_channel("abc"), "pty://data/abc");
        assert_eq!(exit_channel("abc"), "pty://exit/abc");
    }
}
