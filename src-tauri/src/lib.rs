mod pty;
mod store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(pty::registry::PtyRegistry::new())
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
            store::backgrounds::import_background,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
