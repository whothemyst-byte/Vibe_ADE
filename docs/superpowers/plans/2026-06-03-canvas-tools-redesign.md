# Canvas & Tools Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Excalidraw's stock canvas chrome with our own warm/amber desktop-software UI — a custom bottom glass tools island, `+ Terminal` moved to the top, and the native properties panel + zoom footer reskinned.

**Architecture:** Keep the embedded `<Excalidraw>` and its full editing engine. Add our own React tool bar (the "tools island") that drives tool selection through `excalidrawAPI.setActiveTool(...)` and reflects the active tool read from `appState.activeTool.type` in the existing `onChange`. Hide the stock toolbar/menu/library/footer and reskin the surviving native panels (left properties panel, zoom/undo footer) via a scoped CSS layer, all driven off existing `theme.css` tokens. No backend, persistence, terminal, or camera changes.

**Tech Stack:** Tauri 2.11, React 18.3, TypeScript, @excalidraw/excalidraw 0.18.1, Vite 7, Vitest 4 (node env, logic-only `.test.ts`). Verify components with `npm run build` (`tsc && vite build`) and by running the app.

**Spec:** `docs/superpowers/specs/2026-06-03-canvas-tools-redesign-design.md`

## File Structure

| File | Responsibility |
|------|----------------|
| `src/wall/tools.ts` | **new** — ordered tool definitions (type, label, shortcut, glyph). Pure data + helper. |
| `src/wall/tools.test.ts` | **new** — unit tests for the tool list / helper. |
| `src/wall/ToolsIsland.tsx` | **new** — the glass drawing toolbar; renders tools, calls `onSelect`, highlights `activeTool`. |
| `src/wall/WallView.tsx` | modify — render `ToolsIsland`; track `activeTool` in `onChange`; pass `UIOptions`; import skin CSS. |
| `src/wall/excalidraw-skin.css` | **new** — scoped layer that hides stock chrome and reskins the native left panel + zoom footer. |
| `src/App.css` | modify — move `.launch` to top-centre, flip its menu downward, add `.tools-island` styles. |

## Conventions (match existing code)

- Tests are `src/**/*.test.ts`, node env, no DOM. Only **pure logic** is unit-tested (see `transform.test.ts`, `presets.test.ts`). Components/CSS are verified by `npm run build` + running the app.
- CSS lives in `src/App.css` using `theme.css` tokens (`--glass`, `--surface-2`, `--accent`, `--rule`, `--radius-sm`, `--font-mono`, etc.). No inline styles for chrome.
- Commit after each task with a `feat(ui):` / `test:` message.

---

### Task 1: Tool definitions module

The island's data source: the ordered list of drawing tools, each with the exact Excalidraw
`ToolType`, a display label, its keyboard shortcut, and a glyph. Pure data so it's unit-testable
and the component stays dumb.

**Files:**
- Create: `src/wall/tools.ts`
- Test: `src/wall/tools.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/wall/tools.test.ts
import { describe, it, expect } from "vitest";
import { TOOLS, type ToolDef } from "./tools";

describe("TOOLS", () => {
  it("lists the drawing tools in island order", () => {
    expect(TOOLS.map((t) => t.type)).toEqual([
      "selection", "hand", "rectangle", "diamond", "ellipse",
      "arrow", "line", "freedraw", "text", "image", "eraser", "frame",
    ]);
  });

  it("gives every tool a label, a single-key shortcut, and a glyph", () => {
    for (const t of TOOLS as ToolDef[]) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.shortcut).toMatch(/^[a-z0-9]$/i);
      expect(t.glyph.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate types or shortcuts", () => {
    expect(new Set(TOOLS.map((t) => t.type)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map((t) => t.shortcut.toLowerCase())).size).toBe(TOOLS.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tools`
