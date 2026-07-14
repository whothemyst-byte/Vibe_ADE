// Agent canvas-control server (CNVS-parity package B).
//
// A loopback TcpListener bound at app start lets agents inside Vibe Space
// terminals inspect and control the wall through the generated `vibectl` CLI
// (VIBECTL_URL / VIBECTL_TOKEN are injected into every PTY). Each valid
// request is forwarded to the webview as a `control-request` event; the
// bridge (src/control/bridge.ts) executes it and answers via `control_reply`,
// which resolves the pending HTTP response.
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Head (request line + headers) size cap.
pub const MAX_HEAD: usize = 8 * 1024;
/// Body size cap (spec: 64KB).
pub const MAX_BODY: usize = 64 * 1024;

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn http_response(status: u16, body: &str) -> String {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        500 => "Internal Server Error",
        504 => "Gateway Timeout",
        _ => "",
    };
    format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

pub fn error_body(msg: &str) -> String {
    serde_json::json!({ "error": msg }).to_string()
}

/// Byte offset of the `\r\n\r\n` head terminator, if present.
pub fn find_head_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n")
}

/// Method + path from the request line ("GET /state HTTP/1.1").
fn request_line(head: &str) -> Option<(String, String)> {
    let mut it = head.lines().next()?.split_whitespace();
    Some((it.next()?.to_string(), it.next()?.to_string()))
}

/// Case-insensitive header lookup on the raw head block.
pub fn header_value(head: &str, name: &str) -> Option<String> {
    head.lines().skip(1).find_map(|line| {
        let (k, v) = line.split_once(':')?;
        if k.trim().eq_ignore_ascii_case(name) { Some(v.trim().to_string()) } else { None }
    })
}

/// (method, path) -> bridge verb. Query strings are ignored.
fn route(method: &str, path: &str) -> Option<&'static str> {
    let path = path.split('?').next().unwrap_or(path);
    match (method, path) {
        ("GET", "/state") => Some("state"),
        ("POST", "/browser") => Some("browser"),
        ("POST", "/terminal") => Some("terminal"),
        _ => None,
    }
}

/// Pure request validation: token, route, JSON body. Err is (status, body).
pub fn process_request(
    head: &str,
    body: &[u8],
    token: &str,
) -> Result<(String, serde_json::Value), (u16, String)> {
    let (method, path) = request_line(head).ok_or((400, error_body("malformed request")))?;
    if header_value(head, "x-vibe-token").as_deref() != Some(token) {
        return Err((401, error_body("missing or invalid token")));
    }
    let verb = route(&method, &path).ok_or((404, error_body("unknown route")))?;
    let args = if body.is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_slice(body).map_err(|_| (400, error_body("body is not valid JSON")))?
    };
    Ok((verb.to_string(), args))
}

/// How long a connection waits for the webview bridge before answering 504.
const REPLY_TIMEOUT: Duration = Duration::from_secs(10);

pub struct ControlInfo {
    pub port: u16,
    pub token: String,
    /// Directory holding vibectl.cmd / vibectl.ps1 / agent-guide.md.
    pub dir: PathBuf,
}

static CONTROL: OnceLock<ControlInfo> = OnceLock::new();

pub fn control_info() -> Option<&'static ControlInfo> {
    CONTROL.get()
}

pub struct Reply {
    pub ok: bool,
    pub body: String,
}

/// Pending HTTP responses keyed by request id; each connection thread parks on
/// its receiver until `control_reply` resolves it or REPLY_TIMEOUT fires.
static PENDING: OnceLock<parking_lot::Mutex<HashMap<u64, mpsc::Sender<Reply>>>> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn pending() -> &'static parking_lot::Mutex<HashMap<u64, mpsc::Sender<Reply>>> {
    PENDING.get_or_init(|| parking_lot::Mutex::new(HashMap::new()))
}

#[derive(Clone, serde::Serialize)]
struct ControlRequest {
    id: u64,
    verb: String,
    args: serde_json::Value,
}

/// Reads one HTTP request: head until CRLFCRLF, then Content-Length body bytes.
fn read_request(stream: &mut TcpStream) -> Option<(String, Vec<u8>)> {
    let mut buf: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 4096];
    let head_end = loop {
        if let Some(i) = find_head_end(&buf) {
            break i;
        }
        if buf.len() > MAX_HEAD {
            return None;
        }
        let n = stream.read(&mut chunk).ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&chunk[..n]);
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).into_owned();
    let want: usize = header_value(&head, "content-length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    if want > MAX_BODY {
        return None;
    }
    let mut body: Vec<u8> = buf[head_end + 4..].to_vec();
    while body.len() < want {
        let n = stream.read(&mut chunk).ok()?;
        if n == 0 {
            return None;
        }
        body.extend_from_slice(&chunk[..n]);
    }
    body.truncate(want);
    Some((head, body))
}

fn respond(mut stream: TcpStream, status: u16, body: &str) {
    let _ = stream.write_all(http_response(status, body).as_bytes());
    let _ = stream.flush();
}

fn handle_conn(app: AppHandle, mut stream: TcpStream, token: &str) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let Some((head, body)) = read_request(&mut stream) else {
        return respond(stream, 400, &error_body("malformed request"));
    };
    let (verb, args) = match process_request(&head, &body, token) {
        Ok(v) => v,
        Err((status, body)) => return respond(stream, status, &body),
    };
    let (tx, rx) = mpsc::channel();
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    pending().lock().insert(id, tx);
    if app.emit("control-request", ControlRequest { id, verb, args }).is_err() {
        pending().lock().remove(&id);
        return respond(stream, 500, &error_body("app event channel failed"));
    }
    match rx.recv_timeout(REPLY_TIMEOUT) {
        Ok(r) => respond(stream, if r.ok { 200 } else { 500 }, &r.body),
        Err(_) => {
            pending().lock().remove(&id);
            respond(stream, 504, &error_body("app did not respond"));
        }
    }
}

