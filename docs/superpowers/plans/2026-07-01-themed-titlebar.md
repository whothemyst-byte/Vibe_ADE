# Themed Native Title Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recolor Vibe Space's native Windows title bar (caption background, caption text, window border) to live-match the current wall's background and accent, instead of the plain default OS caption.

**Architecture:** A new Rust command `set_titlebar_theme` calls `DwmSetWindowAttribute` on the app's own `HWND` to set `DWMWA_CAPTION_COLOR`/`DWMWA_TEXT_COLOR`/`DWMWA_BORDER_COLOR`. A new frontend helper `syncTitlebar()` resolves the right colors from the active wall's `Background` + the live `--accent` CSS var and invokes that command. It's wired into the exact points that already call `applyAccent()` (wall load/change/unmount in `WallView.tsx`) plus one `App.tsx` effect that resets to the default whenever the active view isn't a wall.

**Tech Stack:** Tauri 2 (Rust) + `windows` crate 0.61 (`Win32_Foundation`, `Win32_Graphics_Dwm`) on the backend; React/TypeScript + Vitest on the frontend.

**Spec:** `docs/superpowers/specs/2026-07-01-themed-titlebar-design.md`

## Global Constraints

- Windows-only feature. `DWMWA_BORDER_COLOR` requires Windows 11 build 22000+; `DWMWA_CAPTION_COLOR`/`DWMWA_TEXT_COLOR` require build 22621+. Unsupported builds and non-Windows targets must no-op silently — never throw, never log noise.
- Native minimize/maximize/close buttons and Win11 snap-layout hover stay untouched — no `decorations: false`, no custom-drawn chrome.
- Colors are `#rrggbb` hex strings end-to-end between frontend and backend.
- Caption background source: the active wall's `Background` when `kind: "color"`; otherwise (image, video, no wall open) fall back to the static default `#12110f` (the existing `--bg` value). Never sample pixels from image/video backgrounds.
- Border color source: always the current `--accent` value, independent of the caption background.
- `windows = "0.61"` — matches the version already resolved transitively in `Cargo.lock` (via `webview2-com`/`tauri`); do not introduce a second major version.

---

### Task 1: Rust — `set_titlebar_theme` command

**Files:**
- Create: `src-tauri/src/titlebar.rs`
- Modify: `src-tauri/Cargo.toml` (add dependency)
- Modify: `src-tauri/src/lib.rs:1-5` (register module), `src-tauri/src/lib.rs:37-73` (register command)

**Interfaces:**
- Produces: Tauri command `set_titlebar_theme(bg: string, text: string, border: string) -> Promise<void>`, invokable from the frontend via `invoke("set_titlebar_theme", { bg, text, border })`. Resolves (never rejects) on non-Windows or unsupported Windows builds.

- [ ] **Step 1: Add the `windows` dependency**

Edit `src-tauri/Cargo.toml` — add a line to the existing Windows-only dependency block:

```toml
[target.'cfg(windows)'.dependencies]
webview2-com = "0.38"
windows-core = "0.61"
windows = { version = "0.61", features = ["Win32_Foundation", "Win32_Graphics_Dwm"] }
```

- [ ] **Step 2: Write the failing unit test for hex → COLORREF parsing**

Create `src-tauri/src/titlebar.rs` with just the test module first:

```rust
// Recolors the native Windows caption/border to match the app's current theme.
// See docs/superpowers/specs/2026-07-01-themed-titlebar-design.md.

#[cfg(windows)]
mod imp {
    /// Parses a `#rrggbb` (or `rrggbb`) string into a Win32 `COLORREF` (`0x00bbggrr`).
    pub fn parse_colorref(hex: &str) -> Result<u32, String> {
        todo!()
    }

    #[cfg(test)]
    mod tests {
        use super::parse_colorref;

        #[test]
        fn parses_rgb_into_bgr_colorref() {
            // #d79a3d -> r=0xd7 g=0x9a b=0x3d -> COLORREF 0x003d9ad7
            assert_eq!(parse_colorref("#d79a3d").unwrap(), 0x003d_9ad7);
        }

        #[test]
        fn accepts_hex_without_leading_hash() {
            assert_eq!(parse_colorref("000000").unwrap(), 0);
        }

        #[test]
        fn white_maps_to_all_bits_set() {
            assert_eq!(parse_colorref("#ffffff").unwrap(), 0x00ff_ffff);
        }

        #[test]
        fn rejects_wrong_length() {
            assert!(parse_colorref("#fff").is_err());
        }
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test titlebar`
Expected: compile error or panic from `todo!()` (the `parses_rgb_into_bgr_colorref` etc. do not pass).

- [ ] **Step 4: Implement `parse_colorref`**

Replace the `todo!()` body in `src-tauri/src/titlebar.rs`:

```rust
    pub fn parse_colorref(hex: &str) -> Result<u32, String> {
        let hex = hex.trim_start_matches('#');
        if hex.len() != 6 {
            return Err(format!("expected #rrggbb, got \"{hex}\""));
        }
        let r = u8::from_str_radix(&hex[0..2], 16).map_err(|e| e.to_string())?;
        let g = u8::from_str_radix(&hex[2..4], 16).map_err(|e| e.to_string())?;
        let b = u8::from_str_radix(&hex[4..6], 16).map_err(|e| e.to_string())?;
        Ok(u32::from_le_bytes([r, g, b, 0]))
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test titlebar`
Expected: `test result: ok. 4 passed`

- [ ] **Step 6: Implement the DWM call and the Tauri command**

Add to `src-tauri/src/titlebar.rs`, inside `mod imp` (below `parse_colorref`, above the `#[cfg(test)]` block):

```rust
    use windows::Win32::Foundation::{COLORREF, HWND};
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    };

    fn set_attr(hwnd: HWND, attr: windows::Win32::Graphics::Dwm::DWMWINDOWATTRIBUTE, value: u32) {
        let value = COLORREF(value);
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd,
                attr,
                &value as *const COLORREF as *const core::ffi::c_void,
                std::mem::size_of::<COLORREF>() as u32,
            );
        }
    }

    /// Best-effort: each attribute is set independently, since older Windows 11
    /// builds support the border color but not caption/text color.
    pub fn set(hwnd: HWND, bg: &str, text: &str, border: &str) -> Result<(), String> {
        set_attr(hwnd, DWMWA_CAPTION_COLOR, parse_colorref(bg)?);
        set_attr(hwnd, DWMWA_TEXT_COLOR, parse_colorref(text)?);
        set_attr(hwnd, DWMWA_BORDER_COLOR, parse_colorref(border)?);
        Ok(())
    }
```

Then add the command at the bottom of the file, outside `mod imp`:

```rust
#[cfg(windows)]
#[tauri::command]
pub fn set_titlebar_theme(
    window: tauri::WebviewWindow,
    bg: String,
    text: String,
    border: String,
) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    imp::set(hwnd, &bg, &text, &border)
}

#[cfg(not(windows))]
#[tauri::command]
pub fn set_titlebar_theme(
    _window: tauri::WebviewWindow,
    _bg: String,
    _text: String,
    _border: String,
) -> Result<(), String> {
    Ok(())
}
```

- [ ] **Step 7: Register the module and command**

Modify `src-tauri/src/lib.rs`. Add the module declaration near the top (line 1-5):

```rust
mod browser;
mod design;
mod oauth;
mod pty;
mod store;
mod titlebar;
```

Add the command to the `invoke_handler![...]` list (after `oauth::start_oauth_loopback,` around line 72):

```rust
            oauth::start_oauth_loopback,
            titlebar::set_titlebar_theme,
```

- [ ] **Step 8: Build to verify it compiles**

Run: `cd src-tauri && cargo build`
Expected: builds successfully. If the `windows` crate's exact type signatures for `DwmSetWindowAttribute`/`DWMWINDOWATTRIBUTE`/`COLORREF` differ from what's above, fix the call to match the compiler's errors — this is the only step in the plan touching a live third-party API surface that can't be confirmed without compiling on this machine.

- [ ] **Step 9: Commit**

```bash
cd src-tauri
git add Cargo.toml Cargo.lock src/titlebar.rs src/lib.rs
git commit -m "feat(vibe-space): add set_titlebar_theme DWM caption-color command"
```

---

### Task 2: Frontend — color resolution (`themes.ts`)

**Files:**
- Modify: `src/settings/themes.ts:83-101` (generalize `onAccentText`, add new exports)
- Modify: `src/settings/themes.test.ts` (add tests)

**Interfaces:**
- Consumes: `Background` type from `../store/types` (already imported in `themes.ts`).
- Produces:
  - `readableTextColor(color: string): string` — replaces the private `onAccentText`.
  - `DEFAULT_TITLEBAR_BG: string` — `"#12110f"`.
  - `resolveTitlebarColors(background: Background | null, accent: string): { bg: string; text: string; border: string }`.
  - `syncTitlebar(background: Background | null): void` — side-effecting; reads `--accent` off `document.documentElement` and invokes the Task 1 command, consumed by Task 3 and Task 4.

- [ ] **Step 1: Write the failing tests**

Add to `src/settings/themes.test.ts` (new imports alongside the existing `import { THEMES, isThemeActive } from "./themes";`):

```ts
import {
  DEFAULT_TITLEBAR_BG,
  readableTextColor,
  resolveTitlebarColors,
  THEMES,
  isThemeActive,
} from "./themes";
```

Append these `describe` blocks to the file:

```ts
describe("readableTextColor", () => {
  it("returns dark ink for light colors", () => {
    expect(readableTextColor("#f3ead8")).toBe("#20170a");
  });

  it("returns near-white for dark colors", () => {
    expect(readableTextColor("#12110f")).toBe("#fbf6ec");
  });
});

describe("resolveTitlebarColors", () => {
  it("uses the background's own color when it's a solid color", () => {
    const result = resolveTitlebarColors({ kind: "color", color: "#f3ead8" }, "#d79a3d");
    expect(result.bg).toBe("#f3ead8");
    expect(result.text).toBe("#20170a");
    expect(result.border).toBe("#d79a3d");
  });

  it("falls back to the default titlebar background for a null background", () => {
    expect(resolveTitlebarColors(null, "#d79a3d").bg).toBe(DEFAULT_TITLEBAR_BG);
  });

  it("falls back to the default titlebar background for image and video backgrounds", () => {
    expect(resolveTitlebarColors({ kind: "image", path: "x.png" }, "#d79a3d").bg).toBe(DEFAULT_TITLEBAR_BG);
    expect(resolveTitlebarColors({ kind: "video", path: "x.mp4" }, "#d79a3d").bg).toBe(DEFAULT_TITLEBAR_BG);
  });

  it("always uses the passed accent as the border color", () => {
    expect(resolveTitlebarColors(null, "#5d8fb3").border).toBe("#5d8fb3");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- themes`
Expected: FAIL — `readableTextColor`, `resolveTitlebarColors`, `DEFAULT_TITLEBAR_BG` are not exported.

- [ ] **Step 3: Generalize `onAccentText` into `readableTextColor`**

In `src/settings/themes.ts`, replace:

```ts
/** Readable text color (#rrggbb) to lay on top of a filled accent button. */
function onAccentText(accent: string): string {
  const n = parseInt(accent.slice(1), 16);
  if (Number.isNaN(n)) return "#20170a";
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // Dark ink on light/mid accents; near-white on dark accents.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? "#20170a" : "#fbf6ec";
}
```

with:

```ts
/** Readable text color (#rrggbb) to lay on top of a filled color. */
export function readableTextColor(color: string): string {
  const n = parseInt(color.slice(1), 16);
  if (Number.isNaN(n)) return "#20170a";
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // Dark ink on light/mid colors; near-white on dark colors.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? "#20170a" : "#fbf6ec";
}
```

Update its one call site in `applyAccent` (same file, a few lines below):

```ts
export function applyAccent(accent: string): void {
  const root = document.documentElement;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--on-accent", readableTextColor(accent));
}
```

- [ ] **Step 4: Add `DEFAULT_TITLEBAR_BG` and `resolveTitlebarColors`**

Add to `src/settings/themes.ts`, after `applyAccent`:

```ts
/** Caption color used when no wall is open, or its background isn't a solid color. */
export const DEFAULT_TITLEBAR_BG = "#12110f";

/** Colors to paint the native Windows title bar with, mirroring the current view. */
export function resolveTitlebarColors(
  background: Background | null,
  accent: string
): { bg: string; text: string; border: string } {
  const bg = background?.kind === "color" ? background.color : DEFAULT_TITLEBAR_BG;
  return { bg, text: readableTextColor(bg), border: accent };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- themes`
Expected: PASS — all `readableTextColor` and `resolveTitlebarColors` cases green, and the pre-existing `THEMES`/`isThemeActive` tests still pass.

- [ ] **Step 6: Add `syncTitlebar`**

Add the import at the top of `src/settings/themes.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
```

Add after `resolveTitlebarColors`:

```ts
/**
 * Pushes the resolved colors to the native title bar. Windows-only; the
 * backend command no-ops elsewhere or on unsupported Windows builds, and any
 * failure (including running outside Tauri, e.g. `npm run dev` in a browser)
 * is swallowed since this is a purely cosmetic sync.
 */
export function syncTitlebar(background: Background | null): void {
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || DEFAULT_ACCENT;
  const colors = resolveTitlebarColors(background, accent);
  void invoke("set_titlebar_theme", colors).catch(() => {});
}
```

This step has no new automated test (it's a thin side-effecting wrapper around `invoke`, and the codebase has no existing pattern for mocking `@tauri-apps/api/core` in tests — see `src/design/watch.ts` for the same `invoke(...).catch(() => {})` shape used untested elsewhere). It's covered by the manual verification in Task 5.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/settings/themes.ts src/settings/themes.test.ts
git commit -m "feat(vibe-space): add titlebar color resolution and sync helper"
```

---

### Task 3: Wire into `WallView.tsx`

**Files:**
- Modify: `src/wall/WallView.tsx:33` (import), `:117`, `:169`, `:344`, `:349`

**Interfaces:**
- Consumes: `syncTitlebar(background: Background | null): void` from Task 2.

- [ ] **Step 1: Add the import**

In `src/wall/WallView.tsx`, change:

```ts
import { THEMES, accentForBackground, applyAccent, DEFAULT_ACCENT } from "../settings/themes";
```

to:

```ts
import { THEMES, accentForBackground, applyAccent, syncTitlebar, DEFAULT_ACCENT } from "../settings/themes";
```

- [ ] **Step 2: Sync after a shared-doc reload**

At line 117, change:

```ts
        applyAccent(accentForBackground(res.doc.background));
```

to:

```ts
        applyAccent(accentForBackground(res.doc.background));
        syncTitlebar(res.doc.background);
```

- [ ] **Step 3: Sync on initial wall load**

At line 169, change:

```ts
      applyAccent(accentForBackground(bg));
```

to:

```ts
      applyAccent(accentForBackground(bg));
      syncTitlebar(bg);
```

- [ ] **Step 4: Sync when the user changes the background**

At line 344, change:

```ts
  const changeBg = (bg: Background) => {
    backgroundRef.current = bg; setBackground(bg); applyAccent(accentForBackground(bg)); scheduleSave();
  };
```

to:

```ts
  const changeBg = (bg: Background) => {
    backgroundRef.current = bg; setBackground(bg); applyAccent(accentForBackground(bg)); syncTitlebar(bg); scheduleSave();
  };
```

- [ ] **Step 5: Reset on unmount**

At line 349, change:

```ts
  useEffect(() => () => applyAccent(DEFAULT_ACCENT), []);
```

to:

```ts
  useEffect(() => () => { applyAccent(DEFAULT_ACCENT); syncTitlebar(null); }, []);
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass (no test exercises `WallView.tsx` directly today, so this is a regression check on the rest of the suite).

- [ ] **Step 8: Commit**

```bash
git add src/wall/WallView.tsx
git commit -m "feat(vibe-space): sync native titlebar with the wall's background"
```

---

### Task 4: Wire into `App.tsx` (non-wall fallback)

**Files:**
- Modify: `src/App.tsx:1-15` (import), `:33-36` (add effect)

**Interfaces:**
- Consumes: `syncTitlebar(background: Background | null): void` from Task 2.

- [ ] **Step 1: Add the import**

In `src/App.tsx`, add alongside the other relative imports (near line 9):

```ts
import { syncTitlebar } from "./settings/themes";
```

- [ ] **Step 2: Add the reset effect**

In `src/App.tsx`, after the existing `wallsRef` effect (around line 36):

```ts
  const wallsRef = useRef<WallMeta[]>([]);
  useEffect(() => {
    void loadIndex().then((i) => { wallsRef.current = i; });
  }, [view]);

  useEffect(() => {
    if (view.kind !== "wall") syncTitlebar(null);
  }, [view.kind]);
```

This covers Start, Tasks, Teams, and Design — every `view.kind` other than `"wall"` — plus first paint, since `view` starts as `{ kind: "start" }`. When `view.kind` becomes `"wall"`, this effect does nothing further; `WallView`'s own load effect (Task 3, Step 3) immediately calls `syncTitlebar` with the real background.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(vibe-space): reset native titlebar to default outside a wall"
```

---

### Task 5: Manual verification

**Files:** none (no code changes — this task exercises the built app).

- [ ] **Step 1: Build and launch the dev app**

Run: `npm run app`
Expected: the app window opens with the default dark title bar (Start page is active, no wall open).

- [ ] **Step 2: Verify wall themes recolor the caption live**

Open a wall, then open Settings and switch through all 6 themes (Ember, Midnight, Parchment, Moss, Plum, Slate) one at a time.
Expected: on each switch, the title bar's caption background changes to match that theme's background color, the caption text stays readable (dark ink on light themes like Parchment, light text on dark themes), and the window border tint matches the theme's accent.

- [ ] **Step 3: Verify a custom solid-color background**

In Settings, set a custom background color not matching any theme (e.g. pick an arbitrary color via the color picker).
Expected: the caption exactly matches the chosen color.

- [ ] **Step 4: Verify image/video background fallback**

Set the wall's background to an image or a video.
Expected: the caption falls back to the default dark (`#12110f`), not a stale color from the previous background and not a crash/console error.

- [ ] **Step 5: Verify non-wall views**

From an open wall (with a non-default theme active), navigate to the Task Board, then Teams, then Design, then back to Start.
Expected: the caption resets to the default dark on each of those views. Opening the Settings modal (from within a wall) does not change the caption — it stays whatever the wall's background currently resolves to.

- [ ] **Step 6: Verify returning to a wall restores its color**

From Start, reopen the wall from Step 2/3.
Expected: the caption immediately matches that wall's current background again.

- [ ] **Step 7: Verify graceful fallback outside Tauri**

Run: `npm run dev` and open the app in a regular browser tab (not the Tauri window).
Expected: the app runs normally; no uncaught errors in the browser console from the `invoke("set_titlebar_theme", ...)` calls (they reject silently, per the `.catch(() => {})` in `syncTitlebar`).

- [ ] **Step 8: Note results**

No commit for this task. If any expectation above fails, file it as a follow-up rather than blocking — record which step failed and on what Windows build (`winver`), since `DWMWA_CAPTION_COLOR`/`DWMWA_TEXT_COLOR` require Windows 11 22621+ and older builds are expected to keep the default caption per the spec's compatibility ceiling.
