# Design Page — Figma-Grade Overhaul

**Date:** 2026-07-02
**Status:** Approved for implementation
**Scope:** `vibe-space/src/design/` (+ small additions in `src/store/persistence`, `App.css`)
**Canvas engine:** Excalidraw 0.18.x (kept — tldraw remains ruled out on licensing; custom engine ruled out on cost)
**Supersedes:** extends `2026-06-30-design-page-figma-redesign.md` (3-panel shell), which is implemented.

---

## Goal

Take the existing UI Design page (Figma-style shell over Excalidraw, file-backed, agent-syncing) from "works" to **Figma-grade**: rock-solid stability, precision editing, frames-as-artboards with export, styles/assets, and a deep layers tree. The page must serve two purposes equally: a genuine standalone design tool, and the design→agent-builds-it loop (design file referenced into the terminal).

The `.vibe-design.json` format stays **version 1 and backward compatible** throughout. All new metadata rides in `customData` (which Excalidraw preserves and `normalize.ts` already serializes). Old files load unchanged; agents keep reading/writing the same format.

## Current defects (audit, 2026-07-02)

These are the concrete causes of the "general jank":

1. **Stale inspector values** — `NumInput` uses `defaultValue` with `key={elId-field}`; after a canvas drag/resize the panel shows old numbers until reselection.
2. **Full re-render per pointer event** — `onChange` pushes the entire element array into `DesignPage` state; the layers list and inspector re-render every frame during any drag.
3. **Panel edits bypass the engine** — `patchElements` spread-copies without bumping `version`/`versionNonce` and `updateScene` is called without capturing undo history: edits can be dropped by reconciliation and are invisible to Ctrl+Z.
4. **Zoom not anchored** — zoom buttons set `zoom.value` with no scroll compensation; the viewport jumps instead of zooming around center.
5. **Debounced save without flush** — 300ms debounce with no flush on back-navigation/window close; the last edit can be lost.
6. **Hide is a leaky hack** — opacity-0 "hidden" layers are still clickable and would still export; previous opacity lives only in component state (lost on remount).

---

## Architecture (foundation)

A thin, disciplined layer between Excalidraw and everything else. Three pieces:

### 1. `designStore.ts` — external store

- Excalidraw `onChange` writes into a plain external store (not React state): `{ elements, selectedIds, zoom, scrollX, scrollY, activeTool, viewBackgroundColor }`.
- Panels subscribe via `useSyncExternalStore` with **selectors + equality functions**:
  - Layers list: re-renders only when order/count/labels/frame membership/selection change (cheap signature compare).
  - Inspector: re-renders only when the selected elements' own values change.
  - Top bar / left bar: only on zoom / active-tool change.
- Store notification is coalesced to one per animation frame.
- `DesignPage` no longer holds `elements`/`selectedIds`/`zoom`/`activeType` in `useState`.

### 2. `commit.ts` — single mutation path

All edits originating from our UI (inspector, align bar, layer actions, styles) go through one helper:

```ts
commitElements(api, updater: (els) => els, opts?: { captureUndo?: boolean })
```

- Bumps `version`, regenerates `versionNonce`, sets `updated` on every changed element.
- Calls `api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY })` (or `NEVER` for programmatic no-undo cases like external file reloads).
- Multi-element operations (align, distribute, multi-select edits) are **one commit = one undo step**.
- `patchElements` in `designUtils.ts` is absorbed into this module.

### 3. Save pipeline with flush

- Keep: serialize → hash-compare → echo-guard → debounced write (300ms).
- Add `flushSave()`: fires pending write immediately on (a) back-navigation/unmount, (b) Tauri window close-requested, (c) window blur.
- Write failure: toast + dirty state retained + retry on next change/flush. A failed or corrupt read never wipes the canvas — last good scene stays with a non-blocking error banner.

### Foundation-level fixes (Phase 1 scope)

- **Anchored zoom**: `zoomTo(next, center?)` computes `scrollX/scrollY` compensation so zoom is centered on the viewport (or cursor for wheel). Adds zoom-to-fit and zoom-to-selection.
- **Live inspector inputs**: controlled inputs that track live canvas values while not focused, but never overwrite the user's in-progress typing; commit on Enter/blur; arrow-key increment (Shift = ×10).
- **Crisp defaults**: on the design page, new shapes default to `roughness: 0`, sharp/small-radius corners, and a clean font (Helvetica/Nunito) — UI mockups, not hand sketches. Sketchy style remains selectable per shape.
- **Correct hide**: hidden = `opacity: 0` **and** `locked: true`; previous opacity and locked state stored in `customData.prevOpacity` / `customData.prevLocked` so unhide restores both exactly (survives file round-trip); hidden elements excluded from exports.

---

## Phases

### Phase 1 — Stability core

Everything in the Architecture section above: `designStore.ts`, `commit.ts`, save flush, anchored zoom (+fit/+selection), live inspector inputs, crisp defaults, correct hide. Refactor `DesignPage.tsx`, `DesignRightPanel.tsx`, `DesignLeftBar.tsx`, `DesignTopBar.tsx` onto the store. No new UI surface beyond zoom-fit buttons.

**Exit criteria:** dragging with 200+ elements stays smooth; every panel edit is undoable; inspector never shows stale values; closing the page/window mid-edit loses nothing (flush); a hard process kill loses at most the final 300ms debounce window; zoom stays centered.

