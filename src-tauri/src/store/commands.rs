use std::fs;
use tauri::{AppHandle, Manager};

use super::atomic::write_atomic;
use super::paths::{index_path, thumb_path, wall_path};

/// Reject ids that could escape the spaces dir. Frontend ids are UUIDs, so this is
/// defense-in-depth against path traversal via a crafted id.
fn safe_id(id: &str) -> Result<(), String> {
    if !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        Ok(())
    } else {
        Err("invalid space id".to_string())
    }
}

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
pub fn space_load(app: AppHandle, id: String) -> Result<Option<String>, String> {
    safe_id(&id)?;
    let p = wall_path(&base(&app)?, &id);
    match fs::read_to_string(&p) {
        Ok(s) => Ok(Some(s)),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn space_save(app: AppHandle, id: String, json: String) -> Result<(), String> {
    safe_id(&id)?;
    write_atomic(&wall_path(&base(&app)?, &id), json.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn space_delete(app: AppHandle, id: String) -> Result<(), String> {
    safe_id(&id)?;
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
    safe_id(&id)?;
    write_atomic(&thumb_path(&base(&app)?, &id), &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn thumb_load(app: AppHandle, id: String) -> Result<Option<Vec<u8>>, String> {
    safe_id(&id)?;
    let p = thumb_path(&base(&app)?, &id);
    match fs::read(&p) {
        Ok(b) => Ok(Some(b)),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn presets_load(app: AppHandle) -> Result<Option<String>, String> {
    let p = super::paths::presets_path(&base(&app)?);
    match fs::read_to_string(&p) {
        Ok(s) => Ok(Some(s)),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn presets_save(app: AppHandle, json: String) -> Result<(), String> {
    write_atomic(&super::paths::presets_path(&base(&app)?), json.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_load(app: AppHandle) -> Result<Option<String>, String> {
    let p = super::paths::settings_path(&base(&app)?);
    match fs::read_to_string(&p) {
        Ok(s) => Ok(Some(s)),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn settings_save(app: AppHandle, json: String) -> Result<(), String> {
    write_atomic(&super::paths::settings_path(&base(&app)?), json.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tasks_load(app: AppHandle) -> Result<String, String> {
    let p = super::paths::tasks_path(&base(&app)?);
    match fs::read_to_string(&p) {
        Ok(s) => Ok(s),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok("[]".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn tasks_save(app: AppHandle, json: String) -> Result<(), String> {
    write_atomic(&super::paths::tasks_path(&base(&app)?), json.as_bytes()).map_err(|e| e.to_string())
}

/// True when `path` is an existing directory. Used to filter dropped folders
/// from loose files (drop only creates spaces from directories).
#[tauri::command]
pub fn is_dir(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}

/// One entry in a directory listing for the in-app file explorer.
#[derive(serde::Serialize)]
pub struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

/// List a directory's immediate children for the file-explorer tree.
/// Hidden entries (dot-prefixed) and common noise (node_modules, target, .git)
/// are skipped. Directories sort before files, each alphabetically (case-insensitive).
#[tauri::command]
pub fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    const SKIP: [&str; 3] = ["node_modules", "target", ".git"];
    let mut entries: Vec<DirEntry> = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || SKIP.contains(&name.as_str()) {
            continue;
        }
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        entries.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().into_owned(),
            is_dir,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Read a text file for the in-app viewer. Rejects files over 2 MiB so a stray
/// binary or huge log can't freeze the UI; bytes are decoded UTF-8 lossy.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    const MAX: u64 = 2 * 1024 * 1024;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > MAX {
        return Err("File is too large to preview (over 2 MB).".to_string());
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Write a design document to an arbitrary project path. Restricted to
/// `*.design.json` so this can never become a general file-write primitive.
/// Creates the parent directory (e.g. `designs/`) if it is missing.
#[tauri::command]
pub fn write_design_file(path: String, contents: String) -> Result<(), String> {
    if !path.ends_with(".design.json") {
        return Err("refusing to write a non-design file".to_string());
    }
    let p = std::path::Path::new(&path);
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    write_atomic(p, contents.as_bytes()).map_err(|e| e.to_string())
}

/// Read a `*.design.json` document with no size cap (designs can embed image
/// data-URLs and grow past the preview limit). Restricted to `.design.json` so
/// it cannot become a general file-read primitive.
#[tauri::command]
pub fn read_design_file(path: String) -> Result<String, String> {
    if !path.ends_with(".design.json") {
        return Err("refusing to read a non-design file".to_string());
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg(test)]
mod design_tests {
    use super::*;
    use std::fs;

    #[test]
    fn writes_a_design_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("login.design.json");
        write_design_file(p.to_string_lossy().into_owned(), "{}\n".to_string()).unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "{}\n");
    }

    #[test]
    fn rejects_non_design_paths() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("secrets.txt");
        let err = write_design_file(p.to_string_lossy().into_owned(), "x".to_string());
        assert!(err.is_err());
    }

    #[test]
    fn reads_a_design_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("ui.design.json");
        fs::write(&p, "{\"x\":1}\n").unwrap();
        let s = read_design_file(p.to_string_lossy().into_owned()).unwrap();
        assert_eq!(s, "{\"x\":1}\n");
    }

    #[test]
    fn read_rejects_non_design_paths() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("secrets.txt");
        assert!(read_design_file(p.to_string_lossy().into_owned()).is_err());
    }
}
