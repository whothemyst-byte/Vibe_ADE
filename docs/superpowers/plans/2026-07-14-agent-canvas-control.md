# Agent Canvas Control Implementation Plan (CNVS-parity Package B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agents running inside Vibe Space terminals can inspect and control the wall themselves — read a JSON wall snapshot, open/navigate the wall browser, and spawn terminal nodes — via a `vibectl` CLI backed by a token-authenticated loopback control server in the Tauri process.

**Architecture:** A Rust loopback HTTP server (`src-tauri/src/control.rs`, OS-assigned port, per-run random token) forwards each valid request as a `control-request` event to the webview; a small allowlisted bridge (`src/control/bridge.ts`) executes it against the card store / browser actions / the `open_terminal` Vibe command and answers via a `control_reply` Tauri command that resolves the pending HTTP response. A generated CLI bundle (`vibectl.cmd` → `vibectl.ps1` + `agent-guide.md`) lands in app-data and is exposed to every PTY through injected env vars (`VIBECTL_URL`, `VIBECTL_TOKEN`, `VIBE_AGENT_GUIDE`, prepended `PATH`).

**Tech Stack:** Rust (std TcpListener + threads, serde_json, getrandom, parking_lot — all but getrandom already in the tree), Tauri v2 events/commands, TypeScript + zustand + vitest, PowerShell 5.1 (`Invoke-RestMethod`) for the CLI.

**Spec:** `docs/superpowers/specs/2026-07-13-agent-canvas-control-design.md`

**Two deliberate deviations from the spec (both simplifications, functionally equivalent):**

1. **CLI transport:** the spec says a batch script wrapping `curl.exe`. Building JSON bodies with correct quoting in pure batch is unreliable (`--run "npm run dev"` would need hand-rolled escaping). Instead `vibectl.cmd` is a one-line shim into `vibectl.ps1`, which uses `ConvertTo-Json` + `Invoke-RestMethod` — always present on Windows 10+, correct quoting for free. Same commands, same HTTP protocol.
2. **`terminal --run` delivery:** the spec says "find the newest terminal and `sendToSession(id, run, true)`". That races: right after `open_terminal` resolves, the card exists but its xterm session and PTY do not (they spawn on React mount + async `spawnPty`), so the paste would be dropped. Instead the run command rides the **existing proven path** presets use: `SpawnConfig.command`, typed into the shell by the Rust actor after its 700 ms warm-up. `open_terminal` gains an optional `run` arg and `TerminalCard` an optional non-persisted `command` field.

## Global Constraints

- **Dirty-tree discipline:** the working tree carries pre-existing uncommitted work (titlebar removal + theme changes, ~22 files) that overlaps `src-tauri/src/lib.rs`, `src/App.tsx`, `src/wall/cardStore.ts`, `src-tauri/Cargo.toml`. Task 0 resolves this BEFORE any Package B commit. Never `git add -A` / `git add .` — stage only the files named in each task's commit step.
- **Branch:** work lands directly on `V1.0.0` (repo convention). Commit per task. Do not push until the user says so.
- **Never restart the user's running Vibe Space instance** — Claude often runs inside its terminal. App verification uses a separate dev instance (`npm run app`, app-data dir `com.admin.vibe-space-dev`) and cleans up after itself.
- **Server security (spec §5):** bind `127.0.0.1` only; 32-byte random hex token per app run; token never logged; `browser` verb accepts only `http(s)` URLs; request body cap 64 KB; malformed JSON → 400.
- **Header name:** `X-Vibe-Token`. Env vars: `VIBECTL_URL`, `VIBECTL_TOKEN`, `VIBE_AGENT_GUIDE`. Event: `control-request`. Command: `control_reply`. Verbs: `state`, `browser`, `terminal`.
- **Error bodies (spec):** 401 `{"error":"missing or invalid token"}`; 404 `{"error":"unknown route"}`; 400 `{"error":"body is not valid JSON"}`; 504 `{"error":"app did not respond"}`; no wall open → HTTP 200 with `{"error":"no space is open"}` (except `state`, which answers `{"wall":null,...}`).
- **Testing gates before every commit:** `npx tsc --noEmit -p tsconfig.json` and `npx vitest run` for TS tasks; `cargo test` (run inside `src-tauri/`) for Rust tasks. Piping vitest output masks its exit code — check `$?` separately.
- **Style:** match existing file style (comment density like `oauth.rs` / `sessions.ts`); YAGNI; only the three verbs — the bridge must NOT expose the whole Vibe command registry.
- After all code changes land: `graphify update .`

---

## Task 0: Untangle the pre-existing working-tree changes

**Files:** none created — this is a git-hygiene gate.

The tree already contains an unrelated uncommitted change set (custom-titlebar removal: `D src-tauri/src/titlebar.rs`, edits to `lib.rs`, `App.tsx`, `themes.ts`, `gridLayout.ts`, `Cargo.toml`, …). Package B edits four of those same files; committing them per-task would silently fold the titlebar work into Package B commits.

