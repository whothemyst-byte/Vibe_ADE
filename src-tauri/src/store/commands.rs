use std::fs;
use tauri::{AppHandle, Manager};

use super::atomic::write_atomic;
use super::paths::{index_path, thumb_path, wall_path};

/// App-data base dir, created if missing.
fn base(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn index_load(app: AppHandle) -> Result<String, String> {
    let p = index_path(&base(&app)?);
    match fs::read_to_string(&p) {
        Ok(s) => Ok(s),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok("[]".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn index_save(app: AppHandle, json: String) -> Result<(), String> {
    write_atomic(&index_path(&base(&app)?), json.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn wall_load(app: AppHandle, id: String) -> Result<Option<String>, String> {
    let p = wall_path(&base(&app)?, &id);
    match fs::read_to_string(&p) {
        Ok(s) => Ok(Some(s)),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn wall_save(app: AppHandle, id: String, json: String) -> Result<(), String> {
    write_atomic(&wall_path(&base(&app)?, &id), json.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn wall_delete(app: AppHandle, id: String) -> Result<(), String> {
    let b = base(&app)?;
    for p in [wall_path(&b, &id), thumb_path(&b, &id)] {
        if let Err(e) = fs::remove_file(&p) {
            if e.kind() != std::io::ErrorKind::NotFound {
                return Err(e.to_string());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn thumb_save(app: AppHandle, id: String, bytes: Vec<u8>) -> Result<(), String> {
    write_atomic(&thumb_path(&base(&app)?, &id), &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn thumb_load(app: AppHandle, id: String) -> Result<Option<Vec<u8>>, String> {
    let p = thumb_path(&base(&app)?, &id);
    match fs::read(&p) {
        Ok(b) => Ok(Some(b)),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
