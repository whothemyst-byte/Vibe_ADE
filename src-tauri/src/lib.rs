mod browser;
mod pty;
mod store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(pty::registry::PtyRegistry::new())
        .manage(browser::BrowserState::default())
        .invoke_handler(tauri::generate_handler![
            pty::commands::pty_spawn,
            pty::commands::pty_write,
            pty::commands::pty_resize,
            pty::commands::pty_kill,
            store::commands::index_load,
            store::commands::index_save,
            store::commands::wall_load,
            store::commands::wall_save,
            store::commands::wall_delete,
            store::commands::thumb_save,
            store::commands::thumb_load,
            store::commands::presets_load,
            store::commands::presets_save,
            store::commands::settings_load,
            store::commands::settings_save,
            store::commands::tasks_load,
            store::commands::tasks_save,
            store::backgrounds::import_background,
            browser::commands::browser_open,
            browser::commands::browser_navigate,
            browser::commands::browser_back,
            browser::commands::browser_reload,
            browser::commands::browser_set_rect,
            browser::commands::browser_set_visible,
            browser::commands::browser_close,
            browser::commands::browser_read,
            browser::commands::browser_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
