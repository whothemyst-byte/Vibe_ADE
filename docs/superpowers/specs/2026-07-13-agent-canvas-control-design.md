# Agent Canvas Control (CNVS-parity package B)

**Date:** 2026-07-13
**Status:** Approved (Approach 1)
**Context:** `docs/cnvs-parity-roadmap.md` §3

## Goal

Agents running inside Vibe Space terminals can inspect and control the wall
themselves: read a JSON snapshot of the wall, open/navigate the wall browser,
and spawn new terminal nodes (e.g. for dev servers) — via a `vibectl` CLI
available in every agent's shell, backed by a token-authenticated loopback
control server in the Tauri process.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Agent API surface | **CLI only** (`vibectl`); MCP wrapper deferred |
| v1 verbs | **Core trio**: `state`, `browser <url>`, `terminal [--preset X] [--run CMD]` |
| Long-running processes | **Explicit via guide**: agents are told to use `vibectl terminal --run` for servers/watchers; no auto-detection |
| CLI form | **Generated script** wrapping `curl.exe` (ships with Windows 10+); no second cargo build target |
| Token scope | Per-app-run, random, 127.0.0.1 bind only |
| Tier gating | Free for all tiers (same as package A) |

## Out of scope (deferred)

- MCP server wrapper (add later as a thin client of the same HTTP API).
- Canvas notes / drawing verbs, focus/zoom/layout verbs.
- macOS/Linux CLI scripts (Windows-first; the server API is
  platform-neutral, POSIX scripts are a later add).
- Any process supervision / auto-promotion of long commands.

## Architecture

```
agent shell (any preset)
  vibectl state ──► curl http://127.0.0.1:<port>/state  (X-Vibe-Token: …)
                          │
                  src-tauri control.rs        (loopback TcpListener,
                          │                    token check, HTTP parse)
                  emit "control://request" ──► webview bridge (src/control/)
                          │                    executes via cardStore /
                  oneshot reply  ◄──────────── browserActions / addTerminal
                          │
                  HTTP JSON response ──► vibectl prints to agent
```

### 1. Control server — `src-tauri/src/control.rs`

- On app setup: bind `TcpListener` on `127.0.0.1:0` (OS-assigned port), spawn
  the accept loop on a thread (mirror `oauth.rs` style: nonblocking accept,
  manual HTTP/1.1 parse). Generate a 32-byte random hex token via the
  `getrandom` crate (tiny, add to Cargo.toml — the only new dependency).
- Routes (all require header `X-Vibe-Token: <token>`; anything else → 401
  JSON `{"error":"missing or invalid token"}`):
  - `GET /state`
  - `POST /browser` body `{"url": "..."}`
  - `POST /terminal` body `{"preset": "...", "run": "..."}` (both optional)
- Each valid request gets a request id; the payload is emitted to the webview
  as event `control-request` `{id, verb, args}`. A map of pending tokio
  oneshot senders keyed by id holds the reply channel; a new
  `#[tauri::command] control_reply(id, body)` resolves it. 10s timeout →
  504 JSON `{"error":"app did not respond"}`.
- Port + token exposed to the PTY layer via a small module-level
  `OnceLock<ControlInfo>`.

### 2. Webview bridge — `src/control/bridge.ts`

- `listen("control-request", …)` once at app start (wired in `App.tsx`).
- Dispatch (allowlist, NOT the whole Vibe command registry):
  - `state` → JSON: `{ wall: <getContextBlock() summary string>, terminals:
    [{id, name, preset}], browser: {open, url} | null }` — structured, built
    from `useCardStore` + `presetStore` directly.
  - `browser` → validate `http(s)` scheme, then reuse the same function the
    `open_browser` Vibe command uses (`openBrowser` / navigate).
  - `terminal` → `runVibeCommand("open_terminal", {preset})` (registered by
    WallView; returns the "Opened … named X" string); if `run` given, find
    the newest terminal and `sendToSession(id, run, true)` (the 200ms
    delayed-Enter path from package A).