Expected: FAIL — `Cannot find module './tools'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/wall/tools.ts
import type { ToolType } from "@excalidraw/excalidraw/types";

export type ToolDef = {
  /** Exact Excalidraw tool name passed to setActiveTool. */
  type: Extract<
    ToolType,
    "selection" | "hand" | "rectangle" | "diamond" | "ellipse" |
    "arrow" | "line" | "freedraw" | "text" | "image" | "eraser" | "frame"
  >;
  label: string;
  /** Single-key Excalidraw shortcut, shown in the tooltip. */
  shortcut: string;
  /** Glyph rendered on the key (swap for an icon set later if desired). */
  glyph: string;
};

export const TOOLS: ToolDef[] = [
  { type: "selection", label: "Select",    shortcut: "V", glyph: "⌖" },
  { type: "hand",      label: "Hand",      shortcut: "H", glyph: "✋" },
  { type: "rectangle", label: "Rectangle", shortcut: "R", glyph: "▭" },
  { type: "diamond",   label: "Diamond",   shortcut: "D", glyph: "◇" },
  { type: "ellipse",   label: "Ellipse",   shortcut: "O", glyph: "○" },
  { type: "arrow",     label: "Arrow",     shortcut: "A", glyph: "↗" },
  { type: "line",      label: "Line",      shortcut: "L", glyph: "╱" },
  { type: "freedraw",  label: "Draw",      shortcut: "P", glyph: "✎" },
  { type: "text",      label: "Text",      shortcut: "T", glyph: "T" },
  { type: "image",     label: "Image",     shortcut: "9", glyph: "▣" },
  { type: "eraser",    label: "Eraser",    shortcut: "E", glyph: "⌫" },
  { type: "frame",     label: "Frame",     shortcut: "F", glyph: "⊡" },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tools`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/wall/tools.ts src/wall/tools.test.ts
git commit -m "feat(ui): tool definitions for the custom tools island"
```

---

### Task 2: ToolsIsland component

The glass bottom-centre toolbar. Dumb/presentational: it receives the active tool type and an
`onSelect` callback, renders one key per `TOOLS` entry, highlights the active one, and shows a
mono tooltip. No Excalidraw imports here — wiring happens in `WallView` (Task 3).

**Files:**
- Create: `src/wall/ToolsIsland.tsx`

This component renders no testable pure logic, so it's verified via `npm run build` in Task 3.
Build it now.

- [ ] **Step 1: Write the component**

```tsx
// src/wall/ToolsIsland.tsx
import { TOOLS, type ToolDef } from "./tools";

