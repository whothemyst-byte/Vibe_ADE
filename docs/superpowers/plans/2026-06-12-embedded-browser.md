# Embedded Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single in-wall browser card that opens in the managed grid like terminals, auto-opens when a terminal prints a localhost URL, and is controllable by vibe (open / close / navigate / back / read the page).

**Architecture:** The terminal store generalizes to a `cards` array (`kind: "terminal" | "browser"`), so the browser inherits grid layout, camera fit, and drag-reorder for free. The page itself is a native child WebView2 created by Rust (`window.add_child`, Tauri `unstable` feature) and positioned over the card body on every camera tick; React renders only the card chrome. Page reading goes through WebView2 `ExecuteScript` (Windows-only, matches this app).

**Tech Stack:** Tauri 2.11 (`unstable` feature), wry child webviews, webview2-com 0.38 / windows-core 0.61 (already in Cargo.lock via wry — keep these versions), React + zustand, vitest.

**Spec:** `docs/superpowers/specs/2026-06-12-embedded-browser-design.md`

**Deliberate deviations from the spec (all simplifications, same user-visible behavior):**
- `canGoBack` uses a `history.length > 1` heuristic via ExecuteScript instead of COM `CanGoBack` (avoids extra COM plumbing; only gates a button tooltip).
- `seenUrls` is app-level (one set per launch) rather than per-wall — still satisfies "restarts never re-open".
- Page-load failures (server down) show WebView2's own error page inside the webview, which the user sees directly; explicit error states cover invoke-level failures (bad URL, no webview).
- Rect math lives in TS (`worldRectToScreen`, already tested) — Rust receives final logical rects, so the Rust unit test covers URL parsing instead.

**Security note:** The child webview (label `wall-browser`) is granted **no** capabilities — remote pages cannot invoke any Tauri command. Do not add it to `capabilities/default.json`.

**Threading note:** `window.add_child` proxies to the main thread internally; async Tauri commands run on the tokio pool, so calling it directly from a command is safe (no deadlock).

**Branch:** create `feat/embedded-browser` off the current branch in the vibe-walls repo (use superpowers:using-git-worktrees if isolating). All paths below are relative to the `vibe-walls/` repo root.

---

## File Structure

**Create:**
- `src/wall/urlScanner.ts` (+ `urlScanner.test.ts`) — pure: ANSI-strip, detect localhost URLs in chunked PTY output, dedupe.
- `src/wall/cardStore.ts` (+ `cardStore.test.ts`) — renamed from `terminalStore.ts`; cards union.
- `src/browser/client.ts` — typed invoke wrappers + nav-event listener (mirrors `src/pty/client.ts`).
- `src/wall/browserActions.ts` (+ `browserActions.test.ts`) — open/close/auto-open orchestration + seen-set rules.
- `src/wall/browserSync.ts` — module-level hook so WallView's camera rAF can reposition the webview.
- `src/wall/browserVisibility.ts` — blocker counter for overlays that must paint above the webview.
- `src/wall/BrowserWindow.tsx` — card chrome (URL bar, back/reload/close) + native webview lifecycle.
- `src-tauri/src/browser/mod.rs`, `src-tauri/src/browser/commands.rs`, `src-tauri/src/browser/read.rs` — Rust module (mirrors `pty/` shape).

**Modify:**
- `src-tauri/Cargo.toml` — `unstable` feature, windows-only deps.
- `src-tauri/src/lib.rs` — register module, state, commands.
- `src/store/types.ts` — `WallDoc.browser`.
- `src/wall/WallView.tsx` — cards rename, vibe commands, rAF sync call, persistence, launch wiring.
- `src/wall/TerminalOverlay.tsx`, `src/wall/TerminalWindow.tsx`, `src/wall/sessions.ts` — cards rename; sessions also gains the URL scanner hookup.
- `src/wall/LaunchMenu.tsx`, `src/wall/Toolbar.tsx`, `src/wall/icons.tsx`, `src/App.css` — Browser entry, blockers, icons, styles.

---

### Task 1: URL scanner (pure TS, TDD)

**Files:**
- Create: `src/wall/urlScanner.ts`
- Test: `src/wall/urlScanner.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/wall/urlScanner.test.ts
import { describe, expect, it, vi } from "vitest";
import { createUrlScanner, normalizeLocalUrl } from "./urlScanner";

describe("normalizeLocalUrl", () => {
  it("rewrites 0.0.0.0 to localhost", () => {
    expect(normalizeLocalUrl("http://0.0.0.0:8000/")).toBe("http://localhost:8000/");
  });
  it("trims trailing punctuation", () => {
    expect(normalizeLocalUrl("http://localhost:5173/.")).toBe("http://localhost:5173/");
  });
});

describe("createUrlScanner", () => {
  it("reports a plain localhost URL once", () => {
    const onUrl = vi.fn();
    const scan = createUrlScanner(onUrl);
    scan("  Local:   http://localhost:5173/\n");
    expect(onUrl).toHaveBeenCalledExactlyOnceWith("http://localhost:5173/");
  });

  it("strips ANSI color codes around the URL", () => {
    const onUrl = vi.fn();
    const scan = createUrlScanner(onUrl);
    scan("\x1b[32mLocal\x1b[0m: \x1b[36mhttp://localhost:5173/\x1b[0m\n");
    expect(onUrl).toHaveBeenCalledExactlyOnceWith("http://localhost:5173/");
  });

  it("joins a URL split across two chunks", () => {
    const onUrl = vi.fn();
    const scan = createUrlScanner(onUrl);
    scan("Local: http://local");
    scan("host:4321/app\n");
    expect(onUrl).toHaveBeenCalledExactlyOnceWith("http://localhost:4321/app");
  });

  it("dedupes repeats of the same URL", () => {
    const onUrl = vi.fn();
    const scan = createUrlScanner(onUrl);
    scan("http://127.0.0.1:3000\n");
    scan("restarting…\nhttp://127.0.0.1:3000\n");
    expect(onUrl).toHaveBeenCalledTimes(1);
  });

  it("ignores non-local URLs", () => {
    const onUrl = vi.fn();
    const scan = createUrlScanner(onUrl);
    scan("see https://vitejs.dev/config for docs\n");
    expect(onUrl).not.toHaveBeenCalled();
  });

  it("reports distinct ports separately", () => {
    const onUrl = vi.fn();
    const scan = createUrlScanner(onUrl);
    scan("http://localhost:5173/\nhttp://localhost:4173/\n");
    expect(onUrl).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wall/urlScanner.test.ts`
