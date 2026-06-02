use std::fs;
use tauri::{AppHandle, Manager};

use super::paths::backgrounds_dir;

/// Copies the file at `src_path` into app-data/backgrounds/<dest_name> and returns
/// the absolute destination path.
#[tauri::command]
pub fn import_background(app: AppHandle, src_path: String, dest_name: String) -> Result<String, String> {
    // dest_name is "<uuid>.<ext>" from the frontend; reject anything that could
    // escape the backgrounds dir.
    if dest_name.is_empty()
        || dest_name.contains('/')
        || dest_name.contains('\\')
        || dest_name.contains("..")
    {
        return Err("invalid background name".to_string());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dest_dir = backgrounds_dir(&dir);
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest = dest_dir.join(&dest_name);
    fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}