- [ ] **Step 1: Confirm the user's choice** (recorded at plan approval). The two sane options:
  - **A (expected):** commit the pre-existing work first as its own commit:
    ```bash
    git add -A
    git commit -m "refactor(chrome): drop custom titlebar module; theme + grid layout adjustments (pre-package-B working tree)"
    ```
  - **B:** the user parks it themselves (their own commit or stash) before Task 1 starts.
- [ ] **Step 2: Verify the tree is clean**

Run: `git status --short`
Expected: empty output (only then may Task 1 begin).

## Task 1: Rust request core — parsing, routing, token check (pure logic)

**Files:**
- Create: `src-tauri/src/control.rs`
- Modify: `src-tauri/Cargo.toml` (add `getrandom = "0.2"` under `[dependencies]`)
- Modify: `src-tauri/src/lib.rs` (add `mod control;` only — server wiring is Task 2)
- Test: inline `#[cfg(test)] mod tests` in `control.rs`

**Interfaces:**
- Consumes: nothing (pure functions).
- Produces (used by Task 2): `hex(bytes: &[u8]) -> String`, `http_response(status: u16, body: &str) -> String`, `error_body(msg: &str) -> String`, `header_value(head: &str, name: &str) -> Option<String>`, `find_head_end(buf: &[u8]) -> Option<usize>`, `process_request(head: &str, body: &[u8], token: &str) -> Result<(String, serde_json::Value), (u16, String)>`, constants `MAX_HEAD`, `MAX_BODY`.

- [ ] **Step 1: Add the dependency**

In `src-tauri/Cargo.toml`, after `notify = "6"`:

```toml
getrandom = "0.2"
```

- [ ] **Step 2: Write the failing tests**

Create `src-tauri/src/control.rs` with only the test module first (functions referenced don't exist yet):

```rust
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
        for (m, p, v) in [("GET", "/state", "state"), ("POST", "/browser", "browser"), ("POST", "/terminal", "terminal")] {
            let h = head(&[&format!("{m} {p} HTTP/1.1"), "X-Vibe-Token: secret"]);
            assert_eq!(process_request(&h, b"", TOKEN).unwrap().0, v);
        }
        let h = head(&["GET /browser HTTP/1.1", "X-Vibe-Token: secret"]);
        assert_eq!(process_request(&h, b"", TOKEN).unwrap_err().0, 404);
        let h = head(&["POST /nope HTTP/1.1", "X-Vibe-Token: secret"]);
        assert_eq!(process_request(&h, b"", TOKEN).unwrap_err().0, 404);
    }

    #[test]
    fn parses_json_bodies_and_400s_malformed_ones() {
        let h = head(&["POST /browser HTTP/1.1", "X-Vibe-Token: secret"]);
        let (_, args) = process_request(&h, br#"{"url":"http://localhost:8000"}"#, TOKEN).unwrap();
        assert_eq!(args["url"], "http://localhost:8000");
        assert_eq!(process_request(&h, b"{oops", TOKEN).unwrap_err().0, 400);
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run (from `src-tauri/`): `cargo test control::`
Expected: compile error — `hex`, `http_response`, etc. not found.

- [ ] **Step 4: Write the implementation** (above the test module in `control.rs`):

```rust
// Agent canvas-control server (CNVS-parity package B).
//
// A loopback TcpListener bound at app start lets agents inside Vibe Space
// terminals inspect and control the wall through the generated `vibectl` CLI
// (VIBECTL_URL / VIBECTL_TOKEN are injected into every PTY). Each valid
// request is forwarded to the webview as a `control-request` event; the
// bridge (src/control/bridge.ts) executes it and answers via `control_reply`,
// which resolves the pending HTTP response.

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
```

In `src-tauri/src/lib.rs`, add `mod control;` after `mod browser;`. Add `#![allow(dead_code)]`? **No** — the pub items are referenced by tests; if `cargo check` warns about unused items at this stage that's acceptable until Task 2 wires them.

- [ ] **Step 5: Run tests to verify they pass**

Run (from `src-tauri/`): `cargo test control::`
Expected: 8 passed.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/control.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(control): request parsing, routing and token check for the canvas-control server"
```

## Task 2: Control server — listener, pending replies, `control_reply`, wiring

**Files:**
- Modify: `src-tauri/src/control.rs` (append server section)
- Modify: `src-tauri/src/lib.rs` (call `control::start` in setup; register `control::control_reply`)
- Test: inline tests in `control.rs`

**Interfaces:**
- Consumes: Task 1's pure functions.
- Produces:
  - `pub struct ControlInfo { pub port: u16, pub token: String, pub dir: std::path::PathBuf }`
  - `pub fn control_info() -> Option<&'static ControlInfo>` (used by Task 4's env injection)
  - `#[tauri::command] pub fn control_reply(id: u64, ok: bool, body: String) -> bool` (invoked by Task 6's bridge; `body` is a pre-serialized JSON string)
  - `pub fn start(app: tauri::AppHandle) -> anyhow::Result<()>` (called once from lib.rs setup)
  - Webview event `control-request` with payload `{ id: u64, verb: String, args: serde_json::Value }`

- [ ] **Step 1: Write the failing tests** (append inside the existing `mod tests`):

```rust
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `src-tauri/`): `cargo test control::`
Expected: compile error — `pending`, `control_reply` not found.

- [ ] **Step 3: Write the implementation** (append to `control.rs`, above tests):

```rust
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

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
```

In `src-tauri/src/lib.rs`:

1. Inside the existing `.setup(|app| { ... })` closure, before `Ok(())`:

```rust
            if let Err(e) = control::start(app.handle().clone()) {
                eprintln!("canvas-control server failed to start: {e}");
            }
```

2. In `invoke_handler`, after `oauth::start_oauth_loopback,`:

```rust
            control::control_reply,
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `src-tauri/`): `cargo test control::`
Expected: 10 passed (Task 1's 8 + these 2). Also run `cargo check` — no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/control.rs src-tauri/src/lib.rs
git commit -m "feat(control): loopback control server with pending-reply map and control_reply command"
```

## Task 3: CLI bundle — `vibectl.cmd`, `vibectl.ps1`, `agent-guide.md`

**Files:**
- Modify: `src-tauri/src/control.rs` (append CLI-bundle section; call from `start`)
- Test: inline tests in `control.rs` (uses existing `tempfile` dev-dependency)

**Interfaces:**
- Consumes: `ControlInfo.dir` from Task 2.
- Produces: `pub fn write_cli_files(dir: &std::path::Path) -> anyhow::Result<()>`; on disk `<app-data>/vibectl/{vibectl.cmd, vibectl.ps1, agent-guide.md}`.

- [ ] **Step 1: Write the failing tests** (append inside `mod tests`):

```rust
    #[test]
    fn writes_the_cli_bundle() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("vibectl");
        write_cli_files(&dir).unwrap();
        let cmd = std::fs::read_to_string(dir.join("vibectl.cmd")).unwrap();
        let ps1 = std::fs::read_to_string(dir.join("vibectl.ps1")).unwrap();
        let guide = std::fs::read_to_string(dir.join("agent-guide.md")).unwrap();
        assert!(cmd.contains("vibectl.ps1"));
        assert!(ps1.contains("/state") && ps1.contains("X-Vibe-Token") && ps1.contains("--run"));
        assert!(guide.contains("vibectl terminal --run"));
    }

    #[test]
    fn rewrites_heal_edited_files() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("vibectl");
        write_cli_files(&dir).unwrap();
        std::fs::write(dir.join("vibectl.ps1"), "broken").unwrap();
        write_cli_files(&dir).unwrap();
        assert!(std::fs::read_to_string(dir.join("vibectl.ps1")).unwrap().contains("/state"));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `src-tauri/`): `cargo test control::`