Expected: FAIL — cannot resolve `./urlScanner`.

- [ ] **Step 3: Implement the scanner**

```ts
// src/wall/urlScanner.ts

/** CSI (colors, cursor) and OSC (titles, hyperlinks) escape sequences. */
const ANSI_RE = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g;
const URL_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/[^\s"'<>()[\]]*)?/gi;
/** Tail kept between chunks so a URL split across PTY reads still matches. */
const TAIL = 512;

export function normalizeLocalUrl(raw: string): string {
  return raw.replace(/[.,;:!?'"]+$/, "").replace("0.0.0.0", "localhost");
}

/**
 * Feeds decoded terminal output chunks; calls `onUrl` once per distinct
 * localhost URL seen in this scanner's lifetime (one scanner per session).
 */
export function createUrlScanner(onUrl: (url: string) => void): (chunk: string) => void {
  let tail = "";
  const seen = new Set<string>();
  return (chunk) => {
    const text = tail + chunk.replace(ANSI_RE, "");
    for (const m of text.matchAll(URL_RE)) {
      const url = normalizeLocalUrl(m[0]);
      if (!seen.has(url)) {
        seen.add(url);
        onUrl(url);
      }
    }
    tail = text.slice(-TAIL);
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wall/urlScanner.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/wall/urlScanner.ts src/wall/urlScanner.test.ts
git commit -m "feat(browser): localhost url scanner for terminal output"
```

---

### Task 2: Generalize terminals to cards

Rename `terminalStore.ts` → `cardStore.ts`; the array becomes `cards: Card[]` with a `kind` discriminator. Update every consumer in the same task so the repo stays green.

**Files:**
- Create: `src/wall/cardStore.ts` (git mv from `src/wall/terminalStore.ts`)
- Create: `src/wall/cardStore.test.ts` (git mv from `src/wall/terminalStore.test.ts`)
- Modify: `src/wall/WallView.tsx`, `src/wall/TerminalOverlay.tsx`, `src/wall/TerminalWindow.tsx`, `src/wall/sessions.ts`, `src/store/types.ts`

- [ ] **Step 1: git mv the store and its test**

```bash
git mv src/wall/terminalStore.ts src/wall/cardStore.ts
git mv src/wall/terminalStore.test.ts src/wall/cardStore.test.ts
```

- [ ] **Step 2: Rewrite the store with the cards union**

Replace the full contents of `src/wall/cardStore.ts`:

```ts
import { create } from "zustand";

export type TerminalCard = {
  kind: "terminal";
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  presetId: string;
  cwd: string;
};

/** The wall's single browser; occupies a grid cell like any terminal. */
export type BrowserCard = {
  kind: "browser";
  id: string;
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Card = TerminalCard | BrowserCard;

export function terminalsOf(cards: Card[]): TerminalCard[] {
  return cards.filter((c): c is TerminalCard => c.kind === "terminal");
}

type CardStore = {
  cards: Card[];
  /** World-space center of the managed grid; null until the first layout. */
  anchor: { x: number; y: number } | null;
  add: (c: Card) => void;
  update: (
    id: string,
    patch: Partial<Omit<TerminalCard, "kind" | "id">> | Partial<Omit<BrowserCard, "kind" | "id">>
  ) => void;
  remove: (id: string) => void;
  /** Reorders a card to `index` (grid order = array order). */
  moveToIndex: (id: string, index: number) => void;
};

export const useCardStore = create<CardStore>((set) => ({
  cards: [],
  anchor: null,
  add: (c) => set((s) => ({ cards: [...s.cards, c] })),
  update: (id, patch) =>
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? ({ ...c, ...patch } as Card) : c)),
    })),
  remove: (id) => set((s) => ({ cards: s.cards.filter((c) => c.id !== id) })),
  moveToIndex: (id, index) =>
    set((s) => {
      const from = s.cards.findIndex((c) => c.id === id);
      if (from === -1) return {};
      const next = [...s.cards];
      const [moved] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(index, next.length)), 0, moved);
      return { cards: next };
    }),
}));
```

- [ ] **Step 3: Update the store tests**

In `src/wall/cardStore.test.ts`: change imports from `./terminalStore` to `./cardStore`, `useTerminalStore` → `useCardStore`, `terminals` → `cards`, and add `kind: "terminal" as const` to every terminal fixture object. Add one new test:

```ts
it("moveToIndex reorders a browser card mixed with terminals", () => {
  useCardStore.setState({
    cards: [
      { kind: "terminal", id: "t1", name: "Ada", x: 0, y: 0, w: 1, h: 1, presetId: "plain", cwd: "" },
      { kind: "browser", id: "wall-browser", url: "http://localhost:5173", x: 0, y: 0, w: 1, h: 1 },
      { kind: "terminal", id: "t2", name: "Bo", x: 0, y: 0, w: 1, h: 1, presetId: "plain", cwd: "" },
    ],
    anchor: null,
  });
  useCardStore.getState().moveToIndex("wall-browser", 0);
  expect(useCardStore.getState().cards.map((c) => c.id)).toEqual(["wall-browser", "t1", "t2"]);
});
```

- [ ] **Step 4: Add the saved-browser type to `src/store/types.ts`**

```ts
export type SavedBrowser = { url: string; gridIndex: number };
```

and extend `WallDoc`:

```ts
export type WallDoc = {
  scene: WallScene;
  terminals: SavedTerminal[];
  background: Background;
  /** World-space center of the managed terminal grid. */
  gridAnchor?: { x: number; y: number };
  /** The wall's single browser card, if open when last saved. */
  browser?: SavedBrowser;
};
```

- [ ] **Step 5: Update consumers (mechanical rename + kind handling)**

`src/wall/TerminalWindow.tsx`:
- `import { useTerminalStore, type TerminalState } from "./terminalStore"` → `import { useCardStore, type TerminalCard } from "./cardStore"`
- Prop type `terminal: TerminalState` → `terminal: TerminalCard`; `useTerminalStore` → `useCardStore` everywhere; in `onUp`, `const { terminals, moveToIndex } = …` → `const { cards, moveToIndex } = …` (and `terminals.map`/`findIndex` → `cards.…`).

`src/wall/TerminalOverlay.tsx` — replace the mapping:

```tsx
import { useCardStore } from "./cardStore";
// …
const cards = useCardStore((s) => s.cards);
// …
{cards.map((c) =>
  c.kind === "terminal" ? (
    <TerminalWindow key={c.id} terminal={c} cameraRef={cameraRef} />
  ) : null /* BrowserWindow lands in Task 7 */
)}
```

`src/wall/sessions.ts`:
- `import { useTerminalStore } from "./terminalStore"` → `import { useCardStore } from "./cardStore"`
- In the exit handler: `const store = useCardStore.getState(); if (store.cards.some((c) => c.id === id)) store.remove(id); else deadIds.add(id);`

`src/wall/WallView.tsx` — every `useTerminalStore` → `useCardStore` (import from `./cardStore`, also import `terminalsOf` and `type Card`), then:
- `buildDoc`: `terminals: terminalsOf(useCardStore.getState().cards).map(({ id, x, y, w, h, presetId, cwd, name }) => ({ id, x, y, w, h, presetId, cwd, name }))` and `gridAnchor: useCardStore.getState().anchor ?? undefined`.
- Wall load `setState`: build typed cards —

```ts
const names: string[] = [];
const cards: Card[] = (doc?.terminals ?? [])
  .filter((t) => !wasSessionDead(t.id))
  .map((t) => {
    const name = t.name ?? pickAgentName(names);
    names.push(name);
    return { ...t, kind: "terminal" as const, name };
  });
useCardStore.setState({ anchor: doc?.gridAnchor ?? null, cards });
```

- `layoutGrid`: `const { cards, anchor } = useCardStore.getState(); if (cards.length === 0) return;` and the position write maps `cards` (variable rename only — the body already only touches `x/y/w/h`); `gridPositions(cards.length, …)`, `gridBBox(cards.length, …)`.
- Membership subscription: `s.cards.map((c) => c.id).join("|")` (both occurrences).
- `addTerminal`: the `add({ … })` object gains `kind: "terminal" as const`.
- Vibe commands `open_terminal` / `close_terminal` / `focus_terminal` / `send_to_terminal`: wherever they read `terminals`, use `const terminals = terminalsOf(useCardStore.getState().cards);` — behavior is unchanged (they only ever match terminals by agent name). In `open_terminal`'s result, `const all = terminalsOf(useCardStore.getState().cards);`.

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — fix any missed rename until green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(wall): terminal store generalized to cards with kind discriminator"
```

---

### Task 3: Browser invoke client (TS)

Thin typed wrappers, mirroring `src/pty/client.ts`. No unit tests (no logic).

**Files:**
- Create: `src/browser/client.ts`

- [ ] **Step 1: Write the client**

```ts
// src/browser/client.ts
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const NAV_EVENT = "browser://nav";

export type BrowserRect = { x: number; y: number; w: number; h: number };

