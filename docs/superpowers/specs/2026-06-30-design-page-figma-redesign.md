# Design Page — Figma-Style Redesign

**Date:** 2026-06-30  
**Status:** Approved for implementation  
**Scope:** `vibe-space/src/design/`

---

## Goal

Replace the current Excalidraw-based DesignPage with a tldraw-powered canvas surrounded by a custom Figma-like chrome: narrow left tool sidebar, top bar with page tabs, and a live right panel (properties inspector + layers tree).

---

## Layout

Three-panel layout, fixed full-screen, matching existing wall sizing conventions:

```
┌────────────────────────────────────────────────────────┐  34px
│ ← │ Main page × │ +          [65%]   [@ Reference]    │  top bar
├────┬───────────────────────────────────────┬───────────┤
│    │                                       │           │
│ 34 │         tldraw canvas                 │  256px    │
│ px │         (hideUi: true)                │  right    │
│    │                                       │  panel    │
│    │           ┌── – 65% + ──┐            │           │
│    │           └─────────────┘            │           │
└────┴───────────────────────────────────────┴───────────┘
```

**Sizing — follows existing wall conventions exactly:**
- Top bar: 34px tall (26px buttons + 4px padding top/bottom)
- Left bar: 34px wide (26px buttons + 4px padding each side)
- Tool buttons: 26×26px, 3px gap, `var(--radius-sm)` — identical to `.tool-key`
- Right panel: 256px fixed width
- All surfaces: `var(--glass)`, `border: 1px solid var(--rule)`, `var(--shadow)` — same tokens used everywhere

---

## Components

### `DesignPage.tsx` (refactored)

Orchestrates the 3-panel shell. Manages:
- tldraw `Editor` instance via `useEditor()` after mount
- File path resolution (`resolveDesignPath` + `ensureDesignFile` — unchanged)
- Snapshot load/save via `editor.store.getSnapshot()` / `editor.store.loadSnapshot()`
- Debounced save (300ms) on `editor.store.listen()`
- File watcher for agent edits (`watchDesignFile` — unchanged), reloads snapshot and shows toast
- Toast state (`flash()` — unchanged)

### `DesignTopBar.tsx`

Single row, full width, 34px height, `var(--glass)` + `border-bottom: 1px solid var(--rule)`:

| Slot | Content |
|------|---------|
| Left | Back button (`cnvs-btn` + `BackIcon`) |
| Left | Page tabs: for each tldraw page → `[name ×]` pill; active = accent tint, inactive = muted; click switches page, × deletes (min 1 guard) |
| Left | Add page `+` button (`cnvs-btn`) |
| Center | `flex: 1` spacer |
| Right | Zoom readout — `Math.round(camera.z * 100)%` in `var(--font-mono)`, click resets to 100% |
| Right | `@ Reference in terminal` button (existing logic unchanged) |

Page tabs use `editor.getPages()`, `editor.setCurrentPage()`, `editor.createPage()`, `editor.deletePage()`. Active page from `editor.getCurrentPageId()`.

### `DesignLeftBar.tsx`

Vertical strip, 34px wide, full height below top bar. `var(--glass)` background, `border-right: 1px solid var(--rule)`. Buttons use existing `.tool-key` / `.tool-key.active` classes.

| Icon | Tool ID | tldraw call |
|------|---------|-------------|
| Cursor | select | `editor.setCurrentTool('select')` |
| Hand | hand | `editor.setCurrentTool('hand')` |
| — separator — | | |
| Rectangle | rectangle | `editor.setCurrentTool('geo')` + shape:rectangle |
| Ellipse | ellipse | `editor.setCurrentTool('geo')` + shape:ellipse |
| Diamond | diamond | `editor.setCurrentTool('geo')` + shape:diamond |
| Arrow | arrow | `editor.setCurrentTool('arrow')` |
| Draw | draw | `editor.setCurrentTool('draw')` |
| Text | text | `editor.setCurrentTool('text')` |
| Eraser | eraser | `editor.setCurrentTool('eraser')` |
| — separator — | | |
| Frame | frame | `editor.setCurrentTool('frame')` |

Active tool tracked via `editor.getCurrentToolId()`. tldraw native keyboard shortcuts (V/H/R/O/A/D/T/E/F) work automatically even with `hideUi`.

Geo tool sub-type (rect/ellipse/diamond) is stored in local state so clicking the same icon again re-applies the same geo shape.

### `DesignRightPanel.tsx`

256px wide, full height below top bar. Two vertical sections divided by `1px var(--rule)`.

**Top: Properties**

Reads from `editor.getSelectedShapes()`. Updates on `editor.store.listen()` filtered to selection changes.