Expected: compile error — `write_cli_files` not found.

- [ ] **Step 3: Write the implementation** (append to `control.rs`):

```rust
// ---- generated CLI bundle -------------------------------------------------
// vibectl.cmd is the PATH entry point (PATHEXT resolves .cmd, not .ps1); it
// delegates to vibectl.ps1, which builds JSON with ConvertTo-Json so quoting
// in `--run "npm run dev"` can never break. Files are rewritten every launch.

const VIBECTL_CMD: &str = "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0vibectl.ps1\" %*\r\n";

const VIBECTL_PS1: &str = r#"# vibectl - control the Vibe Space canvas from an agent terminal.
# VIBECTL_URL / VIBECTL_TOKEN are injected into every Vibe Space terminal.
# NOTE: plain param() only - a [Parameter()] attribute would make this an
# advanced script, which rejects unbound args instead of passing them to $args.
param([string]$Verb = "")

$usage = @"
vibectl - control the Vibe Space canvas from an agent terminal

Usage:
  vibectl state                              Wall snapshot as JSON
  vibectl browser <url>                      Open/navigate the wall browser (http/https only)
  vibectl terminal [--preset <name>] [--run "<cmd>"]
                                             Spawn a terminal node on the wall; --run types
                                             the command into it (use for dev servers)
"@

if (-not $env:VIBECTL_URL -or -not $env:VIBECTL_TOKEN) {
  Write-Output "vibectl: VIBECTL_URL/VIBECTL_TOKEN are not set - run this inside a Vibe Space terminal."
  exit 1
}

function Invoke-Vibe([string]$Method, [string]$Route, $BodyObj) {
  $params = @{
    Method  = $Method
    Uri     = "$env:VIBECTL_URL$Route"
    Headers = @{ "X-Vibe-Token" = $env:VIBECTL_TOKEN }
  }
  if ($null -ne $BodyObj) {
    $params.ContentType = "application/json"
    $params.Body = ($BodyObj | ConvertTo-Json -Compress)
  }
  try {
    Invoke-RestMethod @params | ConvertTo-Json -Compress -Depth 8
  } catch {
    if ($_.ErrorDetails.Message) { Write-Output $_.ErrorDetails.Message }
    else { Write-Output "vibectl: $($_.Exception.Message)" }
    exit 1
  }
}

switch ($Verb) {
  "state" { Invoke-Vibe "GET" "/state" $null }
  "browser" {
    if (-not $args[0]) { Write-Output $usage; exit 1 }
    Invoke-Vibe "POST" "/browser" @{ url = "$($args[0])" }
  }
  "terminal" {
    $body = @{}
    for ($i = 0; $i -lt $args.Count; $i++) {
      switch ($args[$i]) {
        "--preset" { $i++; $body.preset = "$($args[$i])" }
        "--run"    { $i++; $body.run = "$($args[$i])" }
        default    { Write-Output $usage; exit 1 }
      }
    }
    Invoke-Vibe "POST" "/terminal" $body
  }
  default { Write-Output $usage; if ($Verb) { exit 1 } }
}
"#;

const AGENT_GUIDE: &str = r#"# Vibe Space canvas control (vibectl)

You are running inside a Vibe Space terminal. The `vibectl` CLI (already on
PATH) lets you inspect and control the canvas around you.

## Commands

- `vibectl state` - JSON snapshot of the wall: open terminals (agent names +
  presets), the browser card, and a summary line.
- `vibectl browser <url>` - open the wall's browser (or navigate it) to an
  http(s) URL, e.g. `vibectl browser http://localhost:5173`.
