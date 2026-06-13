// Loopback listener for the external-browser OAuth handoff.
//
// `start_oauth_loopback` binds an OS-assigned port on 127.0.0.1 and returns it.
// The hosted sign-in page redirects the browser to http://127.0.0.1:<port>/?ticket=…&state=…
// once it has minted a Clerk sign-in token. We accept exactly one request, reply with a
// small "you can close this tab" page, and emit an `oauth-callback` event to the frontend.
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
struct OauthCallback {
    ticket: String,
    state: String,
}

/// Minimal percent-decode (also turns '+' into space) for the query-string values.
fn percent_decode(s: &str) -> String {
    let src = s.replace('+', " ");
    let bytes = src.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&src[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Read a single query parameter out of a raw `a=b&c=d` query string.
fn query_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let mut it = pair.splitn(2, '=');
        if it.next()? != key {
            return None;
        }
        Some(percent_decode(it.next().unwrap_or("")))
    })
}

#[tauri::command]
pub fn start_oauth_loopback(app: AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(300);
        loop {
            if Instant::now() >= deadline {
                break;
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]);
                    let query = req
                        .lines()
                        .next()
                        .and_then(|line| line.split_whitespace().nth(1))
                        .and_then(|path| path.splitn(2, '?').nth(1))
                        .unwrap_or("");
                    let ticket = query_param(query, "ticket").unwrap_or_default();
                    let state = query_param(query, "state").unwrap_or_default();

                    let body = "<!doctype html><meta charset=utf-8><title>Vibe Space</title>\
<body style=\"font-family:system-ui;background:#12110f;color:#f3eee5;display:grid;place-items:center;height:100vh;margin:0\">\
<div style=\"text-align:center\"><h1 style=\"font-family:Georgia,serif;font-weight:400\">Signed in</h1>\
<p style=\"color:#b1a692\">You can close this tab and return to Vibe Space.</p></div></body>";
                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(resp.as_bytes());
                    let _ = stream.flush();

                    if !ticket.is_empty() {
                        let _ = app.emit("oauth-callback", OauthCallback { ticket, state });
                    }
                    break;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(200));
                }
                Err(_) => break,
            }
        }
    });

    Ok(port)
}
