# Embedded Browser — Design

**Date:** 2026-06-12
**Status:** Approved

## Summary

Add a single in-wall browser that opens as a card in the managed grid, exactly
like terminals do. It auto-opens when a terminal prints a local dev-server URL,
displays any website (not just localhost), and is fully controllable by vibe
(open / close / navigate / back / read the page).

## Requirements (user-confirmed)

- Displays **any website**, not just localhost dev servers.
- Vibe can **open, close, navigate, go back, and read** the page (title + text).
- A localhost URL printed in any terminal **auto-opens the browser once per
  URL** — dev-server restarts never re-open or hijack it.
- **One browser per wall.** When it opens, the grid re-flows to include it,
  same as adding a terminal.

## Architecture

### Browser content: native child WebView2

Arbitrary sites (GitHub, Google, most docs) refuse to load in iframes, so the
browser content is a **native child webview** created by Rust inside the main
window (Tauri 2 `unstable` cargo feature → `window.add_child`). This gives a
real top-level browsing context: any site loads, Rust can drive navigation,
and WebView2 `ExecuteScript` (Windows-only — matches this app) supports page
reading.

Accepted trade-offs:

- A native webview always paints **above** the DOM. Whenever an overlay that
  must appear on top opens (settings modal, launch menu, wall switcher), the
  webview is hidden via `browser_set_visible(false)` and restored after. Same
  when the card is fully off-screen.
- During fast pans the webview may lag the canvas by a frame. Acceptable; the
  next camera tick corrects it.

### Grid integration: cards with a `kind` discriminator

`useTerminalStore`'s `terminals: TerminalState[]` generalizes to a **cards
array** with `kind: "terminal" | "browser"`:

- Terminal cards keep their current shape (`name`, `presetId`, `cwd`, rect).
- The browser card carries `{ id, kind: "browser", url, x, y, w, h }` and uses
  the same grid cell size as terminals.

Grid layout (`gridPositions`), auto-fit camera, drag-reorder
(`nearestSlotIndex` / `moveToIndex`), and the membership-change re-layout
subscription all operate on the array, so the browser participates in layout,
camera fitting, and drag-reordering with no new layout code.
`TerminalOverlay` renders `TerminalWindow` for terminal cards and a new
`BrowserWindow` for the browser card.

### BrowserWindow component (chrome only)

Renders the card chrome in the same visual skin as terminal cards:

- Header: drag handle, editable URL bar, back / reload / close buttons.
- Body: empty placeholder — the native webview is positioned over it.
- Error state: inline message in the card when navigation or webview creation
  fails (card stays usable for retry / close).

### Rect + zoom syncing

A sync routine converts the card body's world rect through the camera into
window-logical coordinates and calls `browser_set_rect { x, y, w, h, zoom }`:

- Hooked into the same rAF that already moves the terminal layer on pan/zoom
  (`applyCamera` in `WallView`), plus card drag and grid re-layout.
- The webview's page-zoom factor is set to camera `z`, so page content scales
  with the wall; size in logical px = world size × `z`.
- At most one IPC call per animation frame; skipped when the rect is
  unchanged; clamped to window bounds.

### Lifecycle

- Created on open (auto, vibe, or manual); **destroyed on wall exit / switch**.
- URL persisted in the `WallDoc`; reopening the wall restores the card at its
  grid slot and navigates to the saved URL.

## Dev-server auto-open

Detection hooks into the one place all terminal output flows: the `onData`
callback in `sessions.ts`. Each session feeds bytes through a scanner that:

- Strips ANSI escape codes.
- Keeps a short rolling tail buffer so URLs split across PTY chunks still
  match.
- Matches `http(s)://` + `localhost | 127.0.0.1 | 0.0.0.0 | [::1]` with
  optional port and path; `0.0.0.0` is rewritten to `localhost` before
  opening.

Open-once rules (wall-level in-memory `seenUrls` set, cleared on app launch):

1. URL already seen → do nothing (restarts never re-open or hijack).
2. New URL, browser **closed** → record it and open the browser there.
3. New URL, browser **open** → record it only; vibe or the user can navigate
   deliberately.

## Vibe commands

Registered in `WallView` via `useVibeCommand`, so they exist only while a wall
is open. All errors are returned as result text (existing `commands.ts`
contract).

| Command | Behavior |
| --- | --- |
| `open_browser { url? }` | Opens the browser card at a URL (grid re-flows); if already open, navigates it. |
| `close_browser` | Closes the card; grid re-flows back. |
| `browser_back` | History back. |
| `read_browser` | Returns page title + visible text (truncated ~8k chars). |
| `focus_browser` | Zooms the camera onto the browser card (same mechanics as `focus_terminal`). |

## Rust module

New `src-tauri/src/browser` module mirroring the `pty` module's shape.
Requires the `unstable` feature on the `tauri` dependency.

Commands: `browser_open`, `browser_navigate`, `browser_back`,
`browser_reload`, `browser_set_rect`, `browser_set_visible`, `browser_close`,
`browser_read`.

Events: `browser://nav` pushed to the frontend on navigation / title change
with `{ url, title, canGoBack }` — updates the URL bar and card title.

`browser_read` uses WebView2 `ExecuteScript` to return `document.title` +
`document.body.innerText` (truncated), with a 3-second timeout so a hung page
cannot stall the voice loop.

## Persistence

`WallDoc` gains optional `browser: { url, gridIndex }`. Saved with the
existing debounced wall save; restored on wall load. `seenUrls` is not
persisted.

## Manual entry points

- Editable URL bar in the card header.
- "Browser" entry in the launch menu.

## Error handling

- Navigation failure (unreachable host, `NavigationCompleted` error) → error
  state in the URL bar + plain-text error to vibe.
- Child-webview creation failure → inline error in the card; retry / close
  still work.
- `browser_read` timeout (3 s) → error text to vibe.
- Auto-open failures are silent apart from the card's own error state — a
  broken dev server must not interrupt the user.
- Rect sync clamps to window bounds and self-corrects on the next camera
  tick; no permanent stranding.

## Testing

Pure logic gets vitest coverage (matching existing codebase style):

- URL scanner: ANSI stripping, chunk-split URLs, dedupe + open-once rules.
- World-rect → window-rect camera math.
- Cards-array generalization: grid layout, reorder, and persistence stay
  correct with a browser card present.
- Vibe command handlers with the Tauri invoke layer mocked.

Rust: unit tests for rect conversion / clamping.

Manual checklist (needs a real window): run a Vite dev server in a wall
terminal → browser auto-opens on :5173 → pan/zoom stays glued → open settings
→ webview hides → "open github dot com" → loads → "what's on the page" → vibe
reads it → drag-reorder the browser card → exit wall and return → browser
restores at its slot and URL.