- `vibectl terminal [--preset <name>] [--run "<command>"]` - spawn a new
  terminal node on the wall. `--preset` picks an agent preset by name
  (e.g. `claude`); omit it for a plain shell. `--run` types the command into
  the new terminal once it starts.

## Rules

- **Never run dev servers or watchers in your own terminal.** Use
  `vibectl terminal --run "<cmd>"` so they get their own node on the canvas
  and your terminal stays free for reasoning and edits.
- Only http/https URLs open in the browser.
- Quote --run commands: `vibectl terminal --run "npm run dev"`.
"#;

/// Writes the CLI bundle; rewritten every launch to heal edits.
pub fn write_cli_files(dir: &std::path::Path) -> anyhow::Result<()> {
    std::fs::create_dir_all(dir)?;
    std::fs::write(dir.join("vibectl.cmd"), VIBECTL_CMD)?;
    std::fs::write(dir.join("vibectl.ps1"), VIBECTL_PS1)?;
    std::fs::write(dir.join("agent-guide.md"), AGENT_GUIDE)?;
    Ok(())
}
```

Then wire it into `start` — after the `CONTROL.set(...)` line, insert:

```rust
    write_cli_files(&control_info().expect("just set").dir)?;
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `src-tauri/`): `cargo test control::`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/control.rs
git commit -m "feat(control): generate vibectl CLI bundle and agent guide at startup"
```

## Task 4: PTY env injection

**Files:**
- Modify: `src-tauri/src/control.rs` (append `control_env`)
- Modify: `src-tauri/src/pty/actor.rs` (inject env at spawn)
- Test: inline tests in `control.rs`

**Interfaces:**
- Consumes: `ControlInfo` / `control_info()` from Task 2.
- Produces: `pub fn control_env(info: &ControlInfo, existing_path: Option<&str>) -> Vec<(String, String)>` — pairs applied to every PTY's `CommandBuilder`.

- [ ] **Step 1: Write the failing tests** (append inside `mod tests`):

```rust
    fn info() -> ControlInfo {
        ControlInfo { port: 4321, token: "tok".into(), dir: PathBuf::from(r"C:\data\vibectl") }
    }

    #[test]
    fn env_exposes_url_token_and_guide() {
        let env = control_env(&info(), Some(r"C:\Windows"));
        let get = |k: &str| env.iter().find(|(n, _)| n == k).map(|(_, v)| v.clone()).unwrap();
        assert_eq!(get("VIBECTL_URL"), "http://127.0.0.1:4321");
        assert_eq!(get("VIBECTL_TOKEN"), "tok");
        assert_eq!(get("VIBE_AGENT_GUIDE"), r"C:\data\vibectl\agent-guide.md");
    }

    #[test]
    fn env_prepends_the_cli_dir_to_path() {
        let env = control_env(&info(), Some(r"C:\Windows;C:\bin"));
        let path = &env.iter().find(|(n, _)| n == "PATH").unwrap().1;
        assert_eq!(path, r"C:\data\vibectl;C:\Windows;C:\bin");
        let env = control_env(&info(), None);
        assert_eq!(env.iter().find(|(n, _)| n == "PATH").unwrap().1, r"C:\data\vibectl");
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `src-tauri/`): `cargo test control::`
Expected: compile error — `control_env` not found.

- [ ] **Step 3: Write the implementation** (append to `control.rs`):