export function browserOpen(url: string, rect: BrowserRect, zoom: number): Promise<void> {
  return invoke("browser_open", { url, ...rect, zoom });
}
export function browserNavigate(url: string): Promise<void> {
  return invoke("browser_navigate", { url });
}
export function browserBack(): Promise<void> {
  return invoke("browser_back");
}
export function browserReload(): Promise<void> {
  return invoke("browser_reload");
}
export function browserSetRect(rect: BrowserRect, zoom: number): Promise<void> {
  return invoke("browser_set_rect", { ...rect, zoom });
}
export function browserSetVisible(visible: boolean): Promise<void> {
  return invoke("browser_set_visible", { visible });
}
export function browserClose(): Promise<void> {
  return invoke("browser_close");
}
export function browserRead(): Promise<{ title: string; text: string }> {
  return invoke("browser_read");
}
export function browserStatus(): Promise<{ title: string; canGoBack: boolean }> {
  return invoke("browser_status");
}
export function onBrowserNav(cb: (url: string) => void): Promise<UnlistenFn> {
  return listen<{ url: string }>(NAV_EVENT, (e) => cb(e.payload.url));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/browser/client.ts
git commit -m "feat(browser): typed invoke client"
```

---

### Task 4: Rust browser module — core commands

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/browser/mod.rs`, `src-tauri/src/browser/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Cargo.toml — unstable feature + windows deps**

Change the tauri dependency line and append a windows-only section (versions match what wry already locks — do not bump):

```toml
tauri = { version = "2", features = ["protocol-asset", "unstable"] }
```

```toml
[target.'cfg(windows)'.dependencies]
webview2-com = "0.38"
windows-core = "0.61"
```

- [ ] **Step 2: Create `src-tauri/src/browser/mod.rs`**

```rust
pub mod commands;
#[cfg(windows)]
pub mod read;

use parking_lot::Mutex;
use tauri::Webview;

/// Label of the single child webview; never granted IPC capabilities.
pub const LABEL: &str = "wall-browser";

#[derive(Default)]
pub struct BrowserState(pub Mutex<Option<Webview>>);
```

- [ ] **Step 3: Create `src-tauri/src/browser/commands.rs` (core commands)**

```rust
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
    if let Some(mut wv) = state.0.lock().clone() {
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
    let mut wv = state.0.lock().clone().ok_or("no browser open")?;
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
```

- [ ] **Step 4: Register in `src-tauri/src/lib.rs`**

```rust
mod browser;
mod pty;
mod store;
```

Add to the builder chain (after the existing `.manage(...)`):

```rust
.manage(browser::BrowserState::default())
```

And extend `generate_handler!` with:

```rust
browser::commands::browser_open,
browser::commands::browser_navigate,
browser::commands::browser_back,
browser::commands::browser_reload,
browser::commands::browser_set_rect,
browser::commands::browser_set_visible,
browser::commands::browser_close,
```

(`browser_read` / `browser_status` are added in Task 5.)

- [ ] **Step 5: Check + test**

Run: `cd src-tauri && cargo check && cargo test browser && cd ..`
Expected: compiles clean; `parse_url_accepts_http_and_rejects_garbage` passes. If `navigate`'s mutability or `eval`'s argument type differ on tauri 2.11, follow the compiler — the APIs are `Webview::navigate(&mut self, Url)` and `Webview::eval(&self, &str)`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri
git commit -m "feat(browser): rust child-webview core commands"
```

---

### Task 5: Rust page reading (ExecuteScript)

**Files:**
- Create: `src-tauri/src/browser/read.rs`
- Modify: `src-tauri/src/browser/commands.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/browser/read.rs`**

```rust
use std::time::Duration;

use tauri::Webview;
use tokio::sync::oneshot;
use webview2_com::ExecuteScriptCompletedHandler;
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
use windows_core::HSTRING;

/// Runs `js` in the child webview via WebView2 ExecuteScript. Returns the
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
```

If `cargo check` disputes the handler closure signature, consult docs.rs for `webview2-com` **0.38** `ExecuteScriptCompletedHandler::create` — the closure is boxed `FnOnce(windows_core::Result<()>, <result type>) -> windows_core::Result<()>`; adapt the two closure parameters accordingly (the result arrives as the script's JSON-encoded value).

- [ ] **Step 2: Add read/status commands to `src-tauri/src/browser/commands.rs`**

```rust
const READ_JS: &str = r#"JSON.stringify({ title: document.title, text: document.body ? document.body.innerText.slice(0, 8000) : "" })"#;
const STATUS_JS: &str = r#"JSON.stringify({ title: document.title, canGoBack: history.length > 1 })"#;

#[derive(Serialize)]
pub struct PageContent {
    pub title: String,
    pub text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserStatus {
    pub title: String,
    pub can_go_back: bool,
}

/// Runs a JSON.stringify(...) script and decodes both JSON layers
/// (ExecuteScript JSON-encodes the script's string result).
#[cfg(windows)]
async fn run_script(
    state: &State<'_, BrowserState>,
    js: &'static str,
) -> Result<serde_json::Value, String> {
    let wv = state.0.lock().clone().ok_or("no browser open")?;
    let raw = super::read::execute_script(wv, js).await?;
    let inner: String = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    serde_json::from_str(&inner).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_read(state: State<'_, BrowserState>) -> Result<PageContent, String> {
    #[cfg(windows)]
    {
        let v = run_script(&state, READ_JS).await?;
        Ok(PageContent {
            title: v["title"].as_str().unwrap_or_default().to_string(),
            text: v["text"].as_str().unwrap_or_default().to_string(),
        })
    }
    #[cfg(not(windows))]
    {
        let _ = state;
        Err("page reading requires WebView2 (Windows)".into())
    }
}

#[tauri::command]
pub async fn browser_status(state: State<'_, BrowserState>) -> Result<BrowserStatus, String> {
    #[cfg(windows)]
    {
        let v = run_script(&state, STATUS_JS).await?;
        Ok(BrowserStatus {
            title: v["title"].as_str().unwrap_or_default().to_string(),
            can_go_back: v["canGoBack"].as_bool().unwrap_or(false),
        })
    }
    #[cfg(not(windows))]
    {
        let _ = state;
        Err("page reading requires WebView2 (Windows)".into())
    }
}
```

- [ ] **Step 3: Register the two commands in `src-tauri/src/lib.rs`**

Append to `generate_handler!`:

```rust
browser::commands::browser_read,
browser::commands::browser_status,
```

- [ ] **Step 4: Check**

Run: `cd src-tauri && cargo check && cd ..`
Expected: compiles clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri
git commit -m "feat(browser): page reading via webview2 ExecuteScript"
```

---

### Task 6: Browser actions + auto-open rules (TDD)

**Files:**
- Create: `src/wall/browserActions.ts`
- Test: `src/wall/browserActions.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/wall/browserActions.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCardStore } from "./cardStore";
import {
  autoOpenFromTerminal,
  browserCard,
  closeBrowser,
  openBrowser,
  _resetForTests,
} from "./browserActions";

vi.mock("../browser/client", () => ({
  browserNavigate: vi.fn(() => Promise.resolve()),
}));
import { browserNavigate } from "../browser/client";

const term = (id: string) => ({
  kind: "terminal" as const,
  id,
  name: id,
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  presetId: "plain",
  cwd: "",
});

beforeEach(() => {
  useCardStore.setState({ cards: [], anchor: null });
  _resetForTests();
  vi.clearAllMocks();
});

describe("openBrowser", () => {
  it("adds the browser card with a default scheme", async () => {
    await openBrowser("localhost:5173");
    expect(browserCard()?.url).toBe("https://localhost:5173");
  });

  it("navigates instead of re-adding when already open", async () => {
    await openBrowser("http://localhost:5173");
    await openBrowser("https://github.com");
    expect(useCardStore.getState().cards).toHaveLength(1);
    expect(browserNavigate).toHaveBeenCalledWith("https://github.com");
    expect(browserCard()?.url).toBe("https://github.com");
  });

  it("falls back to the last url, then the default", async () => {
    await openBrowser("http://localhost:3000");
    closeBrowser();
    // Card is gone, so the next open uses the default page.
    await openBrowser();
    expect(browserCard()?.url).toMatch(/^https:\/\//);
  });
});

describe("closeBrowser", () => {
  it("removes the card and reports when nothing is open", async () => {
    await openBrowser("http://localhost:1");
    expect(closeBrowser()).toMatch(/closed/i);
    expect(browserCard()).toBeUndefined();
    expect(closeBrowser()).toMatch(/not open/i);
  });
});

describe("autoOpenFromTerminal", () => {
  it("opens for a new url from a terminal on the open wall", () => {
    useCardStore.setState({ cards: [term("t1")], anchor: null });
    autoOpenFromTerminal("t1", "http://localhost:5173/");
    expect(browserCard()?.url).toBe("http://localhost:5173/");
  });

  it("is once-per-url: a second sighting does nothing even after close", () => {
    useCardStore.setState({ cards: [term("t1")], anchor: null });
    autoOpenFromTerminal("t1", "http://localhost:5173/");
    closeBrowser();
    autoOpenFromTerminal("t1", "http://localhost:5173/");
    expect(browserCard()).toBeUndefined();
  });

  it("ignores sessions whose terminal is not on the open wall", () => {
    useCardStore.setState({ cards: [term("t1")], anchor: null });
    autoOpenFromTerminal("parked-session", "http://localhost:4000/");
    expect(browserCard()).toBeUndefined();
  });

  it("never hijacks an already-open browser", async () => {
    useCardStore.setState({ cards: [term("t1")], anchor: null });
    await openBrowser("https://github.com");
    autoOpenFromTerminal("t1", "http://localhost:5173/");
    expect(browserCard()?.url).toBe("https://github.com");
    expect(browserNavigate).not.toHaveBeenCalledWith("http://localhost:5173/");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wall/browserActions.test.ts`
Expected: FAIL — cannot resolve `./browserActions`.

- [ ] **Step 3: Implement the actions**

```ts
// src/wall/browserActions.ts
import { useCardStore, type BrowserCard } from "./cardStore";
import { browserNavigate } from "../browser/client";
import { CELL } from "./gridLayout";

export const BROWSER_ID = "wall-browser";
export const DEFAULT_URL = "https://www.google.com";

/** URLs already auto-opened this app run — restarts never re-open or hijack. */
const seenUrls = new Set<string>();

export function browserCard(): BrowserCard | undefined {
  return useCardStore.getState().cards.find((c): c is BrowserCard => c.kind === "browser");
}

/** Opens the browser card (the grid re-flows) or navigates the existing one. */
export async function openBrowser(url?: string): Promise<string> {
  const target = url?.trim() || browserCard()?.url || DEFAULT_URL;
  const withScheme = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  if (browserCard()) {
    useCardStore.getState().update(BROWSER_ID, { url: withScheme });
    await browserNavigate(withScheme);
    return `Browser navigated to ${withScheme}.`;
  }
  useCardStore.getState().add({
    kind: "browser",
    id: BROWSER_ID,
    url: withScheme,
    x: 0,
    y: 0,
    w: CELL.w,
    h: CELL.h, // placeholder; the grid layout positions it
  });
  return `Opened the browser at ${withScheme}.`;
}

/** Removes the card; BrowserWindow's unmount destroys the native webview. */
export function closeBrowser(): string {
  if (!browserCard()) return "The browser is not open.";
  useCardStore.getState().remove(BROWSER_ID);
  return "Closed the browser.";
}

/** Once-per-URL auto-open, fed by the terminal output scanner. */
export function autoOpenFromTerminal(sessionId: string, url: string): void {
  if (seenUrls.has(url)) return;
  seenUrls.add(url);
  const { cards } = useCardStore.getState();
  if (!cards.some((c) => c.id === sessionId)) return; // terminal isn't on the open wall
  if (cards.some((c) => c.kind === "browser")) return; // never hijack an open browser
  void openBrowser(url);
}

export function _resetForTests(): void {
  seenUrls.clear();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wall/browserActions.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/wall/browserActions.ts src/wall/browserActions.test.ts
git commit -m "feat(browser): open/close/auto-open actions with once-per-url rules"
```

---

### Task 7: BrowserWindow card + rect sync + visibility

**Files:**
- Create: `src/wall/browserSync.ts`, `src/wall/browserVisibility.ts`, `src/wall/BrowserWindow.tsx`
- Modify: `src/wall/TerminalOverlay.tsx`, `src/wall/WallView.tsx` (rAF + gear blocker), `src/wall/LaunchMenu.tsx` (blocker only), `src/wall/Toolbar.tsx` (blocker), `src/wall/icons.tsx`, `src/App.css`

- [ ] **Step 1: Create `src/wall/browserSync.ts`**

```ts
// src/wall/browserSync.ts

/**
 * BrowserWindow registers its reposition function here so WallView's camera
 * rAF (and anything else that moves the world) can nudge the native webview
 * without holding a React reference to the component.
 */
let syncFn: (() => void) | null = null;

export function setBrowserSyncHandler(fn: (() => void) | null): void {
  syncFn = fn;
}

/** No-op when no browser is open. */
export function syncBrowserRect(): void {
  syncFn?.();
}
```

- [ ] **Step 2: Create `src/wall/browserVisibility.ts`**

```ts
// src/wall/browserVisibility.ts
import { useEffect } from "react";
import { create } from "zustand";

/**
 * The native webview always paints above the DOM, so overlays that must
 * appear on top (settings modal, menus) register as blockers; the browser
 * hides itself while any are active.
 */
export const useBrowserBlockers = create<{ count: number }>(() => ({ count: 0 }));

export function useBlocksBrowser(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    useBrowserBlockers.setState((s) => ({ count: s.count + 1 }));
    return () => useBrowserBlockers.setState((s) => ({ count: s.count - 1 }));
  }, [active]);
}
```

- [ ] **Step 3: Add icons to `src/wall/icons.tsx`** (match the existing icon components' style/size conventions in that file)

```tsx
export const ArrowLeftIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

export const ReloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
  </svg>
);

export const GlobeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" />
  </svg>
);
```

- [ ] **Step 4: Create `src/wall/BrowserWindow.tsx`**

```tsx
import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { HEADER_H, worldRectToScreen, type Camera } from "./transform";
import { useCardStore, type BrowserCard } from "./cardStore";
import { ArrowLeftIcon, CloseIcon, ReloadIcon } from "./icons";
import { nearestSlotIndex } from "./gridLayout";
import { setBrowserSyncHandler, syncBrowserRect } from "./browserSync";
import { useBrowserBlockers } from "./browserVisibility";
import { BROWSER_ID, closeBrowser, openBrowser } from "./browserActions";
import * as client from "../browser/client";

function BrowserWindowInner({
  card,
  cameraRef,
}: {
  card: BrowserCard;
  cameraRef: RefObject<Camera>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [urlInput, setUrlInput] = useState(card.url);
  const [title, setTitle] = useState("Browser");
  const [error, setError] = useState<string | null>(null);
  const blockers = useBrowserBlockers((s) => s.count);
  /** Hide reasons beyond blockers (currently: while dragging the card). */
  const hiddenRef = useRef(false);

  // One native-webview lifecycle per mount: create hidden, position, reveal.
  // Unmount (card closed or wall exited) destroys it; the URL lives in the doc.
  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let lastSent = "";

    const bodyRect = () => {
      const c = useCardStore.getState().cards.find((x) => x.id === BROWSER_ID);
      if (!c) return null;
      return worldRectToScreen(
        { x: c.x, y: c.y + HEADER_H, w: c.w, h: c.h - HEADER_H },
        cameraRef.current
      );
    };

    const sync = () => {
      if (disposed) return;
      const body = bodyRect();
      if (!body) return;
      const offscreen =
        body.left + body.width < 0 ||
        body.top + body.height < 0 ||
        body.left > window.innerWidth ||
        body.top > window.innerHeight;
      const visible =
        !offscreen && useBrowserBlockers.getState().count === 0 && !hiddenRef.current;
      const z = cameraRef.current.z;
      const msg = JSON.stringify([body, visible, z]);
      if (msg === lastSent) return; // skip no-op IPC
      lastSent = msg;
      void client
        .browserSetRect({ x: body.left, y: body.top, w: body.width, h: body.height }, z)
        .then(() => client.browserSetVisible(visible))
        .catch(() => {}); // self-corrects on the next camera tick
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
      });
    };
    setBrowserSyncHandler(schedule);

    let unNav: (() => void) | null = null;
    void (async () => {
      unNav = await client.onBrowserNav((url) => {
        if (disposed) return;
        useCardStore.getState().update(BROWSER_ID, { url });
        setUrlInput(url);
        setError(null);
        // The title settles after load; best-effort fetch shortly after.
        window.setTimeout(() => {
          void client
            .browserStatus()
            .then((s) => {
              if (!disposed) setTitle(s.title || url);
            })
            .catch(() => {});
        }, 600);
      });
      if (disposed) return;
      const body = bodyRect();
      try {
        await client.browserOpen(
          card.url,
          body
            ? { x: body.left, y: body.top, w: body.width, h: body.height }
            : { x: 0, y: 0, w: 800, h: 600 },
          cameraRef.current.z
        );
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : String(e));
        return;
      }
      sync(); // position with the settled grid rect, then reveal
    })();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      setBrowserSyncHandler(null);
      unNav?.();
      void client.browserClose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reposition when the grid moves the card or an overlay opens/closes.
  useEffect(() => {
    syncBrowserRect();
  }, [card.x, card.y, card.w, card.h, blockers]);

  const commitUrl = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    setError(null);
    void openBrowser(urlInput).catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    );
  };

  const close = (e: ReactPointerEvent) => {
    e.stopPropagation();
    closeBrowser();
  };

  // Same drag-to-reorder gesture as TerminalWindow; the webview is hidden for
  // the duration so the chrome can move freely above the canvas.
  const beginDrag = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("input,button")) return;
    e.stopPropagation();
    hiddenRef.current = true;
    syncBrowserRect();
    const z = cameraRef.current.z;
    const sx = e.clientX,
      sy = e.clientY;
    const ox = card.x,
      oy = card.y;
    let nx = ox,
      ny = oy;
    const onMove = (ev: PointerEvent) => {
      nx = ox + (ev.clientX - sx) / z;
      ny = oy + (ev.clientY - sy) / z;
      const el = wrapRef.current;
      if (el) el.style.transform = `translate(${nx}px, ${ny}px)`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const el = wrapRef.current;
      if (el) el.style.transform = `translate(${card.x}px, ${card.y}px)`;
      const { cards, moveToIndex } = useCardStore.getState();
      const slot = nearestSlotIndex(
        { x: nx + card.w / 2, y: ny + card.h / 2 },
        cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
      );
      const from = cards.findIndex((c) => c.id === BROWSER_ID);
      if (slot !== -1 && slot !== from) moveToIndex(BROWSER_ID, slot);
      hiddenRef.current = false;
      syncBrowserRect();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={wrapRef}
      className="terminal-window"
      style={{ transform: `translate(${card.x}px, ${card.y}px)`, width: card.w, height: card.h }}
    >
      <div className="terminal-header" style={{ height: HEADER_H }} onPointerDown={beginDrag}>
        <button
          className="browser-nav-btn"
          title="Back"
          onPointerDown={(e) => {
            e.stopPropagation();
            void client.browserBack();
          }}
        >
          <ArrowLeftIcon />
        </button>
        <button
          className="browser-nav-btn"
          title="Reload"
          onPointerDown={(e) => {
            e.stopPropagation();
            void client.browserReload();
          }}
        >
          <ReloadIcon />
        </button>
        <input
          className={`browser-urlbar${error ? " browser-error" : ""}`}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={commitUrl}
          onPointerDown={(e) => e.stopPropagation()}
          spellCheck={false}
          title={error ?? title}
        />
        <button className="terminal-close" title="Close" onPointerDown={close}>
          <CloseIcon />
        </button>
      </div>
      {/* The native webview paints above this body; the hint shows through
          before the first load and whenever the webview is hidden. */}
      <div className="terminal-body" style={{ top: HEADER_H, bottom: 0 }}>
        <div className="browser-body-hint">{error ?? "loading…"}</div>
      </div>
    </div>
  );
}

