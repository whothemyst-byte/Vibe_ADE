use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, State};

use super::actor::{spawn, SpawnConfig};
use super::registry::{PtyCommand, PtyRegistry};

#[tauri::command]
pub async fn pty_spawn(
    app: AppHandle,
    registry: State<'_, PtyRegistry>,
    id: String,
    shell: String,
    cwd: Option<String>,
    rows: u16,
    cols: u16,
    command: Option<String>,
    on_data: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    if registry.contains(&id) {
        return Ok(()); // already running; idempotent
    }
    let handle = spawn(
        app,
        SpawnConfig { id: id.clone(), shell, cwd, rows, cols, command, on_data },
    )
    .map_err(|e| e.to_string())?;
    registry.insert(id, handle);
    Ok(())
}

#[tauri::command]
pub async fn pty_write(
    registry: State<'_, PtyRegistry>,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    if let Some(tx) = registry.sender(&id) {
        tx.send(PtyCommand::Write(data)).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn pty_resize(
    registry: State<'_, PtyRegistry>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    if let Some(tx) = registry.sender(&id) {
        tx.send(PtyCommand::Resize { rows, cols }).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn pty_kill(
    registry: State<'_, PtyRegistry>,
    id: String,
) -> Result<(), String> {
    if let Some(handle) = registry.remove(&id) {
        let _ = handle.cmd_tx.send(PtyCommand::Kill).await;
    }
    Ok(())
}