When shapes selected:

- **Transform:** X, Y (position), W, H (size), Rotation — `<input type="number">` inputs, `11.5px var(--font-ui)`, same `.set-input` style as SettingsModal. Blur/Enter commits via:
  - X/Y: `editor.updateShapes([{ id, type, x: val, y: val }])`  
  - W/H: `editor.updateShapes([{ id, type, props: { w, h } }])`  
  - Rotation: `editor.rotateShapesBy([id], newAngle - currentAngle)`
- **Appearance:** Fill color swatch (`<input type="color">`), stroke color swatch + stroke width input, opacity `<input type="range" 0–100>`
- **Text** (geo/text shapes only): font family selector, font size, bold/italic/underline toggles, text alignment (left/center/right)

When nothing selected: muted centered hint text `"Select a shape to inspect it"`.

**Bottom: Layers**

Header: "Layers" — `10px var(--font-mono)` uppercase, `letter-spacing: .08em`, `var(--text-faint)`.

Scrollable list from `editor.getCurrentPageShapesSorted()` reversed (top of stack first):

- Each row: shape-type icon + label (shape type + truncated text content for text shapes)
- Shapes inside frames indented 12px under their frame parent
- Click row → `editor.select(id)`
- Eye icon → toggle visibility by setting `opacity: 0` (hidden) / restoring previous opacity (shown) — tldraw has no built-in `isHidden`; opacity is the correct mechanism
- Lock icon → `editor.updateShapes([{ id, isLocked: !current }])`
- Selected shape rows: 3px accent left border, same pattern as `.tb-card`

Shape-type icons reuse the same icon components as `DesignLeftBar`.

### `DesignCanvas.tsx`

Thin wrapper:

```tsx
<Tldraw
  hideUi
  store={store}
  onMount={(editor) => onEditorReady(editor)}
/>
```

- `hideUi` suppresses all native tldraw chrome (toolbar, style panel, page menu, navigation)
- Canvas background forced to `var(--bg)` (#12110f) via tldraw's `background` CSS var override — no grid pattern
- `onMount` fires the editor ref up to `DesignPage`

**Zoom controls** float over the canvas, centered bottom, same `.tools-island` style:

```
┌────────────────────┐
│ –  │  65%  │  +    │
└────────────────────┘
```

Calls `editor.zoomIn()`, `editor.zoomOut()`, `editor.resetZoom()`. Zoom percentage from `editor.getCamera().z`.

---

## Persistence

**Format:** tldraw snapshot JSON via `editor.store.getSnapshot()` / `editor.store.loadSnapshot()`. Same `.vibe-design.json` file path (resolved by existing `resolveDesignPath` + `ensureDesignFile`).

**On load:** If the file exists but is in the old Excalidraw format (detectable by presence of `"type":"excalidraw"` or absence of `"schema"` key), silently overwrite with an empty tldraw snapshot and proceed.

**On change:** `editor.store.listen()` → debounce 300ms → `getSnapshot()` → `writeDesignFile()`. Echo guard (`echoGuard.ts`) and file watcher (`watchDesignFile`) are **unchanged** — they operate on raw strings and are format-agnostic.

**Agent reload:** When `watchDesignFile` fires with a changed file, read it and call `editor.store.loadSnapshot(JSON.parse(text))`. Show existing toast: `"reloaded — agent updated this UI"`.

---

## File Changes

| File | Action |
|------|--------|
| `src/design/DesignPage.tsx` | Refactor (replace Excalidraw with tldraw shell) |
| `src/design/DesignTopBar.tsx` | New |
| `src/design/DesignLeftBar.tsx` | New |
| `src/design/DesignRightPanel.tsx` | New |
| `src/design/DesignCanvas.tsx` | New |
| `src/design/normalize.ts` | **Delete** |
| `src/design/normalize.test.ts` | **Delete** |
| `src/App.css` | Add styles for `.ds-topbar`, `.ds-leftbar`, `.ds-rightpanel`, `.ds-canvas`, `.ds-page-tab`, `.ds-prop-*`, `.ds-layer-*` |
| `src/wall/excalidraw-skin.css` | Untouched (scoped to `.wall-root`) |
| `src/design/echoGuard.ts` | Untouched |
| `src/design/watch.ts` | Untouched |
| `src/design/designFile.ts` | Untouched |
| `src/design/reference.ts` | Untouched |

---

## Out of Scope

- Prototype / Code tabs in the right panel (Figma has these; we ship Properties + Layers only)
- Asset library panel
- Export to image/PDF
- Real-time collaboration on the design canvas (Teams feature — separate spec)
- Comment threads on canvas
