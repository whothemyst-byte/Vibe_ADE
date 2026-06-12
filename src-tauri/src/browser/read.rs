use std::time::Duration;

use tauri::Webview;
use tokio::sync::oneshot;
use webview2_com::ExecuteScriptCompletedHandler;
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
use windows_core::HSTRING;

/// Runs `js` in the child webview via WebView2 ExecuteScript and returns the
/// JSON-encoded result string. 3s timeout so a hung page can't stall callers.
pub async fn execute_script(webview: Webview, js: &'static str) -> Result<String, String> {
    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    let script = HSTRING::from(js);
    webview
        .with_webview(move |pw| unsafe {
            let core: ICoreWebView2 = match pw.controller().CoreWebView2() {
                Ok(c) => c,
                Err(e) => {
                    let _ = tx.send(Err(e.to_string()));
                    return;
                }
            };
            let handler = ExecuteScriptCompletedHandler::create(Box::new(
                move |hr: windows_core::Result<()>, json: String| {
                    let _ = tx.send(hr.map(|_| json).map_err(|e| e.to_string()));
                    Ok(())
                },
            ));
            // On call failure the handler (owning tx) is dropped; the receiver
            // below surfaces that as "browser script was dropped".
            let _ = core.ExecuteScript(&script, &handler);
        })
        .map_err(|e| e.to_string())?;
    match tokio::time::timeout(Duration::from_secs(3), rx).await {
        Err(_) => Err("browser script timed out".into()),
        Ok(Err(_)) => Err("browser script was dropped".into()),
        Ok(Ok(r)) => r,
    }
}
