use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// Holds the single active design watcher (Phase 1 shows one design card).
/// Dropping the watcher (set to None) stops it.
#[derive(Default)]
pub struct DesignWatcher(pub Mutex<Option<RecommendedWatcher>>);

/// True when a watcher event refers to the file we were asked to watch.
///
/// `notify` builds event paths by joining the watched directory *verbatim*, so
/// its separators follow whatever spelling the caller passed in — the front end
/// composes `<space folder>/designs/ui.design.json`, which on Windows yields a
/// mixed `C:\space/designs\ui.design.json`. Comparing those as strings never
/// matches; `Path` compares by component, so it does.
fn is_target(event_path: &Path, target: &Path) -> bool {
    event_path == target
}

/// Watch the directory of `path` and emit `design-changed` whenever that exact
/// file is created or modified. The payload echoes the caller's own spelling of
/// the path so the front end can match it with `===`.
#[tauri::command]
pub fn design_watch(app: AppHandle, path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let dir = target
        .parent()
        .ok_or("design path has no parent directory")?
        .to_path_buf();
    let emit_app = app.clone();
    let emit_path = path.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            if matches!(ev.kind, EventKind::Modify(_) | EventKind::Create(_))
                && ev.paths.iter().any(|p| is_target(p, &target))
            {
                let _ = emit_app.emit("design-changed", emit_path.clone());
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn matches_across_separator_spellings() {
        // The exact shape the front end produces on Windows vs. what notify emits.
        assert!(is_target(
            Path::new(r"C:\space/designs\ui.design.json"),
            Path::new(r"C:\space/designs/ui.design.json"),
        ));
    }

    #[test]
    fn does_not_match_a_sibling_design_file() {
        assert!(!is_target(
            Path::new(r"C:\space/designs/other.design.json"),
            Path::new(r"C:\space/designs/ui.design.json"),
        ));
    }

    /// End-to-end against the real notify backend: watching a directory spelled
    /// the way the front end spells it must still recognise the target file.
    #[test]
    fn notify_events_match_the_front_end_path() {
        let dir = tempfile::tempdir().unwrap();
        let designs = dir.path().join("designs");
        std::fs::create_dir_all(&designs).unwrap();
        // Mixed separators, exactly as `designPath()` composes them.
        let watched = format!("{}/designs", dir.path().to_string_lossy());
        let target = PathBuf::from(format!("{watched}/ui.design.json"));

        let (tx, rx) = mpsc::channel();
        let probe = target.clone();
        let mut w = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if let Ok(ev) = res {
                if ev.paths.iter().any(|p| is_target(p, &probe)) {
                    let _ = tx.send(());
                }
            }
        })
        .unwrap();
        w.watch(Path::new(&watched), RecursiveMode::NonRecursive)
            .unwrap();
        std::thread::sleep(Duration::from_millis(300));
        std::fs::write(&target, "{}").unwrap();

        assert!(
            rx.recv_timeout(Duration::from_secs(5)).is_ok(),
            "notify event did not match the front end's spelling of the design path",
        );
    }
}
