pub mod commands;
#[cfg(windows)]
pub mod read;

use parking_lot::Mutex;
use tauri::Webview;

/// Label of the single child webview; never granted IPC capabilities.
pub const LABEL: &str = "wall-browser";

#[derive(Default)]
pub struct BrowserState(pub Mutex<Option<Webview>>);