```rust
/// Env vars injected into every spawned PTY so agents can discover vibectl.
/// `;` is the Windows PATH separator (the app ships Windows-first; POSIX CLI
/// scripts are a deferred follow-up per the spec).
pub fn control_env(info: &ControlInfo, existing_path: Option<&str>) -> Vec<(String, String)> {
    let dir = info.dir.to_string_lossy().into_owned();
    let path = match existing_path {
        Some(p) if !p.is_empty() => format!("{dir};{p}"),
        _ => dir.clone(),
    };
    vec![
        ("VIBECTL_URL".into(), format!("http://127.0.0.1:{}", info.port)),
        ("VIBECTL_TOKEN".into(), info.token.clone()),
        (
            "VIBE_AGENT_GUIDE".into(),
            info.dir.join("agent-guide.md").to_string_lossy().into_owned(),
        ),
        ("PATH".into(), path),
    ]
}
```

In `src-tauri/src/pty/actor.rs`, inside `spawn`, right after the `cmd.cwd(dir);` block (i.e. after line `if let Some(dir) = cfg.cwd.clone() { cmd.cwd(dir); }`):

```rust
    // Expose the canvas-control CLI (vibectl) to whatever runs in this shell.
    if let Some(info) = crate::control::control_info() {
        let existing = std::env::var("PATH").ok();
        for (k, v) in crate::control::control_env(info, existing.as_deref()) {
            cmd.env(k, v);
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `src-tauri/`): `cargo test`
Expected: all control + pty + store tests pass (14 in `control::`).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/control.rs src-tauri/src/pty/actor.rs
git commit -m "feat(control): inject vibectl env (url, token, guide, PATH) into every PTY"
```

## Task 5: Frontend — `open_terminal` gains a `run` command

**Files:**
- Modify: `src/wall/cardStore.ts` (optional `command` on `TerminalCard`)
- Modify: `src/wall/presets.ts` (add `spawnCommand`)
- Modify: `src/wall/TerminalWindow.tsx` (use `spawnCommand`)
- Modify: `src/wall/WallView.tsx` (`addTerminal(presetId, run?)`; `run` param on the `open_terminal` Vibe command)
- Test: Create `src/wall/presets.test.ts`

