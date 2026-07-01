# Themed Native Title Bar — Design

**Date:** 2026-07-01
**Component:** Vibe Space (vibe-space/)
**Status:** Approved, pending implementation plan

## Goal

Right now the Windows title bar is whatever the OS draws by default (`tauri.conf.json`
sets no `decorations`/`titleBarStyle`, so it's a plain default caption) — visually
disconnected from the app, which recolors itself per wall theme (Ember, Midnight,
Parchment, Moss, Plum, Slate) and per view. Make the title bar look like part of the
app: recolor the native caption strip (background, text, window border) to match
whatever the user is currently looking at, live, as they switch themes or views.

Native minimize/maximize/close buttons and Windows 11 snap-layout hover stay exactly
as-is — this is a recolor, not a replacement. No custom-drawn title bar.

## Approach: DWM caption color, not a custom title bar

Windows 11 (build 22000+ for the border, 22621+ for caption/text) exposes
`DwmSetWindowAttribute` with three attributes we can set on our own `HWND`:

- `DWMWA_CAPTION_COLOR` — the caption's background fill
- `DWMWA_TEXT_COLOR` — the caption title text color (for contrast against whatever we set the caption to)
- `DWMWA_BORDER_COLOR` — a thin tint around the whole window frame

This is the same mechanism Windows Terminal and Files use. It's additive to the
existing native chrome — no `decorations: false`, no reimplementing buttons/drag
regions, no per-OS window chrome to maintain. On any Windows version where these
attributes aren't supported, or on non-Windows targets, the call is a no-op: the
title bar silently stays the plain OS default. That's an acceptable ceiling, not a
bug to work around, given the goal is to *recolor* the native bar, not replace it
everywhere.

A fully custom-drawn bar (`decorations: false`) was considered and rejected: it
would work cross-platform, but loses the native Win11 snap-layout hover menu, which
the whole point of this feature is to keep.

## Color source: the current view's live background, not a static token

Investigated how theming actually flows through the app before assuming a
mechanism:

- Only `--accent` (and tokens derived from it via `color-mix`) change at runtime —
  set by `applyAccent()` in `src/settings/themes.ts`, called from `WallView.tsx`
  whenever a wall's background is loaded or changed (4 call sites: initial doc
  load, remote doc load, `changeBg()`, and an unmount reset to `DEFAULT_ACCENT`).
- The root `--bg` token (`#12110f`) is **static** — never overridden at runtime.
  Floating chrome (toolbar islands, panels, footer) uses `--glass`/`--surface`,
  also static, in `theme.css`.
- What actually changes dramatically per theme is the **wall's own background** —
  `WallBackground.tsx` renders a full-bleed `.wall-bg` div (`z-index: -1`) from the
  wall's `Background` value (`{kind: "color"|"image"|"video"}`). This is where
  Parchment goes near-white and Midnight goes cool-dark.
- Other views (Start, Design, Teams) have no per-theme background of their own —
  they sit on the static dark chrome.

So the title bar's color source is: **the active wall's live background when a wall
is open, falling back to the static `--bg` (`#12110f`) everywhere else** (Start,
Design, Teams, and while no wall is loaded yet). This makes the bar a literal
extension of whatever's on screen — merged with the canvas on a wall, matching the
app's own dark chrome elsewhere — rather than introducing a new "app-wide light/dark
chrome" concept that doesn't exist anywhere else in the app today.

Only `{kind: "color"}` backgrounds resolve to an exact caption color. `image` and
`video` backgrounds fall back to the static `--bg` — sampling a dominant pixel color
from an image/video is real added complexity (canvas sampling, video-frame capture)
for a cosmetic feature and is called out as **out of scope** below.

The window border color always tracks the current `--accent` (already resolved by
`applyAccent()`), independent of the caption background — this keeps each theme's
identity visible via a colored frame even in the fallback (default-chrome) case.

## Frontend: one pure function, two call sites

**New pure function** `resolveTitlebarColors(background: Background | null, accent: string): { bg: string; text: string; border: string }`, colocated in
`src/settings/themes.ts` next to `applyAccent`/`onAccentText`:

- `bg`: `background?.kind === "color" ? background.color : "#12110f"` (the existing
  `--bg` literal — extract a `DEFAULT_TITLEBAR_BG` constant so it's not duplicated
  as a magic string).
- `text`: reuse the existing luminance check from `onAccentText()` (generalize it to
  take an arbitrary background color, not just an accent) — dark ink on light
  backgrounds, near-white on dark ones.
