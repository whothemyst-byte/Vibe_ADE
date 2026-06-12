use serde::Serialize;
use tauri::webview::WebviewBuilder;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, Url, WebviewUrl};

use super::{BrowserState, LABEL};

#[derive(Clone, Serialize)]
struct NavPayload {
    url: String,
}

fn parse_url(url: &str) -> Result<Url, String> {
    Url::parse(url).map_err(|e| format!("invalid url \"{url}\": {e}"))
}

#[tauri::command]
pub async fn browser_open(
    app: AppHandle,
    state: State<'_, BrowserState>,
    url: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    zoom: f64,
) -> Result<(), String> {
    let parsed = parse_url(&url)?;
    // Already open (e.g. webview survived a fast close/open): just navigate.
    if let Some(wv) = state.0.lock().clone() {
        return wv.navigate(parsed).map_err(|e| e.to_string());
    }
    let window = app.get_window("main").ok_or("main window not found")?;
    let emitter = app.clone();
    let builder = WebviewBuilder::new(LABEL, WebviewUrl::External(parsed)).on_navigation(move |u| {
        let _ = emitter.emit("browser://nav", NavPayload { url: u.to_string() });
        true
    });
    let webview = window
        .add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    let _ = webview.set_zoom(zoom);
    // Created hidden; the frontend reveals it after its first rect sync.
    let _ = webview.hide();
    *state.0.lock() = Some(webview);
    Ok(())
}

#[tauri::command]
pub async fn browser_navigate(state: State<'_, BrowserState>, url: String) -> Result<(), String> {
    let parsed = parse_url(&url)?;
    let wv = state.0.lock().clone().ok_or("no browser open")?;
    wv.navigate(parsed).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_back(state: State<'_, BrowserState>) -> Result<(), String> {
    let wv = state.0.lock().clone().ok_or("no browser open")?;
    wv.eval("history.back()").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_reload(state: State<'_, BrowserState>) -> Result<(), String> {
    let wv = state.0.lock().clone().ok_or("no browser open")?;
    wv.eval("location.reload()").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_set_rect(
    state: State<'_, BrowserState>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    zoom: f64,
) -> Result<(), String> {
    let wv = state.0.lock().clone().ok_or("no browser open")?;
    wv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    wv.set_size(LogicalSize::new(w.max(1.0), h.max(1.0)))
        .map_err(|e| e.to_string())?;
    wv.set_zoom(zoom).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_set_visible(
    state: State<'_, BrowserState>,
    visible: bool,
) -> Result<(), String> {
    let wv = state.0.lock().clone().ok_or("no browser open")?;
    if visible {
        wv.show().map_err(|e| e.to_string())
    } else {
        wv.hide().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn browser_close(state: State<'_, BrowserState>) -> Result<(), String> {
    if let Some(wv) = state.0.lock().take() {
        wv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse_url;

    #[test]
    fn parse_url_accepts_http_and_rejects_garbage() {
        assert!(parse_url("https://localhost:5173/").is_ok());
        assert!(parse_url("https://github.com/a/b?c=1").is_ok());
        assert!(parse_url("not a url").is_err());
    }
}