export function ToolsIsland({
  activeType, onSelect,
}: { activeType: string; onSelect: (tool: ToolDef) => void }) {
  return (
    <div className="tools-island" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((t) => (
        <button
          key={t.type}
          className={`tool-key${t.type === activeType ? " active" : ""}`}
          aria-pressed={t.type === activeType}
          title={`${t.label} · ${t.shortcut}`}
          onPointerDown={() => onSelect(t)}
        >
          <span className="tool-glyph" aria-hidden>{t.glyph}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit** (styles come in Task 5; wiring in Task 3 — commit the component on its own)

```bash
git add src/wall/ToolsIsland.tsx
git commit -m "feat(ui): ToolsIsland component (glass drawing toolbar)"
```

---

### Task 3: Wire the island into WallView + hide stock chrome

Render `ToolsIsland`, drive `setActiveTool` on select, track the active tool from the existing
`onChange`, and pass `UIOptions` to disable the canvas menu actions Excalidraw lets us disable
(the toolbar/hamburger/library are hidden via CSS in Task 4). Also import the skin CSS file
(created in Task 4) so it loads with the view.

**Files:**
- Modify: `src/wall/WallView.tsx`

- [ ] **Step 1: Add imports** near the top of `src/wall/WallView.tsx`, after the existing
`import { LaunchMenu } from "./LaunchMenu";` line:

```tsx
import { ToolsIsland } from "./ToolsIsland";
import type { ToolDef } from "./tools";
```

(The `excalidraw-skin.css` import is added in Task 4, once that file exists.)

- [ ] **Step 2: Add active-tool state.** After the existing
`const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);` line, add:

```tsx
const [activeType, setActiveType] = useState<string>("selection");
```

- [ ] **Step 3: Read the active tool in `onChange`.** In the existing `onChange` callback,
add a line that syncs the active tool from appState (so keyboard shortcuts and auto-revert to
selection keep the island in sync). The callback currently starts:

```tsx
const onChange = useCallback((_els: readonly unknown[], appState: AppStateLike) => {
  const next = excalidrawCamera(appState);
```

Change it to also read the active tool:

```tsx
const onChange = useCallback((_els: readonly unknown[], appState: AppStateLike) => {
  const tool = (appState as { activeTool?: { type?: string } }).activeTool?.type;
  if (tool) setActiveType(tool);
  const next = excalidrawCamera(appState);
```

- [ ] **Step 4: Add the select handler.** Add this function inside the component, next to
`addTerminal` / `changeBg`:

```tsx
const selectTool = (tool: ToolDef) => {
  // tool.type is a literal union that includes "image"; assert to setActiveTool's exact
  // parameter union so the discriminated type checks (ExcalidrawImperativeAPI is already
  // imported at the top of this file).
  apiRef.current?.setActiveTool(
    { type: tool.type } as Parameters<ExcalidrawImperativeAPI["setActiveTool"]>[0]
  );
  setActiveType(tool.type);
};
```

- [ ] **Step 5: Pass `UIOptions` to `<Excalidraw>`.** Add the prop to the existing
`<Excalidraw ... />` element (alongside `theme="dark"`):

```tsx
UIOptions={{
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    loadScene: false,
    saveToActiveFile: false,
    toggleTheme: false,
    export: false,
    saveAsImage: false,
  },
}}
```

- [ ] **Step 6: Render the island.** Immediately after the `<LaunchMenu ... />` element in the
returned JSX, add:

```tsx
<ToolsIsland activeType={activeType} onSelect={selectTool} />
```

- [ ] **Step 7: Build to typecheck**

Run: `npm run build`
Expected: build succeeds (TypeScript clean). The app still compiles with the island rendered.

- [ ] **Step 8: Commit**

```bash
git add src/wall/WallView.tsx
git commit -m "feat(ui): drive custom tools island from Excalidraw API; disable native canvas actions"
```

---

### Task 4: Hide stock chrome + reskin native panels (scoped CSS)

A scoped CSS layer that (a) hides Excalidraw's stock top toolbar, hamburger menu, search, and
Library trigger; and (b) reskins the surviving native left properties panel and bottom-left
zoom/undo footer to the warm tokens. Everything is scoped under `.wall-root` so it never leaks
into the start page or taskboard.

> **Selector note for the implementer:** Excalidraw's published class names in 0.18.1 include
> `.App-toolbar` (stock tool row), `.App-menu_top` (top menu row holding the hamburger +
> toolbar + library), `.dropdown-menu-button` (hamburger), `.sidebar-trigger` / the Library
> button, `.App-menu__left` (left properties column, **keep + reskin**), `.App-bottom-bar` and
> `.footer` (bottom-left zoom/undo/help). After writing this file, run the app and confirm in
> devtools that the stock toolbar/hamburger/library are gone and the properties panel + zoom
> still show (now warm). If a selector changed, adjust to the live class name — do not hide
> `.App-menu__left` (that is the properties panel we are keeping).

**Files:**
- Create: `src/wall/excalidraw-skin.css`
- Modify: `src/wall/WallView.tsx` (add the import)

- [ ] **Step 1: Create the skin file**

```css
/* src/wall/excalidraw-skin.css
   Scoped reskin of the embedded Excalidraw chrome. All rules live under .wall-root
   so they never touch other views. Tokens come from theme.css. */

/* --- Hide the stock chrome we replace --- */
.wall-root .App-toolbar,            /* stock top tool row (replaced by our island) */
.wall-root .dropdown-menu-button,   /* hamburger menu */
.wall-root .layer-ui__wrapper__top-right,  /* share/collab cluster */
.wall-root .sidebar-trigger,        /* Library trigger */
.wall-root .help-icon,              /* "?" help */
.wall-root .welcome-screen-center { /* first-run hints */
  display: none !important;
}

/* --- Reskin: left properties panel (Island) --- */
.wall-root .App-menu__left .Island,
.wall-root .Island {
  background: var(--glass) !important;
  backdrop-filter: blur(10px);
  border: 1px solid var(--rule) !important;
  border-radius: var(--radius-sm) !important;
  box-shadow: var(--shadow) !important;
  color: var(--text) !important;
}
.wall-root .App-menu__left .buttonList button,
.wall-root .Island button {
  border-radius: 6px !important;
}
/* active selection swatch / pressed control -> amber */
.wall-root .Island .active,
.wall-root .Island [aria-pressed="true"] {
  background: var(--accent-soft) !important;
  box-shadow: 0 0 0 1px var(--accent-dim) inset !important;
}

/* --- Reskin: bottom-left zoom / undo footer --- */
.wall-root .App-bottom-bar .Island,
.wall-root .footer .Island,
.wall-root .zoom-actions,
.wall-root .undo-redo-buttons {
  background: var(--glass) !important;
  backdrop-filter: blur(10px);
  border: 1px solid var(--rule) !important;
  border-radius: var(--radius-sm) !important;
  color: var(--text) !important;
}
```

- [ ] **Step 2: Import the skin in WallView.** In `src/wall/WallView.tsx`, add next to the
existing `import "@excalidraw/excalidraw/index.css";` line:

```tsx
import "./excalidraw-skin.css";
```

- [ ] **Step 3: Build to typecheck**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Run the app and verify hiding/reskin**

Run: `npm run tauri dev` (or the project's usual dev command). Open a wall.
Expected: no stock top toolbar, no hamburger, no Library button. Pick a shape — the left
properties panel and the bottom-left zoom controls appear in the warm/glass style.
If any stock element is still visible, inspect it and add its live class to the hide block.

- [ ] **Step 5: Commit**

```bash
git add src/wall/excalidraw-skin.css src/wall/WallView.tsx
git commit -m "feat(ui): hide stock Excalidraw chrome; reskin native panels to warm tokens"
```

---

### Task 5: Move + Terminal to the top; style the tools island

CSS-only in `src/App.css`: move the `.launch` control from bottom-centre to top-centre and flip
its dropdown downward, then add the `.tools-island` / `.tool-key` styles at the bottom-centre
spot the launch control vacated.

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Move `.launch` to top-centre.** Replace the existing `.launch` rule
(`src/App.css:2-6`):

```css
.launch {
  position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 300;
  display: flex; align-items: stretch; box-shadow: 0 6px 20px -8px rgba(215, 154, 61, .5);
  border-radius: var(--radius-sm);
}
```

with:

```css
.launch {
  position: absolute; top: 16px; left: 50%; transform: translateX(-50%); z-index: 300;
  display: flex; align-items: stretch; box-shadow: 0 6px 20px -8px rgba(215, 154, 61, .5);
  border-radius: var(--radius-sm);
}
```

- [ ] **Step 2: Flip the launch dropdown downward.** Replace the existing `.launch-menu` rule
(`src/App.css:14-19`):

```css
.launch-menu {
  position: absolute; bottom: 100%; left: 0; margin-bottom: 8px; min-width: 184px;
  background: var(--glass); backdrop-filter: blur(10px); border: 1px solid var(--rule);
  border-radius: var(--radius-sm); padding: 4px; box-shadow: var(--shadow);
  display: flex; flex-direction: column;
}
```

with (anchor to `top` instead of `bottom`):

```css
.launch-menu {
  position: absolute; top: 100%; left: 0; margin-top: 8px; min-width: 184px;
  background: var(--glass); backdrop-filter: blur(10px); border: 1px solid var(--rule);
  border-radius: var(--radius-sm); padding: 4px; box-shadow: var(--shadow);
  display: flex; flex-direction: column;
}
```

- [ ] **Step 3: Add the tools-island styles.** Append after the `.launch-ic` rule
(`src/App.css:26`):

```css
.tools-island {
  position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 300;
  display: flex; align-items: center; gap: 4px;
  background: var(--glass); backdrop-filter: blur(10px);
  border: 1px solid var(--rule); border-radius: var(--radius);
  padding: 6px; box-shadow: var(--shadow);
}
.tool-key {
  width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center;
  background: var(--surface-2); color: var(--text-muted); border: none; cursor: pointer;
  border-radius: var(--radius-sm); transition: background .14s, color .14s, transform .12s;
}
.tool-key:hover { color: var(--text); transform: translateY(-1px); }
.tool-key.active { background: var(--accent); color: #20170a; }
.tool-glyph { font: 500 15px var(--font-mono); line-height: 1; }
```

- [ ] **Step 4: Build to typecheck**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Run the app and verify layout**

Run the dev command and open a wall.
Expected: `+ Terminal` sits top-centre and its menu opens downward; the glass tools island sits
bottom-centre; clicking a tool key highlights it amber and activates that Excalidraw tool;
drawing works for each tool.

- [ ] **Step 6: Commit**

```bash
git add src/App.css
git commit -m "feat(ui): move + Terminal to top; style bottom glass tools island"
```

---

### Task 6: Full-flow verification

No new code — confirm the spec's acceptance criteria end-to-end and fix any selector gaps found.

- [ ] **Step 1: Run the test + build gates**

Run: `npm test` then `npm run build`
Expected: all tests pass; build clean.

- [ ] **Step 2: Manual acceptance pass** (run the app, open a wall):

- [ ] `+ Terminal` is top-centre, menu opens downward, plain + agent launches still work.
- [ ] No stock Excalidraw top toolbar, hamburger, search, or Library button anywhere.
- [ ] Glass tools island is bottom-centre; every key activates the matching tool; active key is amber; keyboard shortcuts (V/H/R/D/O/A/L/P/T/E/F) keep the island highlight in sync.
- [ ] Drawing each shape works; selecting a shape shows the reskinned warm left properties panel with working colour/fill/width/opacity/font controls.
- [ ] Bottom-left zoom/undo footer shows in the warm style and works.
- [ ] Unaffected: terminals spawn/drag/resize/close/persist, camera follows on pan/zoom, background renders, wall saves and reopens.
- [ ] Start page and taskboard are visually unchanged (skin CSS did not leak).

- [ ] **Step 3: Commit any fixes** made during verification:

```bash
git add -A
git commit -m "fix(ui): selector/style adjustments from redesign verification"
```

---

## Self-Review Notes

- **Spec coverage:** layout (Tasks 3/5), glass island (Tasks 2/5), tool wiring via `setActiveTool` + active-state from `onChange` (Task 3), hide stock chrome via UIOptions + CSS (Tasks 3/4), reskin native properties panel + zoom footer (Task 4), `+ Terminal` to top (Task 5), tokens-only styling (Tasks 4/5), no behaviour change verified (Task 6). Export deferral is documented in the spec and intentionally has no task.
- **Type consistency:** `ToolDef` defined in Task 1 is the single type used by `ToolsIsland` (Task 2) and `selectTool` (Task 3); `activeType: string` matches the `appState.activeTool.type` read in Task 3. Class names `.tools-island` / `.tool-key` / `.tool-glyph` are defined in Task 5 and used in Task 2.

