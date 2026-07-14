# Design Page — Figma-Style Redesign

**Date:** 2026-06-30  
**Status:** Approved for implementation  
**Scope:** `vibe-space/src/design/`  
**Canvas engine:** Excalidraw (MIT) — tldraw was ruled out due to commercial licensing (~$6k/yr)

---

## Goal

Replace the current minimal DesignPage chrome (back button + Excalidraw filling the screen) with a Figma-like 3-panel layout: narrow left tool sidebar, styled top bar, and a live right panel (properties inspector + layers tree). The Excalidraw canvas and all persistence/watch infrastructure stay unchanged.

---

## Layout

Three-panel layout, fixed full-screen, matching existing wall sizing conventions:

```
┌────────────────────────────────────────────────────────┐  34px
│ ← │ UI Design          [65%]   [@ Reference]           │  top bar
├────┬───────────────────────────────────────┬───────────┤
│    │                                       │           │
│ 34 │         Excalidraw canvas             │  256px    │
│ px │         (stock chrome hidden)         │  right    │
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
- All surfaces: `var(--glass)`, `border: 1px solid var(--rule)`, `var(--shadow)` — same tokens

---

## Components

### `DesignPage.tsx` (refactored)

Orchestrates the 3-panel shell. Manages:
- `ExcalidrawImperativeAPI` ref (unchanged from current)
- File path resolution, load, save, echo guard, file watcher — all **unchanged**
- Passes `onChange` down: fires `(elements, appState)` → lifted to `DesignRightPanel` via state
- Tracks `activeType` (active tool string) for `DesignLeftBar` highlight
- Tracks selected element IDs from `appState.selectedElementIds`

### `DesignTopBar.tsx`

Single row, full width, 34px height, `var(--glass)` + `border-bottom: 1px solid var(--rule)`:

| Slot | Content |
|------|---------|
| Left | Back button (`cnvs-btn` + `BackIcon`) |
| Left | Title: `"UI Design"` in `var(--font-display)` (replaces current `.design-title`) |
| Center | `flex: 1` spacer |
| Right | Zoom readout — `Math.round(appState.zoom.value * 100)%` in `var(--font-mono)` — display only |
| Right | `@ Reference in terminal` button (existing logic, moved here from old topbar) |

No page tabs — Excalidraw is single-page.

### `DesignLeftBar.tsx`

Vertical strip, 34px wide, full height below top bar. `var(--glass)` background, `border-right: 1px solid var(--rule)`. Buttons use existing `.tool-key` / `.tool-key.active` classes.

| Icon | Tool type string | `setActiveTool` call |
|------|-----------------|----------------------|
| Cursor | `"selection"` | `api.setActiveTool({ type: "selection" })` |
| Hand | `"hand"` | `api.setActiveTool({ type: "hand" })` |
| — separator — | | |
| Rectangle | `"rectangle"` | `api.setActiveTool({ type: "rectangle" })` |
| Ellipse | `"ellipse"` | `api.setActiveTool({ type: "ellipse" })` |
| Diamond | `"diamond"` | `api.setActiveTool({ type: "diamond" })` |
| Arrow | `"arrow"` | `api.setActiveTool({ type: "arrow" })` |
| Draw | `"freedraw"` | `api.setActiveTool({ type: "freedraw" })` |
| Text | `"text"` | `api.setActiveTool({ type: "text" })` |
| Eraser | `"eraser"` | `api.setActiveTool({ type: "eraser" })` |
| Line | `"line"` | `api.setActiveTool({ type: "line" })` |
| Image | `"image"` | `api.setActiveTool({ type: "image" })` |

Active tool tracked via `activeType` string lifted from `onChange` → `appState.activeTool.type`. Excalidraw native keyboard shortcuts still work.

### `DesignRightPanel.tsx`

256px wide, full height below top bar. Two vertical sections divided by `1px var(--rule)`.

**Props:**
```ts
interface DesignRightPanelProps {
  elements: readonly ExcalidrawElement[];
  selectedIds: Record<string, boolean>;
  zoom: number; // appState.zoom.value
  onUpdate: (elements: ExcalidrawElement[]) => void;
}
```

`onUpdate` calls `apiRef.current?.updateScene({ elements: [...all elements with patch applied] })`.

---

**Top: Properties**

Reads the first selected element from `elements.filter(e => selectedIds[e.id])`.

When 1 shape selected:

- **Transform:** X (`.x`), Y (`.y`), W (`.width`), H (`.height`), Rotation (`.angle` in radians → degrees display) — `<input type="number">`, blur/Enter commits
- **Appearance:** Fill (`backgroundColor`), Stroke (`strokeColor`), Stroke width (`strokeWidth`), Opacity (`opacity` 0–100)
- **Text** (elements where `type === "text"`): font size (`fontSize`), font family (`fontFamily` 1=Virgil/2=Helvetica/3=Cascadia), bold/italic (`fontStyle`), text alignment (`textAlign`)

When nothing selected:
- Muted centered hint `"Select a shape to inspect it"`

Write-back pattern for all fields:
```ts
const updated = elements.map(el =>
  el.id === target.id ? { ...el, [field]: value } : el
);
onUpdate(updated);
```

**Bottom: Layers**

Header: `"Layers"` — 10px mono uppercase, `var(--text-faint)`.

Scrollable list from `elements` slice in reverse order (last element = top of stack):

- Each row: shape-type icon + label (`type` + truncated `text` for text elements)
- Click row → `api.updateScene({ appState: { selectedElementIds: { [id]: true } } })`
- Eye icon → toggle `opacity`: 0 ↔ restore previous (store previous opacity in `data-prev-opacity` attribute workaround: keep a `Map<id, number>` in component state)
- Lock icon → toggle `locked` boolean on the element via `onUpdate`
- Selected element rows: 3px accent left border

Shape-type icons: reuse icon components from `DesignLeftBar` mapped by `element.type`.

### Excalidraw chrome suppression (CSS)

The DesignPage Excalidraw instance needs its stock toolbar/UI hidden. Add `.design-page` scoped rules to `App.css` (same pattern as `.wall-root` rules in `excalidraw-skin.css`):

- Hide: `.App-toolbar`, `.dropdown-menu-button`, `.layer-ui__wrapper__top-right`, `.sidebar-trigger`, `.help-icon`, `.collab-button`, `.welcome-screen-center`, `.layer-ui__wrapper__footer-left`
- The canvas area fills the space between left bar and right panel via CSS grid

### Zoom Controls

Float over the canvas area, bottom-center, same `.tools-island` style:

```
┌────────────────────┐
│ –  │  65%  │  +    │
└────────────────────┘
```

Zoom value displayed from `appState.zoom.value * 100`. Buttons dispatch keyboard events to Excalidraw (`Ctrl+=` for in, `Ctrl+-` for out) or call `apiRef.current?.updateScene({ appState: { zoom: { value: clamp(z ± 0.1, 0.1, 4) } } })`.

---

## Persistence

**Unchanged.** Same `.vibe-design.json` Excalidraw format. `normalize.ts`, `normalize.test.ts`, `echoGuard.ts`, `watch.ts`, `designFile.ts`, `reference.ts` — all untouched.

---

## File Changes

| File | Action |
|------|--------|
| `src/design/DesignPage.tsx` | Refactor — 3-panel shell, lift elements/appState to children |
| `src/design/DesignTopBar.tsx` | New |
| `src/design/DesignLeftBar.tsx` | New |
| `src/design/DesignRightPanel.tsx` | New |
| `src/App.css` | Add `.design-page` scoped Excalidraw chrome suppression + panel layout styles |
| `src/wall/excalidraw-skin.css` | Untouched (scoped to `.wall-root`) |
| `src/design/normalize.ts` | Untouched |
| `src/design/normalize.test.ts` | Untouched |
| `src/design/echoGuard.ts` | Untouched |
| `src/design/watch.ts` | Untouched |
| `src/design/designFile.ts` | Untouched |
| `src/design/reference.ts` | Untouched |

---

## Out of Scope

- Page tabs (Excalidraw is single-page)
- Prototype / Code tabs
- Asset library panel
- Export to image/PDF
- Real-time collaboration
- Comment threads