// Same shallow-compare rationale as TerminalWindow.
export const BrowserWindow = memo(BrowserWindowInner);
```

- [ ] **Step 5: Render it from `src/wall/TerminalOverlay.tsx`**

Replace the `null` branch from Task 2:

```tsx
import { BrowserWindow } from "./BrowserWindow";
// …
{cards.map((c) =>
  c.kind === "terminal" ? (
    <TerminalWindow key={c.id} terminal={c} cameraRef={cameraRef} />
  ) : (
    <BrowserWindow key={c.id} card={c} cameraRef={cameraRef} />
  )
)}
```

- [ ] **Step 6: Hook the camera rAF and blockers**

`src/wall/WallView.tsx`:
- Import `{ syncBrowserRect }` from `./browserSync` and `{ useBlocksBrowser }` from `./browserVisibility`.
- In `applyCamera`'s rAF callback, after the layer transform line, add `syncBrowserRect();`.
- In the component body add `useBlocksBrowser(gearOpen);`.

`src/wall/LaunchMenu.tsx`: import `{ useBlocksBrowser }` from `./browserVisibility` and add `useBlocksBrowser(open);` after the `useState`.

`src/wall/Toolbar.tsx`: same — `useBlocksBrowser(open);` after its `useState` (the wall-switcher dropdown).

- [ ] **Step 7: Styles in `src/App.css`** (append near the terminal-window styles)

```css
/* ---- browser card ---- */
.browser-urlbar {
  flex: 1;
  min-width: 0;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(243, 238, 229, 0.12);
  border-radius: 6px;
  color: #f3eee5;
  font: 11px "Geist Mono", ui-monospace, monospace;
  padding: 2px 8px;
}
.browser-urlbar:focus {
  outline: none;
  border-color: rgba(215, 154, 61, 0.5);
}
.browser-urlbar.browser-error {
  border-color: rgba(217, 108, 79, 0.6);
  color: #d96c4f;
}
.browser-nav-btn {
  background: none;
  border: none;
  color: #b9b2a6;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 2px;
}
.browser-nav-btn:hover {
  color: #f3eee5;
}
.browser-body-hint {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #6f6a60;
  font: 12px "Geist Mono", ui-monospace, monospace;
}
```

- [ ] **Step 8: Typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(browser): browser card chrome with native webview rect sync"
```

