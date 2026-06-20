use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// Holds the single active design watcher (Phase 1 shows one design card).
/// Dropping the watcher (set to None) stops it.
#[derive(Default)]
pub struct DesignWatcher(pub Mutex<Option<RecommendedWatcher>>);

/// Watch the directory of `path` and emit `design-changed` (payload = changed
/// absolute path) whenever a `*.design.json` there is created or modified.
#[tauri::command]
pub fn design_watch(app: AppHandle, path: String) -> Result<(), String> {
    let dir = Path::new(&path)
        .parent()
        .ok_or("design path has no parent directory")?
        .to_path_buf();
    let emit_app = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            if matches!(ev.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                for p in ev.paths {
                    let s = p.to_string_lossy();
                    if s.ends_with(".design.json") {
                        let _ = emit_app.emit("design-changed", s.into_owned());
                    }
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    *app.state::<DesignWatcher>().0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn design_unwatch(app: AppHandle) -> Result<(), String> {
    *app.state::<DesignWatcher>().0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}
