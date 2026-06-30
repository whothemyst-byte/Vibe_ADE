# Design Page Figma-Style Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal DesignPage chrome with a Figma-like 3-panel layout (left tool sidebar + styled top bar + live properties/layers panel) while keeping Excalidraw as the canvas engine and all persistence infrastructure unchanged.

**Architecture:** `DesignPage` becomes a CSS-grid shell that lifts `elements` and `appState` via the existing `onChange` callback and passes slices down to three new sibling components. Pure helper functions are extracted to `designUtils.ts` so they can be unit-tested without a DOM.

**Tech Stack:** React 19, TypeScript, Excalidraw 0.18, Vitest (node environment), existing wall icon/tool exports

## Global Constraints

- Test environment is `node` (no DOM, no jsdom) — only test pure functions, not React components
- Reuse existing `.tool-key` / `.tool-key.active` CSS classes for tool buttons (same 26×26px sizing)
- Reuse existing `cnvs-btn`, `cnvs-toolbar` patterns for top-bar buttons
- All new styles go in `src/App.css` under the `/* ---- UI design page ---- */` block
- Imports from Excalidraw: elements from `@excalidraw/excalidraw/element/types`, API types from `@excalidraw/excalidraw/types`
- Reuse `TOOLS` from `src/wall/tools.ts` and `TOOL_ICONS` from `src/wall/icons.tsx` — do not duplicate
- Touch only files listed in each task; do not modify `normalize.ts`, `echoGuard.ts`, `watch.ts`, `designFile.ts`, `reference.ts`

---

## File Map

| File | Action |
|------|--------|
| `src/App.css` | Modify — replace `/* ---- UI design page ---- */` block |
| `src/design/designUtils.ts` | Create — pure helpers (patchElements, labelForElement, radToDeg, degToRad) |
| `src/design/designUtils.test.ts` | Create — unit tests for designUtils |
| `src/design/DesignLeftBar.tsx` | Create — vertical tool sidebar |
| `src/design/DesignTopBar.tsx` | Create — top bar (back, title, zoom, reference) |
| `src/design/DesignRightPanel.tsx` | Create — properties inspector + layers list |
| `src/design/DesignPage.tsx` | Modify — 3-panel grid shell, lift elements/appState |

---

### Task 1: CSS — grid layout + Excalidraw chrome suppression

**Files:**
- Modify: `src/App.css` (the `/* ---- UI design page ---- */` block, currently lines 743–763)

**Interfaces:**
- Produces: `.design-page`, `.design-topbar`, `.design-leftbar`, `.design-canvas`, `.design-right` — grid areas consumed by Tasks 3–6

- [ ] **Step 1: Replace the design page CSS block**

In `src/App.css`, find and replace the entire block starting with `/* ---- UI design page ---- */` through `.design-toast { ... }` with:

```css
/* ---- UI design page ---- */
.design-page {
  position: fixed; inset: 0;
  display: grid;
  grid-template:
    "topbar topbar topbar" 34px
    "left   canvas right " 1fr
    / 34px  1fr    256px;
  background: var(--bg);
}
.design-topbar  { grid-area: topbar; display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: var(--glass); backdrop-filter: blur(10px); border-bottom: 1px solid var(--rule); z-index: 5; }
.design-title   { color: var(--text); font: 600 12px var(--font-ui); letter-spacing: .04em; }
.design-spacer  { flex: 1; }
.design-ref     { width: auto; padding: 0 10px; gap: 6px; font: 600 11.5px var(--font-ui); }
.design-zoom-readout { font: 500 11.5px var(--font-mono); color: var(--text-muted); min-width: 38px; text-align: right; }

.design-leftbar {
  grid-area: left; display: flex; flex-direction: column; align-items: center;
  gap: 3px; padding: 4px;
  background: var(--glass); backdrop-filter: blur(10px);
  border-right: 1px solid var(--rule); overflow-y: auto;
}
.design-tool-sep { width: 18px; height: 1px; background: var(--rule); margin: 2px 0; flex: none; }

.design-canvas  { grid-area: canvas; position: relative; overflow: hidden; }

/* Hide Excalidraw stock chrome inside the design canvas */
.design-canvas .App-toolbar,
.design-canvas .dropdown-menu-button,
.design-canvas .layer-ui__wrapper__top-right,
.design-canvas .sidebar-trigger,
.design-canvas .help-icon,
.design-canvas .collab-button,
.design-canvas .welcome-screen-center,
.design-canvas .layer-ui__wrapper__footer-left,
.design-canvas .App-menu__left { display: none !important; }
.design-canvas .layer-ui__wrapper { z-index: 10 !important; }

.design-right {
  grid-area: right; display: flex; flex-direction: column;
  background: var(--glass); backdrop-filter: blur(10px);
  border-left: 1px solid var(--rule); overflow: hidden;
}
.design-props { flex: 0 0 auto; padding: 10px 12px; border-bottom: 1px solid var(--rule); display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.design-props-empty { padding: 20px 12px; color: var(--text-faint); font: 500 11px var(--font-mono); text-align: center; }
.design-section-label { font: 500 10px var(--font-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint); padding: 2px 0; }
.design-prop-section { display: flex; flex-direction: column; gap: 4px; }
.design-prop-row { display: flex; align-items: center; gap: 4px; }
.design-prop-label { font: 500 10px var(--font-mono); color: var(--text-faint); letter-spacing: .04em; width: 14px; flex: none; text-align: center; }
.design-prop-input { flex: 1; min-width: 0; background: var(--surface-2); border: 1px solid var(--rule); border-radius: 6px; color: var(--text); font: 500 11px var(--font-mono); padding: 3px 5px; outline: none; transition: border-color .14s; }
.design-prop-input:focus { border-color: var(--accent); }
.design-prop-input.narrow { max-width: 44px; }
.design-color-swatch { width: 20px; height: 20px; flex: none; border: 1px solid var(--rule); border-radius: 5px; overflow: hidden; cursor: pointer; }
.design-color-swatch input[type="color"] { width: 200%; height: 200%; border: none; padding: 0; transform: translate(-25%,-25%); cursor: pointer; }
.design-prop-opacity { font: 500 10px var(--font-mono); color: var(--text-faint); min-width: 30px; text-align: right; }

.design-layers { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.design-layers-head { padding: 8px 12px 4px; font: 500 10px var(--font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); flex: none; }
.design-layers-list { flex: 1; overflow-y: auto; padding: 2px 0 6px; }
.design-layer-row { display: flex; align-items: center; gap: 6px; padding: 3px 8px 3px 10px; cursor: pointer; font: 500 11.5px var(--font-ui); color: var(--text-muted); border-left: 3px solid transparent; transition: background .12s, color .12s; user-select: none; }
.design-layer-row:hover { background: rgba(243,238,229,.05); color: var(--text); }
.design-layer-row.ds-selected { border-left-color: var(--accent); color: var(--text); background: var(--accent-soft); }
.design-layer-icon { flex: none; display: inline-flex; color: var(--text-faint); }
.design-layer-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.design-layer-actions { display: flex; gap: 2px; opacity: 0; transition: opacity .12s; }
.design-layer-row:hover .design-layer-actions { opacity: 1; }
.design-layer-row.ds-selected .design-layer-actions { opacity: 1; }
.design-layer-btn { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border: none; background: transparent; color: var(--text-faint); cursor: pointer; border-radius: 4px; font-size: 11px; transition: color .12s, background .12s; }
.design-layer-btn:hover { color: var(--text); background: rgba(243,238,229,.08); }

.design-zoom-island {
  position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 20;
  display: flex; align-items: center;
  background: var(--glass); backdrop-filter: blur(10px);
  border: 1px solid var(--rule); border-radius: var(--radius-sm);
  padding: 4px; box-shadow: var(--shadow); gap: 2px;
}
.design-zoom-btn { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); font: 600 13px var(--font-ui); transition: background .12s, color .12s; }
.design-zoom-btn:hover { background: rgba(243,238,229,.06); color: var(--text); }
.design-zoom-pct { font: 500 11.5px var(--font-mono); color: var(--text-muted); min-width: 38px; text-align: center; }

.design-error { position: absolute; inset: 0; display: grid; place-items: center; padding: 0 24px; text-align: center; color: var(--danger); font: 500 13px var(--font-mono); }
.design-toast { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%); background: var(--glass); border: 1px solid var(--rule); border-radius: var(--radius-sm); padding: 7px 14px; color: var(--text); font: 500 12px var(--font-ui); box-shadow: var(--shadow); z-index: 30; white-space: nowrap; }
```