---

### Task 8: Auto-open hookup in sessions.ts

**Files:**
- Modify: `src/wall/sessions.ts`

- [ ] **Step 1: Wire the scanner into `ensureSession`**

Add imports:

```ts
import { createUrlScanner } from "./urlScanner";
import { autoOpenFromTerminal } from "./browserActions";
```

In `ensureSession`, next to the `activity` line, create a per-session decoder + scanner:

```ts
const activity = getActivityRef(id);
// Dev-server URLs in this terminal's output auto-open the wall browser.
const decoder = new TextDecoder();
const scanUrls = createUrlScanner((url) => autoOpenFromTerminal(id, url));
```

And extend `spawnPty`'s `onData` callback:

```ts
onData: (bytes) => {
  if (disposed) return;
  activity.current = recordOutput(activity.current, Date.now());
  scanUrls(decoder.decode(bytes, { stream: true }));
  term.write(bytes);
},
```

- [ ] **Step 2: Typecheck + suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS (scanner + actions logic already covered by Tasks 1 and 6).

- [ ] **Step 3: Commit**

```bash
git add src/wall/sessions.ts
git commit -m "feat(browser): auto-open wall browser from terminal dev-server urls"
```

---

### Task 9: Vibe commands

**Files:**
- Modify: `src/wall/WallView.tsx`