- `border`: `accent`, passed straight through.

**New helper** `syncTitlebar(background: Background | null)` — computes the colors
above (reading the live `--accent` off `document.documentElement`, which
`applyAccent()` already set) and calls the Tauri command, swallowing any error
(non-Windows, unsupported Windows build — a real boundary condition, not a
hypothetical):

```ts
invoke("set_titlebar_theme", colors).catch(() => {});
```

**Call sites:**
- `WallView.tsx` — alongside each of the 4 existing `applyAccent(...)` calls, add a
  sibling `syncTitlebar(...)` call with the same `Background` value already in
  scope at that point. The unmount cleanup calls `syncTitlebar(null)` alongside its
  existing `applyAccent(DEFAULT_ACCENT)`.
- `App.tsx` — one `useEffect` keyed on `view.kind`: whenever the active view is
  **not** `"wall"` (Start, Teams, Design), call `syncTitlebar(null)` to fall back to
  the static default. (Settings is a modal rendered inside `WallView`, not a
  separate `view.kind` — it doesn't touch the wall's background, so it needs no
  extra hook.) This effect also covers first paint, since `view` starts as
  `{kind: "start"}`.

No polling, no MutationObserver — every place the background/theme can change
already funnels through `applyAccent()` or a `view` transition, so hooking those
same points is sufficient.

## Backend: one Rust command

New module `src-tauri/src/titlebar.rs`:

```rust
#[tauri::command]
pub fn set_titlebar_theme(window: tauri::WebviewWindow, bg: String, text: String, border: String) -> Result<(), String>
```

- Parses each `#rrggbb` string into a `COLORREF` (`0x00BBGGRR` — reverse byte order
  from the hex string).
- Gets the window's `HWND` via `window.hwnd()`.
- Calls `DwmSetWindowAttribute` three times (`DWMWA_CAPTION_COLOR = 35`,
  `DWMWA_TEXT_COLOR = 36`, `DWMWA_BORDER_COLOR = 34`), ignoring individual
  attribute failures (older Windows may support border but not caption/text) —
  best-effort, not all-or-nothing.
- Gated `#[cfg(windows)]`; a `#[cfg(not(windows))]` stub with the same signature
  returns `Ok(())` immediately, so the command is always registered and the
  frontend's `invoke()` never has to special-case platform.

**Dependency:** add `windows = { version = "0.61", features = ["Win32_Foundation", "Win32_Graphics_Dwm"] }`
to `[target.'cfg(windows)'.dependencies]` in `Cargo.toml`. `windows 0.61.3` is
already resolved transitively in `Cargo.lock` (via `webview2-com`/`tauri`), so this
adds a feature-scoped dependency on an already-present version rather than a new
major version into the build.

Register `titlebar::set_titlebar_theme` in the `invoke_handler![]` list in `lib.rs`.

## Testing

- **Unit (Vitest):** `resolveTitlebarColors()` — color background resolves to
  itself with correct text contrast; `null`/image/video background resolves to the
  default; border always equals the passed-in accent. Follows the existing
  `themes.test.ts` pattern.
- **Manual (Windows 11 22621+):**
  - Switch between all 6 wall themes on an open wall — caption background, text
    contrast, and window border all update live.
  - Set a custom (non-theme) solid color background — caption matches it exactly.
  - Set an image or video background — caption falls back to the default dark, not
    a stale or wrong color.
  - Navigate Start → Wall → Design → Teams → Start — caption resets to default
    outside a wall, picks the wall's color back up on return.
  - Open Settings (modal) — caption is unaffected (still whatever the wall was
    showing).
- **Manual (compatibility):** on Windows 10 / Windows 11 pre-22621, or in dev
  outside Tauri (`npm run dev` in a browser), confirm the app runs normally with a
  plain default title bar and no console errors — the `.catch(() => {})` should
  make this silent.

## Out of scope

- Sampling a dominant color from `image`/`video` wall backgrounds — falls back to
  the static default (see above).
- A fully custom-drawn title bar (buttons, drag region reimplemented in HTML) —
  rejected in favor of keeping native snap layouts.
- macOS/Linux equivalents (e.g. macOS `titleBarStyle`/vibrancy) — this spec is
  Windows-only; other platforms simply keep their existing default title bar via
  the `#[cfg(not(windows))]` no-op stub.
- Per-page color overrides independent of the live background (e.g. a specific
  color for the Settings modal) — explicitly decided against; the bar passively
  follows whatever `--accent`/wall background is already active.