- [ ] **Step 2: Verify no style regressions**

Run: `npm run build` in `vibe-space/`  
Expected: TypeScript + Vite compile succeeds, no errors

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "style(design-page): grid layout + Excalidraw chrome suppression"
```

---

### Task 2: Pure utilities — designUtils.ts

**Files:**
- Create: `src/design/designUtils.ts`
- Create: `src/design/designUtils.test.ts`

**Interfaces:**
- Produces:
  - `radToDeg(rad: number): number`
  - `degToRad(deg: number): number`
  - `labelForElement(el: { type: string; text?: string }): string`
  - `patchElements(elements: readonly { id: string }[], id: string, patch: Record<string, unknown>): unknown[]`

- [ ] **Step 1: Write failing tests**

Create `src/design/designUtils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { radToDeg, degToRad, labelForElement, patchElements } from "./designUtils";

describe("radToDeg", () => {
  it("converts 0", () => expect(radToDeg(0)).toBe(0));
  it("converts PI to 180", () => expect(radToDeg(Math.PI)).toBeCloseTo(180));
  it("converts PI/2 to 90", () => expect(radToDeg(Math.PI / 2)).toBeCloseTo(90));
});

describe("degToRad", () => {
  it("converts 0", () => expect(degToRad(0)).toBe(0));
  it("converts 180 to PI", () => expect(degToRad(180)).toBeCloseTo(Math.PI));
  it("round-trips with radToDeg", () => expect(degToRad(radToDeg(1.23))).toBeCloseTo(1.23));
});

describe("labelForElement", () => {
  it("capitalises type for non-text", () => expect(labelForElement({ type: "rectangle" })).toBe("Rectangle"));
  it("uses text content for text elements", () => expect(labelForElement({ type: "text", text: "Hello world" })).toBe('"Hello world"'));
  it("truncates long text", () => {
    const long = "a".repeat(25);
    const label = labelForElement({ type: "text", text: long });
    expect(label.length).toBeLessThanOrEqual(22); // '"' + 18 chars + '"' + '…' max
  });
  it("handles empty text", () => expect(labelForElement({ type: "text", text: "" })).toBe('"…"'));
});