- No wall open → verbs other than `state` reply
  `{"error":"no space is open"}`; `state` reports `{wall: null}`.
- Every reply goes back via `invoke("control_reply", {id, body, ok})`.
- Pure dispatch function `handleControlRequest(verb, args, deps)` extracted
  for vitest (deps injected).

### 3. CLI script + agent guide — generated at startup

- On app setup, Rust writes to `<app-data>/vibectl/`:
  - `vibectl.cmd` — Windows batch wrapper: routes `state|browser|terminal`
    args into `curl.exe -s -H "X-Vibe-Token: %VIBECTL_TOKEN%"
    %VIBECTL_URL%/<route>` with JSON bodies; prints the response body.
  - `agent-guide.md` — explains the three verbs with examples and the rule:
    "Never run dev servers or watchers in your own terminal — use
    `vibectl terminal --run "<cmd>"` so they get their own node and your
    terminal stays free."
- Files are rewritten every launch (token/port change each run — the script
  reads env vars, so only the guide text is static; rewrite anyway to heal
  edits).

### 4. PTY env injection — `src-tauri/src/pty/actor.rs`

`CommandBuilder` gains, for every spawned terminal:
- `VIBECTL_URL=http://127.0.0.1:<port>`
- `VIBECTL_TOKEN=<token>`
- `VIBE_AGENT_GUIDE=<app-data>/vibectl/agent-guide.md`
- `PATH=<app-data>/vibectl;<existing PATH>` (prepend, so `vibectl` resolves)

No banner is printed into terminals (keep them clean). Discovery paths:
the guide file is referenced from the env var name itself, and Vibe's system
prompt (`agentLoop.ts`) gains one line so dictation can tell an agent to
"read the file at $VIBE_AGENT_GUIDE to learn how to control the canvas".

### 5. Security

- Bind 127.0.0.1 only; per-app-run random token; constant-time-ish compare is
  unnecessary at this threat level but token must never be logged.
- `browser` verb accepts only `http://` / `https://` URLs.
- No filesystem or arbitrary-exec verbs: `terminal --run` types the command
  into a fresh interactive shell node visible to the user — same power the
  agent already has in its own shell, now just visible on the wall.
- Request body cap 64KB; malformed JSON → 400.

## Error handling

| Case | Behavior |
|---|---|
| Missing/wrong token | 401 JSON error |
| Unknown route | 404 JSON error |
| No wall open | 200 with `{"error":"no space is open"}` from bridge (or `{wall:null}` for state) |
| Webview timeout (10s) | 504 JSON error |
| Bad URL scheme | `{"error":"only http(s) urls"}` |
| curl absent (old Windows) | vibectl.cmd prints a clear message; server unaffected |

## Testing

- **Rust unit tests** (`control.rs`): HTTP request parsing, token check,
  route matching, timeout reply (tokio test).
- **Vitest** (`src/control/bridge.test.ts`): `handleControlRequest` dispatch
  with injected deps — state shape, scheme validation, no-wall errors,
  terminal+run composition.
- **End-to-end** (dev app via package-A tooling): spawn dev instance, open a
  space, open a plain terminal, type `vibectl state` via `sendToSession`
  … verified by screenshot; then `vibectl terminal --run "npm --version"`
  spawns a node. Scriptable without voice.

## File-by-file change list

| File | Change |
|---|---|
| `src-tauri/src/control.rs` | **new** — server, token, routes, reply map |
| `src-tauri/src/lib.rs` | register setup + `control_reply` command |
| `src-tauri/src/pty/actor.rs` | env injection (URL/token/guide/PATH) |
| `src-tauri/src/pty/mod.rs`/`commands.rs` | thread ControlInfo if needed |
| `src/control/bridge.ts` | **new** — event listener + allowlisted dispatch |
| `src/control/bridge.test.ts` | **new** — dispatch unit tests |
| `src/App.tsx` | mount bridge listener |
| `docs/cnvs-parity-roadmap.md` | mark package B status when done |
