mod browser;
mod oauth;
mod pty;
mod store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Focus the existing window; the deep-link plugin re-emits the URL via onOpenUrl.
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register("vibespace");
            }
            Ok(())
        })
        .manage(pty::registry::PtyRegistry::new())
        .manage(browser::BrowserState::default())
        .invoke_handler(tauri::generate_handler![
            pty::commands::pty_spawn,
            pty::commands::pty_write,
            pty::commands::pty_resize,
            pty::commands::pty_kill,
            store::commands::index_load,
            store::commands::index_save,
            store::commands::space_load,
            store::commands::space_save,
            store::commands::space_delete,
            store::commands::thumb_save,
            store::commands::thumb_load,
            store::commands::presets_load,
            store::commands::presets_save,
            store::commands::settings_load,
            store::commands::settings_save,
            store::commands::tasks_load,
            store::commands::tasks_save,
            store::commands::is_dir,
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
            oauth::start_oauth_loopback,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