- [ ] **Step 1: Register the five commands**

Add imports to `WallView.tsx`:

```ts
import { browserCard, closeBrowser, openBrowser } from "./browserActions";
import { browserBack, browserRead } from "../browser/client";
```

Add these `useVibeCommand` blocks after the existing `send_to_terminal` registration (same pattern as the others — thrown errors become result text via the registry):

```tsx
useVibeCommand({
  name: "open_browser",
  description:
    "Open the wall's browser at a URL, or navigate it if already open. Use when the user asks to open a website or preview a local dev server.",
  parameters: {
    type: "object",
    properties: { url: { type: "string", description: "URL to open; scheme optional" } },
  },
  run: (args) => openBrowser(args.url ? String(args.url) : undefined),
});

useVibeCommand({
  name: "close_browser",
  description: "Close the wall's browser window.",
  run: () => closeBrowser(),
});

useVibeCommand({
  name: "browser_back",
  description: "Go back one page in the wall browser's history.",
  run: async () => {
    if (!browserCard()) return "Error: the browser is not open.";
    await browserBack();
    return "Went back a page.";
  },
});

useVibeCommand({
  name: "read_browser",
  description:
    "Read the current page in the wall's browser. Returns the page title and visible text so you can answer questions about what's on screen.",
  run: async () => {
    if (!browserCard()) return "Error: the browser is not open.";
    const { title, text } = await browserRead();
    return `Page "${title}":\n${text}`;
  },
});

useVibeCommand({
  name: "focus_browser",
  description: "Zoom the camera in on the browser window. Use when the user says 'focus the browser' or wants to look at the page.",
  run: () => {
    const c = browserCard();
    if (!c) return "Error: the browser is not open.";
    const api = apiRef.current;
    const st = api?.getAppState() as AppStateLike | undefined;
    if (api && st) {
      const cam = fitCamera(
        { x: c.x, y: c.y, w: c.w, h: c.h },
        { w: st.width, h: st.height },
        48,
        FOCUS_MAX_ZOOM
      );
      api.updateScene({
        appState: { scrollX: cam.x, scrollY: cam.y, zoom: { value: cam.z as NormalizedZoomValue } },
      });
      applyCamera(cam);
    }
    return "Focused on the browser.";
  },
});
```