/// Resolves a pending request from the webview bridge; false if it already
/// timed out. `body` arrives pre-serialized (JSON.stringify in the bridge).
#[tauri::command]
pub fn control_reply(id: u64, ok: bool, body: String) -> bool {
    match pending().lock().remove(&id) {
        Some(tx) => tx.send(Reply { ok, body }).is_ok(),
        None => false,
    }
}

/// Binds the loopback server, stores ControlInfo, and spawns the accept loop.
/// Called once from app setup; failure is non-fatal (agents just lack vibectl).
pub fn start(app: AppHandle) -> anyhow::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    let mut raw = [0u8; 32];
    getrandom::getrandom(&mut raw).map_err(|e| anyhow::anyhow!("getrandom: {e}"))?;
    let token = hex(&raw);
    let dir = app.path().app_data_dir()?.join("vibectl");
    let _ = CONTROL.set(ControlInfo { port, token: token.clone(), dir });
    std::thread::spawn(move || {
        for conn in listener.incoming() {
            let Ok(stream) = conn else { continue };
            let app = app.clone();
            let token = token.clone();
            std::thread::spawn(move || handle_conn(app, stream, &token));
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "secret";

    fn head(lines: &[&str]) -> String {
        lines.join("\r\n")
    }

    #[test]
    fn hex_encodes_lowercase() {
        assert_eq!(hex(&[0x00, 0xab, 0x1f]), "00ab1f");
    }

    #[test]
    fn response_carries_status_reason_and_length() {
        let r = http_response(401, "{}");
        assert!(r.starts_with("HTTP/1.1 401 Unauthorized\r\n"));
        assert!(r.contains("Content-Length: 2\r\n"));
        assert!(r.ends_with("\r\n\r\n{}"));
    }

    #[test]
    fn find_head_end_locates_the_blank_line() {
        assert_eq!(find_head_end(b"GET / HTTP/1.1\r\nA: b\r\n\r\nBODY"), Some(20));
        assert_eq!(find_head_end(b"GET / HTTP/1.1\r\nA: b"), None);
    }

    #[test]
    fn header_lookup_is_case_insensitive() {
        let h = head(&["GET /state HTTP/1.1", "X-Vibe-Token: abc", "Content-Length: 5"]);
        assert_eq!(header_value(&h, "x-vibe-token").as_deref(), Some("abc"));
        assert_eq!(header_value(&h, "CONTENT-LENGTH").as_deref(), Some("5"));
        assert_eq!(header_value(&h, "missing"), None);
    }

    #[test]
    fn rejects_a_missing_or_wrong_token_with_401() {
        let no_token = head(&["GET /state HTTP/1.1", "Host: x"]);
        assert_eq!(process_request(&no_token, b"", TOKEN).unwrap_err().0, 401);
        let bad = head(&["GET /state HTTP/1.1", "X-Vibe-Token: nope"]);
        assert_eq!(process_request(&bad, b"", TOKEN).unwrap_err().0, 401);
    }

    #[test]
    fn accepts_a_valid_state_request() {
        let h = head(&["GET /state HTTP/1.1", "X-Vibe-Token: secret"]);
        let (verb, args) = process_request(&h, b"", TOKEN).unwrap();
        assert_eq!(verb, "state");
        assert_eq!(args, serde_json::json!({}));
    }

    #[test]
    fn routes_all_three_verbs_and_404s_the_rest() {
        for (m, p, v) in [
            ("GET", "/state", "state"),
            ("POST", "/browser", "browser"),
            ("POST", "/terminal", "terminal"),
        ] {
            let h = head(&[&format!("{m} {p} HTTP/1.1"), "X-Vibe-Token: secret"]);
            assert_eq!(process_request(&h, b"", TOKEN).unwrap().0, v);
        }
        let h = head(&["GET /browser HTTP/1.1", "X-Vibe-Token: secret"]);
        assert_eq!(process_request(&h, b"", TOKEN).unwrap_err().0, 404);
        let h = head(&["POST /nope HTTP/1.1", "X-Vibe-Token: secret"]);
        assert_eq!(process_request(&h, b"", TOKEN).unwrap_err().0, 404);
    }

    #[test]
    fn control_reply_resolves_a_pending_request() {
        let (tx, rx) = std::sync::mpsc::channel();
        pending().lock().insert(42, tx);
        assert!(control_reply(42, true, "{\"x\":1}".into()));
        let r = rx.recv().unwrap();
        assert!(r.ok);
        assert_eq!(r.body, "{\"x\":1}");
    }

    #[test]
    fn control_reply_is_false_for_unknown_or_timed_out_ids() {
        assert!(!control_reply(999_999, true, "{}".into()));
    }

    #[test]
    fn parses_json_bodies_and_400s_malformed_ones() {
        let h = head(&["POST /browser HTTP/1.1", "X-Vibe-Token: secret"]);
        let (_, args) = process_request(&h, br#"{"url":"http://localhost:8000"}"#, TOKEN).unwrap();
        assert_eq!(args["url"], "http://localhost:8000");
        assert_eq!(process_request(&h, b"{oops", TOKEN).unwrap_err().0, 400);
    }
}