**Why:** `vibectl terminal --run "npm run dev"` must type the command into the freshly spawned shell. The card's session doesn't exist yet when `open_terminal` resolves, so the command rides `SpawnConfig.command` — the same warm-up-injection path presets like `claude` already use. The field is deliberately **not persisted** to `WallDoc` (a reopened wall must not silently relaunch dev servers; explicit replay is Package C's boot recipe).

**Interfaces:**
- Consumes: existing `TerminalCard`, `Preset`, `resolvePreset`, `ensureSession`.
- Produces: `TerminalCard.command?: string`; `spawnCommand(card: { command?: string }, preset: Preset): string | undefined`; `open_terminal` accepts `{ preset?: string, run?: string }` (Task 6's bridge calls it with both).

- [ ] **Step 1: Write the failing test** — create `src/wall/presets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_PRESETS, spawnCommand } from "./presets";

const claude = DEFAULT_PRESETS.find((p) => p.id === "claude")!;
const plain = DEFAULT_PRESETS.find((p) => p.id === "plain")!;

describe("spawnCommand", () => {
  it("uses the preset's command by default", () => {
    expect(spawnCommand({}, claude)).toBe("claude");
    expect(spawnCommand({}, plain)).toBeUndefined();
  });

  it("a per-card command overrides the preset", () => {
    expect(spawnCommand({ command: "npm run dev" }, plain)).toBe("npm run dev");
    expect(spawnCommand({ command: "npm run dev" }, claude)).toBe("npm run dev");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wall/presets.test.ts`
Expected: FAIL — `spawnCommand` is not exported.

- [ ] **Step 3: Implement**

`src/wall/presets.ts` — append:

```ts
/** The command typed into a fresh terminal's shell: an explicit per-card
    command (e.g. vibectl terminal --run) wins over the preset's. */
export function spawnCommand(card: { command?: string }, preset: Preset): string | undefined {
  return card.command ?? preset.command;
}
```

`src/wall/cardStore.ts` — in `TerminalCard`, after `cwd: string;`:

```ts
  /** One-shot command typed into the shell on spawn (overrides the preset's).
      Runtime-only: not saved to WallDoc, so reopening a wall never silently
      relaunches dev servers. */
  command?: string;
```

`src/wall/TerminalWindow.tsx`:
- add `spawnCommand` to the presets import: `import { resolvePreset, spawnCommand } from "./presets";`
- change the `ensureSession` call to:

```ts
    ensureSession({ id, cwd: cwd || undefined, command: spawnCommand(terminal, preset), container: bodyRef.current });
```

`src/wall/WallView.tsx`:
- `addTerminal` gains a second parameter and passes it into the card:

```ts
  const addTerminal = async (presetId: string, run?: string) => {
    // Default cwd to the wall folder. If the path hasn't resolved yet (click during
    // the initial load), look it up on demand so agents never start in the wrong dir.
    let cwd = wallPath;
    if (!cwd) cwd = (await loadIndex()).find((w) => w.id === wallId)?.path ?? "";
    useCardStore.getState().add({
      kind: "terminal",
      id: crypto.randomUUID(),
      name: pickAgentName(terminalsOf(useCardStore.getState().cards).map((t) => t.name)),
      x: 0, y: 0, w: CELL.w, h: CELL.h, // placeholder; the grid layout positions it
      presetId, cwd, command: run,
    });
  };
```

(`LaunchMenu` calls `onLaunch(p.id)` with one argument, so the new parameter is invisible to it.)

- the `open_terminal` Vibe command gains `run`:

```ts
  useVibeCommand({
    name: "open_terminal",
    description:
      `Spawn a new agent terminal on this space. Available presets: ${presets.map((p) => p.label).join(", ")}. Omit preset for a plain shell.`,
    parameters: {
      type: "object",
      properties: {
        preset: { type: "string", description: "Preset name (fuzzy matched)" },
        run: { type: "string", description: "Optional shell command typed into the new terminal once it starts (e.g. a dev server)" },
      },
    },
    run: async (args) => {
      const wanted = String(args.preset ?? "");
      const preset = findPresetByPhrase(presets, wanted);
      if (!preset) {
        return `Error: no preset matches "${wanted}". Available presets: ${presets.map((p) => p.label).join(", ")}.`;
      }
      const run = args.run === undefined ? undefined : String(args.run);
      await addTerminal(preset.id, run);
      const all = terminalsOf(useCardStore.getState().cards);
      const name = all[all.length - 1]?.name;
      return run
        ? `Opened a ${preset.label} terminal named ${name} running "${run}".`
        : `Opened a ${preset.label} terminal named ${name}.`;
    },
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wall/presets.test.ts` → PASS.
Run: `npx tsc --noEmit -p tsconfig.json` → no errors.
Run: `npx vitest run` → full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/wall/presets.ts src/wall/presets.test.ts src/wall/cardStore.ts src/wall/TerminalWindow.tsx src/wall/WallView.tsx
git commit -m "feat(wall): open_terminal accepts a run command typed into the fresh shell"
```

## Task 6: Frontend — control bridge + app wiring + Vibe prompt line

**Files:**
- Modify: `src/vibe/commands.ts` (add `hasVibeCommand`)
- Create: `src/control/bridge.ts`
- Create: `src/control/bridge.test.ts`
- Modify: `src/App.tsx` (mount the listener)
- Modify: `src/vibe/agentLoop.ts` (one system-prompt line)

**Interfaces:**
- Consumes: `control_reply(id, ok, body)` Tauri command (Task 2); `control-request` event `{id, verb, args}` (Task 2); `open_terminal` with `{preset, run}` (Task 5); existing `openBrowser`, `browserCard`, `getContextBlock`, `runVibeCommand`, `useCardStore`/`terminalsOf`, `usePresetStore`, `resolvePreset`.
- Produces: `handleControlRequest(verb: string, args: Record<string, unknown>, deps: ControlDeps): Promise<ControlResult>`; `initControlBridge(): Promise<() => void>`; `hasVibeCommand(name: string): boolean`.

- [ ] **Step 1: Write the failing tests** — create `src/control/bridge.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { handleControlRequest, type ControlDeps, type StatePayload } from "./bridge";

const SNAPSHOT: StatePayload = {
  wall: "open terminals: Ada (Claude Code); theme: Night",
  terminals: [{ id: "t1", name: "Ada", preset: "Claude Code" }],
  browser: null,
};

function deps(over: Partial<ControlDeps> = {}): ControlDeps {
  return {
    wallOpen: () => true,
    stateSnapshot: () => SNAPSHOT,
    openBrowser: vi.fn(async (url: string) => `Opened the browser at ${url}.`),
    openTerminal: vi.fn(async () => "Opened a Plain shell terminal named Rex."),
    ...over,
  };
}

describe("handleControlRequest", () => {
  it("state returns the snapshot", async () => {
    expect(await handleControlRequest("state", {}, deps())).toEqual({ ok: true, body: SNAPSHOT });
  });

  it("browser rejects non-http(s) and missing urls without side effects", async () => {
    const d = deps();
    for (const args of [{ url: "file:///C:/x" }, { url: "javascript:alert(1)" }, {}]) {
      const r = await handleControlRequest("browser", args, d);
      expect(r).toEqual({ ok: true, body: { error: "only http(s) urls" } });
    }
    expect(d.openBrowser).not.toHaveBeenCalled();
  });

  it("browser opens valid urls", async () => {
    const d = deps();
    const r = await handleControlRequest("browser", { url: "http://localhost:8000" }, d);
    expect(d.openBrowser).toHaveBeenCalledWith("http://localhost:8000");
    expect(r).toEqual({ ok: true, body: { result: "Opened the browser at http://localhost:8000." } });
  });

  it("terminal passes preset and run through", async () => {
    const d = deps();
    await handleControlRequest("terminal", { preset: "claude", run: "npm run dev" }, d);
    expect(d.openTerminal).toHaveBeenCalledWith("claude", "npm run dev");
    await handleControlRequest("terminal", {}, d);
    expect(d.openTerminal).toHaveBeenCalledWith(undefined, undefined);
  });

  it("browser/terminal error without a wall; state still answers", async () => {
    const empty: StatePayload = { wall: null, terminals: [], browser: null };
    const d = deps({ wallOpen: () => false, stateSnapshot: () => empty });
    expect((await handleControlRequest("browser", { url: "http://x" }, d)).body)
      .toEqual({ error: "no space is open" });
    expect((await handleControlRequest("terminal", {}, d)).body)
      .toEqual({ error: "no space is open" });
    expect((await handleControlRequest("state", {}, d)).body).toEqual(empty);
  });

  it("unknown verbs are not ok", async () => {
    const r = await handleControlRequest("draw", {}, deps());
    expect(r.ok).toBe(false);
    expect(r.body).toEqual({ error: 'unknown verb "draw"' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/control/bridge.test.ts`
Expected: FAIL — module `./bridge` not found.

- [ ] **Step 3: Implement**

`src/vibe/commands.ts` — append after `runVibeCommand`:

```ts
/** True while a command is registered. Wall-scoped commands (open_terminal, …)
    exist exactly while a space is open — the control bridge keys off that. */
export function hasVibeCommand(name: string): boolean {
  return registry.has(name);
}
```

Create `src/control/bridge.ts`:

```ts
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useCardStore, terminalsOf } from "../wall/cardStore";
import { usePresetStore } from "../wall/presetStore";
import { resolvePreset } from "../wall/presets";
import { openBrowser, browserCard } from "../wall/browserActions";
import { getContextBlock } from "../vibe/context";
import { hasVibeCommand, runVibeCommand } from "../vibe/commands";

/**
 * Webview side of the agent canvas-control server (src-tauri/src/control.rs).
 * Executes ONLY the three allowlisted verbs against the card store — this is
 * deliberately not wired to the whole Vibe command registry.
 */

export type StatePayload = {
  /** Human-readable wall summary (the Vibe context block); null when no space is open. */
  wall: string | null;
  terminals: { id: string; name: string; preset: string }[];
  browser: { url: string } | null;
};

export type ControlDeps = {
  wallOpen: () => boolean;
  stateSnapshot: () => StatePayload;
  openBrowser: (url: string) => Promise<string>;
  openTerminal: (preset: string | undefined, run: string | undefined) => Promise<string>;
};

export type ControlResult = { ok: boolean; body: unknown };

export async function handleControlRequest(
  verb: string,
  args: Record<string, unknown>,
  deps: ControlDeps
): Promise<ControlResult> {
  if (verb === "state") return { ok: true, body: deps.stateSnapshot() };
  if (verb !== "browser" && verb !== "terminal") {
    return { ok: false, body: { error: `unknown verb "${verb}"` } };
  }
  if (!deps.wallOpen()) return { ok: true, body: { error: "no space is open" } };
  if (verb === "browser") {
    const url = String(args.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) return { ok: true, body: { error: "only http(s) urls" } };
    return { ok: true, body: { result: await deps.openBrowser(url) } };
  }
  const preset = args.preset === undefined ? undefined : String(args.preset);
  const run = args.run === undefined ? undefined : String(args.run);
  return { ok: true, body: { result: await deps.openTerminal(preset, run) } };
}

/** Wall-scoped commands are registered exactly while WallView is mounted. */
function wallOpen(): boolean {
  return hasVibeCommand("open_terminal");
}

function stateSnapshot(): StatePayload {
  if (!wallOpen()) return { wall: null, terminals: [], browser: null };
  const cards = useCardStore.getState().cards;
  const presets = usePresetStore.getState().presets;
  const browser = browserCard();
  return {
    wall: getContextBlock(),
    terminals: terminalsOf(cards).map((t) => ({
      id: t.id,
      name: t.name,
      preset: resolvePreset(presets, t.presetId).label,
    })),
    browser: browser ? { url: browser.url } : null,
  };
}

const LIVE_DEPS: ControlDeps = {
  wallOpen,
  stateSnapshot,
  openBrowser,
  openTerminal: (preset, run) =>
    runVibeCommand("open_terminal", {
      preset: preset ?? "",
      ...(run === undefined ? {} : { run }),
    }),
};

/** Listens for control-request events for the app's lifetime. Returns unlisten. */
export function initControlBridge(): Promise<() => void> {
  return listen<{ id: number; verb: string; args: Record<string, unknown> }>(
    "control-request",
    async (e) => {
      let res: ControlResult;
      try {
        res = await handleControlRequest(e.payload.verb, e.payload.args ?? {}, LIVE_DEPS);
      } catch (err) {
        res = { ok: false, body: { error: err instanceof Error ? err.message : String(err) } };
      }
      void invoke("control_reply", {
        id: e.payload.id,
        ok: res.ok,
        body: JSON.stringify(res.body),
      });
    }
  );
}
```

`src/App.tsx` — import and mount (the listener is app-lifetime; StrictMode double-mount is handled by the cleanup):

```ts
import { initControlBridge } from "./control/bridge";
```

and inside the `App` component body, next to the existing `vibe:open-teams` effect:

```ts
  // Agents' vibectl requests (canvas-control server) land here.
  useEffect(() => {
    const un = initControlBridge();
    return () => { void un.then((f) => f()); };
  }, []);
```

`src/vibe/agentLoop.ts` — extend `SYSTEM_PROMPT`: change the sentence ending `Address several agents with one send_to_agent call each.` to:

```
Address several agents with one send_to_agent call each. Agent terminals have
a "vibectl" CLI for controlling this canvas themselves (open browser previews,
spawn terminals); if the user wants an AGENT to do that, tell it via
send_to_agent to first read the guide file at $VIBE_AGENT_GUIDE.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/control/bridge.test.ts` → PASS (6 tests).
Run: `npx tsc --noEmit -p tsconfig.json` → no errors.
Run: `npx vitest run` → full suite green (agentLoop tests must still pass after the prompt edit).

- [ ] **Step 5: Commit**

```bash
git add src/control/bridge.ts src/control/bridge.test.ts src/vibe/commands.ts src/App.tsx src/vibe/agentLoop.ts
git commit -m "feat(control): webview bridge dispatching state/browser/terminal verbs"
```

## Task 7: Verification, docs, and status updates

**Files:**
- Modify: `docs/cnvs-parity-roadmap.md` (Package B status)
- Modify: assistant memory `project_cnvs_parity.md` (mirror the status)

- [ ] **Step 1: Full test gates**

```bash
npx tsc --noEmit -p tsconfig.json     # no errors
npx vitest run                        # all green (check $? directly, don't pipe)
cd src-tauri && cargo test && cd ..   # all green
```

- [ ] **Step 2: End-to-end in a separate dev instance** (NEVER the user's running app):

1. `npm run app` (background) — window title "Tauri App", app-data `com.admin.vibe-space-dev`.
2. Screenshot via `scripts/screenshot.ps1`; open a space and a **plain** terminal using `.dev/click2.ps1` (window-relative clicks).
3. In that terminal type (via `sendToSession` from the dev console, or click + keystrokes):
   - `vibectl` → usage text prints (proves PATH + env injection).
   - `vibectl state` → JSON with the wall summary and the terminal listed.
   - `vibectl browser http://localhost:1420` → browser card opens at the dev server. Screenshot.
   - `vibectl terminal --run "npm --version"` → a new plain terminal node appears and prints the npm version after ~1s. Screenshot.
   - Negative check from any shell OUTSIDE the app: `curl.exe -s -H "X-Vibe-Token: wrong" http://127.0.0.1:<port>/state` → `{"error":"missing or invalid token"}` (grab the port from `vibectl state`'s URL env inside the terminal via `echo %VIBECTL_URL%`).
4. **Clean up:** close the dev instance, kill any spawned PTY shells, and delete test terminals saved into `%APPDATA%/com.admin.vibe-space-dev/spaces/*.json`.

- [ ] **Step 3: Update the roadmap** — in `docs/cnvs-parity-roadmap.md`:
- §1 table: `| B | Agent canvas control | **DONE** (2026-07-14) |`
- §3 top: add a line mirroring §2's style: spec + plan paths, commit range, and the one-paragraph "what exists now" summary (control server in `control.rs`, `vibectl` CLI bundle in app-data, env injection, bridge allowlist, `open_terminal run` arg).

- [ ] **Step 4: Update assistant memory** — `project_cnvs_parity.md`: mark B built + verified with today's date and the plan path.

- [ ] **Step 5: Refresh the knowledge graph**

```bash
graphify update .
```

- [ ] **Step 6: Commit**

```bash
git add docs/cnvs-parity-roadmap.md docs/superpowers/plans/2026-07-14-agent-canvas-control.md
git commit -m "docs(control): mark CNVS-parity package B done; agent canvas control plan"
```

(Do not push — the user pushes to the `Vibe_ADE` remote when they say so.)

---

## Self-review notes

- **Spec coverage:** control server + routes + token (Tasks 1–2), CLI + guide (Task 3), env injection (Task 4), bridge dispatch + no-wall errors + scheme validation (Task 6), `terminal --run` (Tasks 5–6), security constraints (Global Constraints + Task 1 code), testing strategy (per-task + Task 7 E2E), roadmap status (Task 7). Spec's `src-tauri/src/pty/mod.rs`/`commands.rs` row: not needed — `control_info()` is a module-level accessor, actor.rs reads it directly.
- **Deviations** (CLI via PowerShell; `--run` via `SpawnConfig.command`) are declared in the header with reasons.
- **Type consistency:** `control_reply(id: u64, ok: bool, body: String)` matches the bridge's `invoke("control_reply", { id, ok, body: JSON.stringify(...) })`; `ControlInfo` fields match `control_env` tests; `open_terminal` args `{preset, run}` match `LIVE_DEPS.openTerminal`.