### Phase 2 — Precision editing

- **Multi-select inspector**: shared properties across the selection; differing values render as `Mixed`; committing a field applies to all selected (one undo step).
- **Align & distribute**: bar appears in inspector at 2+ selected — align left/center-h/right/top/center-v/bottom, distribute horizontal/vertical. Own geometry math (group bounding boxes respected), single commit.
- **Snapping**: top-bar toggle for Excalidraw's `objectsSnapModeEnabled`, **on by default** on the design page.
- **Group/ungroup + z-order**: action buttons (inspector) wired to Excalidraw's native shortcuts/behavior; layers panel reflects `groupIds`.
- **Shortcuts**: native Excalidraw shortcuts continue to work; add Shift+1 (zoom to fit), Shift+2 (zoom to selection), `?` opens a shortcut cheatsheet overlay. Shortcuts are suppressed while focus is in a panel input.

### Phase 3 — Frames as artboards + export

- **Frame management**: frames listed as top-level nodes in the layers tree with children nested; inline rename (native frame `name`); double-click frame label on canvas to rename.
- **Export**: PNG and SVG for whole canvas / selection / single frame via `exportToBlob`/`exportToSvg` from `@excalidraw/excalidraw`, saved through the Tauri save dialog; **copy as PNG** to clipboard. Hidden elements excluded; background color included for PNG, optional for SVG.
- **Agent handoff upgrade**: "Reference in terminal" gains a frame-aware mode — when a frame is selected, render that frame to a PNG beside the design file (`<name>.vibe-design.<frame>.png`) and reference both paths, so the agent gets structured JSON *and* the visual.

### Phase 4 — Styles, assets, layers tree v2, polish

- **Color/text styles**: styles section in the right panel; save current fill/stroke/text setup as a named style, one-click apply to selection. Stored in the design file under `appState.customStyles` (additive; parser tolerates absence).
- **Asset library**: Excalidraw's native library (`api.updateLibrary`) with a per-user library persisted in app data dir; drag items onto any space's canvas. Seed with a tiny starter set (button, input, card).
- **Layers tree v2**: rename any layer (`customData.name`, falls back to type label), drag-to-reorder (rewrites element array order = z-order, via commit path), collapse/expand frames and groups, search box filtering by name/type.
- **Polish pass**: audit every panel, empty state, toast, banner, and micro-interaction against the Quansynd visual language (warm amber accents, editorial type, desktop-software density). Consistent 26px control metrics, real focus states, no emoji glyphs as icons (replace 🔒/●/○ with SVG icons from `wall/icons`).

Each phase gets its own implementation plan and lands green (typecheck + vitest) before the next starts.

---

## Testing

Vitest units (co-located, same style as `normalize.test.ts`):

- `designStore`: selector memoization — layer-list signature stable across pure drags; notifies on order/selection changes.
- `commit`: version/versionNonce/updated bumped only on changed elements; multi-element patch is atomic.
- Align/distribute math: fixed fixtures incl. rotated elements and grouped selections.
- Serialize round-trip: pre-overhaul files parse and re-serialize byte-stable; files with `customStyles`/`customData` round-trip; unknown fields preserved.
- Hide/lock invariants: hide sets opacity 0 + locked + `prevOpacity`; unhide restores; hidden excluded from export element sets.
- Export filtering: frame export selects exactly the frame's children + the frame.

Echo-guard/watch behavior is already covered by existing tests and is unchanged.

## Error handling

- **Parse failure** (agent mid-write or bad JSON): non-blocking banner with the JSON error + retry; canvas keeps last good scene.
- **Write failure**: toast, dirty flag retained, retried on next change/flush.
- **Watcher storm**: unchanged — echo guard + hash compare already dedupe.
- **Missing project folder**: unchanged current behavior (explanatory error state).

## File changes

| File | Action |
|------|--------|
| `src/design/designStore.ts` (+test) | New — external store + selectors |
| `src/design/commit.ts` (+test) | New — version-correct commit path (absorbs `patchElements`) |
| `src/design/zoom.ts` (+test) | New — anchored zoom / fit / selection math |
| `src/design/align.ts` (+test) | New — align/distribute geometry (Phase 2) |
| `src/design/exportScene.ts` (+test) | New — export + element filtering (Phase 3) |
| `src/design/styles.ts` (+test) | New — custom styles model (Phase 4) |
| `src/design/DesignPage.tsx` | Refactor onto store; flush-on-exit; crisp defaults |
| `src/design/DesignTopBar.tsx` | Snap toggle, zoom-fit controls, export menu (phased) |
| `src/design/DesignLeftBar.tsx` | Minor — store subscription |
| `src/design/DesignRightPanel.tsx` | Rebuild — live inputs, multi-select, align bar, styles, layers v2 (phased) |
| `src/design/designUtils.ts` | Shrink — helpers move into modules above |
| `src/design/normalize.ts` | Additive — tolerate/preserve `customStyles` |
| `src/App.css` | Panel styles for new controls |
| `src/design/{designFile,echoGuard,watch,reference}.ts` | `reference.ts` gains frame-PNG mode (Phase 3); others untouched |

## Out of scope

- Real-time multiplayer editing on the canvas (Teams presence is a separate track)
- Auto-layout (Figma constraint solver) — revisit after Phase 4
- Prototype/interaction mode, comments
- Engine swap (tldraw licensing unchanged)