describe("patchElements", () => {
  const els = [{ id: "a", x: 0 }, { id: "b", x: 5 }];
  it("patches the target element", () => {
    const result = patchElements(els, "a", { x: 99 });
    expect((result[0] as { x: number }).x).toBe(99);
  });
  it("leaves other elements untouched", () => {
    const result = patchElements(els, "a", { x: 99 });
    expect(result[1]).toBe(els[1]); // same reference
  });
  it("returns a new array", () => {
    expect(patchElements(els, "a", { x: 1 })).not.toBe(els);
  });
  it("is a no-op when id not found", () => {
    const result = patchElements(els, "missing", { x: 99 });
    expect(result[0]).toBe(els[0]);
    expect(result[1]).toBe(els[1]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd vibe-space && npx vitest run src/design/designUtils.test.ts
```

Expected: FAIL — `Cannot find module './designUtils'`

- [ ] **Step 3: Implement designUtils.ts**

Create `src/design/designUtils.ts`:

```ts
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

export function labelForElement(el: { type: string; text?: string }): string {
  if (el.type === "text") {
    const t = (el.text ?? "").trim();
    if (!t) return '"…"';
    const snippet = t.slice(0, 18);
    return `"${snippet}${t.length > 18 ? "…" : ""}"`;
  }
  return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}

export function patchElements(
  elements: readonly { id: string }[],
  id: string,
  patch: Record<string, unknown>
): unknown[] {
  return elements.map((el) => (el.id === id ? { ...el, ...patch } : el));
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/design/designUtils.test.ts
```

Expected: All 11 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/design/designUtils.ts src/design/designUtils.test.ts
git commit -m "feat(design-page): pure utils (patchElements, labelForElement, radToDeg)"
```

---

### Task 3: DesignLeftBar component

**Files:**
- Create: `src/design/DesignLeftBar.tsx`

**Interfaces:**
- Consumes: `TOOLS` from `../wall/tools`, `TOOL_ICONS` from `../wall/icons`, `ExcalidrawImperativeAPI` from `@excalidraw/excalidraw/types`
- Produces: `<DesignLeftBar activeType apiRef />` — renders vertical tool buttons, calls `api.setActiveTool` on click

- [ ] **Step 1: Create DesignLeftBar.tsx**

```tsx
import { Fragment } from "react";
import { TOOLS } from "../wall/tools";
import { TOOL_ICONS } from "../wall/icons";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const GROUPS: Array<Array<typeof TOOLS[number]["type"]>> = [
  ["selection", "hand"],
  ["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw", "text", "image", "eraser"],
  ["frame"],
];

export function DesignLeftBar({
  activeType,
  apiRef,
}: {
  activeType: string;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  return (
    <div className="design-leftbar" role="toolbar" aria-label="Drawing tools">
      {GROUPS.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <span className="design-tool-sep" />}
          {group.map((type) => {
            const tool = TOOLS.find((t) => t.type === type)!;
            const Icon = TOOL_ICONS[type];
            return (
              <button
                key={type}
                className={`tool-key${type === activeType ? " active" : ""}`}
                title={`${tool.label} · ${tool.shortcut}`}
                onPointerDown={() =>
                  apiRef.current?.setActiveTool(
                    { type } as Parameters<ExcalidrawImperativeAPI["setActiveTool"]>[0]
                  )
                }
              >
                <Icon />
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/design/DesignLeftBar.tsx
git commit -m "feat(design-page): DesignLeftBar — vertical tool sidebar"
```

---

### Task 4: DesignTopBar component

**Files:**
- Create: `src/design/DesignTopBar.tsx`

**Interfaces:**
- Consumes: `BackIcon` from `../wall/icons`
- Produces: `<DesignTopBar zoom onBack onReference />` — renders top bar row

- [ ] **Step 1: Create DesignTopBar.tsx**

```tsx
import { BackIcon } from "../wall/icons";

export function DesignTopBar({
  zoom,
  onBack,
  onReference,
}: {
  zoom: number;
  onBack: () => void;
  onReference: () => void;
}) {
  return (
    <div className="design-topbar">
      <button className="cnvs-btn" onClick={onBack} title="Back to wall">
        <BackIcon />
      </button>
      <span className="design-title">UI Design</span>
      <span className="design-spacer" />
      <span className="design-zoom-readout">{Math.round(zoom * 100)}%</span>
      <button
        className="cnvs-btn design-ref"
        onClick={onReference}
        title="Reference this UI in the focused terminal"
      >
        @ Reference in terminal
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/design/DesignTopBar.tsx
git commit -m "feat(design-page): DesignTopBar — back, title, zoom readout, reference"
```

---

### Task 5: DesignRightPanel component

**Files:**
- Create: `src/design/DesignRightPanel.tsx`

**Interfaces:**
- Consumes:
  - `patchElements`, `labelForElement`, `radToDeg`, `degToRad` from `./designUtils`
  - `TOOL_ICONS`, `SelectIcon` from `../wall/icons`
  - `ExcalidrawElement` from `@excalidraw/excalidraw/element/types`
  - `ExcalidrawImperativeAPI` from `@excalidraw/excalidraw/types`
- Produces: `<DesignRightPanel elements selectedIds apiRef />` — properties + layers panel

- [ ] **Step 1: Create DesignRightPanel.tsx**

```tsx
import { useState } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { patchElements, labelForElement, radToDeg, degToRad } from "./designUtils";
import { TOOL_ICONS, SelectIcon } from "../wall/icons";

function ShapeIcon({ type }: { type: string }) {
  const Icon = TOOL_ICONS[type as keyof typeof TOOL_ICONS];
  return <span className="design-layer-icon">{Icon ? <Icon /> : <SelectIcon />}</span>;
}

function NumInput({
  label,
  value,
  onCommit,
  elId,
  field,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  elId: string;
  field: string;
}) {
  return (
    <div className="design-prop-row">
      <span className="design-prop-label">{label}</span>
      <input
        type="number"
        className="design-prop-input"
        key={`${elId}-${field}`}
        defaultValue={Math.round(value)}
        onBlur={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onCommit(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}

export function DesignRightPanel({
  elements,
  selectedIds,
  apiRef,
}: {
  elements: readonly ExcalidrawElement[];
  selectedIds: Record<string, boolean>;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const [hiddenPrevOpacity, setHiddenPrevOpacity] = useState<Record<string, number>>({});

  const target = elements.find((e) => selectedIds[e.id]) ?? null;

  function commit(id: string, patch: Record<string, unknown>) {
    const api = apiRef.current;
    if (!api) return;
    const updated = patchElements(elements, id, patch) as ExcalidrawElement[];
    api.updateScene({ elements: updated });
  }

  const layers = [...elements].reverse();

  return (
    <div className="design-right">
      {/* ── Properties ── */}
      <div className="design-props">
        {target ? (
          <>
            <span className="design-section-label">Transform</span>
            <div className="design-prop-section">
              <div className="design-prop-row">
                <NumInput label="X" value={target.x} elId={target.id} field="x" onCommit={(v) => commit(target.id, { x: v })} />
                <NumInput label="Y" value={target.y} elId={target.id} field="y" onCommit={(v) => commit(target.id, { y: v })} />
              </div>
              <div className="design-prop-row">
                <NumInput label="W" value={target.width} elId={target.id} field="w" onCommit={(v) => commit(target.id, { width: v })} />
                <NumInput label="H" value={target.height} elId={target.id} field="h" onCommit={(v) => commit(target.id, { height: v })} />
              </div>
              <NumInput label="°" value={radToDeg(target.angle)} elId={target.id} field="rot" onCommit={(v) => commit(target.id, { angle: degToRad(v) })} />
            </div>

            <span className="design-section-label">Appearance</span>
            <div className="design-prop-section">
              <div className="design-prop-row">
                <span className="design-prop-label">Fi</span>
                <div className="design-color-swatch">
                  <input
                    type="color"
                    value={target.backgroundColor === "transparent" ? "#000000" : (target.backgroundColor ?? "#000000")}
                    onChange={(e) => commit(target.id, { backgroundColor: e.target.value })}
                  />
                </div>
                <span className="design-prop-label">St</span>
                <div className="design-color-swatch">
                  <input
                    type="color"
                    value={target.strokeColor}
                    onChange={(e) => commit(target.id, { strokeColor: e.target.value })}
                  />
                </div>
                <input
                  type="number"
                  className="design-prop-input narrow"
                  key={`${target.id}-sw`}
                  defaultValue={target.strokeWidth}
                  onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) commit(target.id, { strokeWidth: v }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
              </div>
              <div className="design-prop-row">
                <span className="design-prop-label">Op</span>
                <input
                  type="range"
                  min={0} max={100}
                  style={{ flex: 1 }}
                  value={target.opacity}
                  onChange={(e) => commit(target.id, { opacity: parseInt(e.target.value) })}
                />
                <span className="design-prop-opacity">{target.opacity}%</span>
              </div>
            </div>

            {target.type === "text" && (
              <>
                <span className="design-section-label">Text</span>
                <div className="design-prop-section">
                  <div className="design-prop-row">
                    <span className="design-prop-label">Sz</span>
                    <input
                      type="number"
                      className="design-prop-input"
                      key={`${target.id}-fs`}
                      defaultValue={(target as unknown as { fontSize: number }).fontSize ?? 16}
                      onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) commit(target.id, { fontSize: v }); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="design-props-empty">Select a shape to inspect it</div>
        )}
      </div>

      {/* ── Layers ── */}
      <div className="design-layers">
        <div className="design-layers-head">Layers</div>
        <div className="design-layers-list">
          {layers.map((el) => {
            const isSelected = !!selectedIds[el.id];
            const isHidden = el.opacity === 0;
            const isLocked = el.locked ?? false;
            const label = labelForElement(el as { type: string; text?: string });
            return (
              <div
                key={el.id}
                className={`design-layer-row${isSelected ? " ds-selected" : ""}`}
                onClick={() =>
                  apiRef.current?.updateScene({
                    appState: { selectedElementIds: { [el.id]: true } } as never,
                  })
                }
              >
                <ShapeIcon type={el.type} />
                <span className="design-layer-name">{label}</span>
                <div className="design-layer-actions">
                  <button
                    className="design-layer-btn"
                    title={isHidden ? "Show" : "Hide"}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (isHidden) {
                        const prev = hiddenPrevOpacity[el.id] ?? 100;
                        setHiddenPrevOpacity((m) => { const n = { ...m }; delete n[el.id]; return n; });
                        commit(el.id, { opacity: prev });
                      } else {
                        setHiddenPrevOpacity((m) => ({ ...m, [el.id]: el.opacity }));
                        commit(el.id, { opacity: 0 });
                      }
                    }}
                  >
                    {isHidden ? "○" : "●"}
                  </button>
                  <button
                    className="design-layer-btn"
                    title={isLocked ? "Unlock" : "Lock"}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      commit(el.id, { locked: !isLocked });
                    }}
                  >
                    {isLocked ? "🔒" : "🔓"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/design/DesignRightPanel.tsx
git commit -m "feat(design-page): DesignRightPanel — properties inspector + layers"
```

---

### Task 6: Refactor DesignPage — wire 3-panel shell

**Files:**
- Modify: `src/design/DesignPage.tsx`

**Interfaces:**
- Consumes: `DesignTopBar`, `DesignLeftBar`, `DesignRightPanel` from Tasks 3–5
- All persistence/watch logic (`resolveDesignPath`, `ensureDesignFile`, `readDesignFile`, `writeDesignFile`, `watchDesignFile`, `hashText`, `makeEchoGuard`, `referenceInActiveTerminal`) unchanged — only the JSX layout changes

- [ ] **Step 1: Rewrite DesignPage.tsx**

```tsx
import { useEffect, useRef, useState } from "react";
import { Excalidraw, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, AppState, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { readDesignFile, writeDesignFile } from "../store/persistence";
import { resolveDesignPath, ensureDesignFile } from "./designFile";
import { serializeScene, parseScene, DEFAULT_BG, type SceneElement } from "./normalize";
import { hashText, makeEchoGuard } from "./echoGuard";
import { watchDesignFile } from "./watch";
import { referenceInActiveTerminal } from "./reference";
import { DesignTopBar } from "./DesignTopBar";
import { DesignLeftBar } from "./DesignLeftBar";
import { DesignRightPanel } from "./DesignRightPanel";

type Initial = { elements: ExcalidrawElement[]; appState: Partial<AppState> };

const toEls = (e: SceneElement[]) =>
  restoreElements(e as unknown as ExcalidrawElement[], null);

export function DesignPage({ wallId, onBack }: { wallId: string; onBack: () => void }) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const pathRef = useRef<string | null>(null);
  const loadedHash = useRef<string>("");
  const echo = useRef(makeEchoGuard());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initial, setInitial] = useState<Initial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Lifted from onChange for child panels
  const [elements, setElements] = useState<readonly ExcalidrawElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [zoom, setZoom] = useState(1);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  function applyExternal(text: string) {
    const r = parseScene(text);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    loadedHash.current = hashText(text);
    apiRef.current?.updateScene({
      elements: toEls(r.elements),
      appState: { viewBackgroundColor: r.viewBackgroundColor },
    });
  }

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void (async () => {
      const path = await resolveDesignPath(wallId);
      if (!path) { if (!cancelled) setError("This space has no project folder."); return; }
      pathRef.current = path;
      await ensureDesignFile(path);
      const text = await readDesignFile(path).catch((e) => { setError(String(e)); return null; });
      if (text === null || cancelled) return;
      const r = parseScene(text);
      if (!r.ok) { setError(r.error); return; }
      loadedHash.current = hashText(text);
      setInitial({ elements: toEls(r.elements), appState: { viewBackgroundColor: r.viewBackgroundColor } });
      const un = await watchDesignFile(path, async () => {
        const t = await readDesignFile(path).catch(() => null);
        if (t === null || cancelled) return;
        if (echo.current.isOwnEcho(t)) return;
        if (hashText(t) === loadedHash.current) return;
        applyExternal(t);
        flash("reloaded — agent updated this UI");
      });
      if (cancelled) un(); else stop = un;
    })();
    return () => {
      cancelled = true;
      stop?.();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [wallId]);

  function onChange(els: readonly ExcalidrawElement[], appState: AppState) {
    // Lift state for child panels
    setElements(els);
    setSelectedIds(appState.selectedElementIds as Record<string, boolean>);
    setZoom(appState.zoom.value);

    const path = pathRef.current;
    if (!path) return;
    const text = serializeScene(els as unknown as SceneElement[], appState.viewBackgroundColor ?? DEFAULT_BG);
    if (hashText(text) === loadedHash.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const onDisk = await readDesignFile(path).catch(() => null);
      if (onDisk !== null && hashText(onDisk) !== loadedHash.current && !echo.current.isOwnEcho(onDisk)) {
        applyExternal(onDisk);
        flash("reloaded — agent updated this UI");
        return;
      }
      echo.current.markWritten(text);
      loadedHash.current = hashText(text);
      await writeDesignFile(path, text).catch((e) => setError(String(e)));
    }, 300);
  }

  async function reference() {
    const path = pathRef.current;
    if (!path) return;
    const how = await referenceInActiveTerminal(path);
    flash(how === "sent" ? "added to the focused terminal" : "no terminal focused — path copied");
  }

  function zoomBy(delta: number) {
    const api = apiRef.current;
    if (!api) return;
    const next = Math.min(4, Math.max(0.1, zoom + delta));
    api.updateScene({ appState: { zoom: { value: next as NormalizedZoomValue } } });
  }

  return (
    <div className="design-page">
      <DesignTopBar zoom={zoom} onBack={onBack} onReference={() => void reference()} />
      <DesignLeftBar activeType={selectedIds ? "selection" : "selection"} apiRef={apiRef} />

      <div className="design-canvas">
        {error && <div className="design-error">{error}</div>}
        {initial && !error && (
          <Excalidraw
            excalidrawAPI={(api) => { apiRef.current = api; }}
            initialData={initial}
            theme="dark"
            onChange={onChange}
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
          />
        )}
        <div className="design-zoom-island">
          <button className="design-zoom-btn" onClick={() => zoomBy(-0.1)} title="Zoom out">–</button>
          <span className="design-zoom-pct">{Math.round(zoom * 100)}%</span>
          <button className="design-zoom-btn" onClick={() => zoomBy(0.1)} title="Zoom in">+</button>
        </div>
        {toast && <div className="design-toast">{toast}</div>}
      </div>

      <DesignRightPanel elements={elements} selectedIds={selectedIds} apiRef={apiRef} />
    </div>
  );
}
```

> **Note on `activeType`:** The current `DesignPage` tracked the active tool via `appState.activeTool.type`. The line above has a placeholder — fix it:
> 
> Add a state: `const [activeType, setActiveType] = useState("selection");`  
> In `onChange`, add: `setActiveType((appState as { activeTool?: { type?: string } }).activeTool?.type ?? "selection");`  
> Then pass `activeType={activeType}` to `<DesignLeftBar>`.

- [ ] **Step 2: Fix the activeType tracking** (apply the note above to the file you just wrote)

In `DesignPage.tsx`:

Add after `const [zoom, setZoom] = useState(1);`:
```ts
const [activeType, setActiveType] = useState("selection");
```

In `onChange`, after `setZoom(appState.zoom.value);` add:
```ts
setActiveType((appState as { activeTool?: { type?: string } }).activeTool?.type ?? "selection");
```

Change `<DesignLeftBar activeType={selectedIds ? "selection" : "selection"} apiRef={apiRef} />`  
to `<DesignLeftBar activeType={activeType} apiRef={apiRef} />`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass (normalize tests + designUtils tests)

- [ ] **Step 5: Commit**

```bash
git add src/design/DesignPage.tsx
git commit -m "feat(design-page): wire 3-panel Figma-style layout — left bar, top bar, properties + layers"
```

---

## Self-Review

**Spec coverage:**
- ✅ Grid layout (34px top, 34px left, 256px right) — Task 1
- ✅ Excalidraw chrome suppression — Task 1 CSS
- ✅ DesignTopBar (back, title, zoom, reference) — Task 4
- ✅ DesignLeftBar (12 tools in 3 groups, active highlight) — Task 3
- ✅ Properties: X/Y/W/H/rotation/fill/stroke/opacity/fontSize — Task 5
- ✅ Layers: reverse order, click-to-select, hide/show, lock/unlock — Task 5
- ✅ Zoom controls floating over canvas — Task 6
- ✅ Agent write-back / file watcher / echo guard — unchanged, carried through Task 6
- ✅ normalize.ts untouched — Task 6 imports it unchanged

**Placeholder scan:** None found.

**Type consistency:**
- `patchElements` returns `unknown[]`, cast to `ExcalidrawElement[]` at call site in DesignRightPanel — consistent
- `apiRef` is `React.RefObject<ExcalidrawImperativeAPI | null>` in all three components — consistent
- `selectedIds` is `Record<string, boolean>` in DesignPage state and DesignRightPanel props — consistent