- [ ] **Step 2: Typecheck + suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/wall/WallView.tsx
git commit -m "feat(vibe): browser commands (open/close/back/read/focus)"
```

---

### Task 10: Persistence + launch-menu entry

**Files:**
- Modify: `src/wall/WallView.tsx`, `src/wall/LaunchMenu.tsx`

- [ ] **Step 1: Save the browser in `buildDoc` (WallView.tsx)**

```ts
const buildDoc = (): WallDoc | null => {
  const api = apiRef.current;
  if (!api) return null;
  const st = api.getAppState();
  const cards = useCardStore.getState().cards;
  const browser = cards.find((c) => c.kind === "browser");
  return {
    scene: { /* unchanged */ },
    terminals: terminalsOf(cards).map(({ id, x, y, w, h, presetId, cwd, name }) => ({
      id, x, y, w, h, presetId, cwd, name,
    })),
    background: backgroundRef.current,
    gridAnchor: useCardStore.getState().anchor ?? undefined,
    browser: browser ? { url: browser.url, gridIndex: cards.indexOf(browser) } : undefined,
  };
};
```

- [ ] **Step 2: Restore it on wall load (WallView.tsx)**

In the load effect, after building the terminal cards array (Task 2's code), insert the browser at its saved slot before `setState`:

```ts
if (doc?.browser) {
  const i = Math.max(0, Math.min(doc.browser.gridIndex, cards.length));
  cards.splice(i, 0, {
    kind: "browser",
    id: BROWSER_ID,
    url: doc.browser.url,
    x: 0,
    y: 0,
    w: CELL.w,
    h: CELL.h, // placeholder; the grid layout positions it
  });
}
useCardStore.setState({ anchor: doc?.gridAnchor ?? null, cards });
```

(`BROWSER_ID` is already imported via Task 9's `browserActions` import — extend that import; `CELL` is already imported from `./gridLayout`.)

- [ ] **Step 3: Launch-menu "Browser" entry**

`src/wall/LaunchMenu.tsx` — add a prop and a fixed item under the preset list:

```tsx
import { GlobeIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon } from "./icons";

export function LaunchMenu({
  presets, onLaunch, onLaunchBrowser,
}: { presets: Preset[]; onLaunch: (presetId: string) => void; onLaunchBrowser: () => void }) {
```

inside the `launch-menu` div, after the presets `map`:

```tsx
<button
  className="launch-item"
  onPointerDown={() => { setOpen(false); onLaunchBrowser(); }}
>
  <span className="launch-ic" style={{ display: "grid", placeItems: "center" }}>
    <GlobeIcon />
  </span>
  Browser
</button>
```

`src/wall/WallView.tsx` — pass the handler:

```tsx
<LaunchMenu presets={presets} onLaunch={addTerminal} onLaunchBrowser={() => { void openBrowser(); }} />
```

- [ ] **Step 4: Typecheck + suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wall/WallView.tsx src/wall/LaunchMenu.tsx
git commit -m "feat(browser): wall persistence and launch-menu entry"
```

---

### Task 11: Full verification

- [ ] **Step 1: Full automated suite**

Run: `npx tsc --noEmit && npx vitest run && cd src-tauri && cargo check && cargo test && cd ..`
Expected: everything green.

- [ ] **Step 2: Manual checklist (`npm run tauri dev`)**

In order — each item must visibly work before checking it:

1. Open a wall, open a terminal, run `npm run dev` in a Vite project → browser card auto-opens at `http://localhost:5173/` and the grid re-flows.
2. Ctrl-C and rerun the dev server → no second auto-open, no navigation hijack.
3. Pan and zoom the canvas → the page stays glued to its card and scales with zoom.
4. Open the settings modal → webview hides; close it → webview returns. Same for the launch menu and the toolbar's wall switcher.
5. Type `github.com` in the URL bar + Enter → loads (proves arbitrary sites work).
6. Drag the browser card to another grid slot → chrome drags, webview hides during the drag, grid reorders on release.
7. Voice: "open google dot com" → navigates. "What's on the page?" → vibe answers from `read_browser`. "Go back" → previous page. "Focus the browser" → camera zooms to the card. "Close the browser" → card closes, grid re-flows.
8. Reopen the browser, exit the wall, re-enter → browser restores at its slot and URL.
9. Close the browser card with its ✕ → native webview disappears with it.

- [ ] **Step 3: Final commit & wrap-up**

Commit any checklist fixes, then use superpowers:finishing-a-development-branch.

---

## Self-Review Notes (spec → task coverage)

- Any-website browsing, child webview, rect/zoom sync, hide-under-overlays, destroy-on-exit → Tasks 4, 7.
- Cards array with `kind` discriminator; grid/drag/camera reuse → Task 2.
- Auto-open scanner + once-per-URL rules → Tasks 1, 6, 8.
- Five vibe commands → Task 9 (handlers delegate to tested actions).
- Page reading with 3s timeout → Task 5.
- Persistence (`WallDoc.browser`), URL bar, launch-menu entry → Tasks 2, 7, 10.
- Error handling: invoke errors → card/url-bar error state + vibe error text (Tasks 7, 9); page-level failures render WebView2's own error page, visible through the card.
- Testing: scanner, actions, cards store under vitest; `parse_url` under cargo; lifecycle via the Task 11 manual checklist.
