# Design Page Stability Core (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the UI Design page's foundation Figma-stable: no per-frame full re-renders, undo-safe panel edits, no lost saves, anchored zoom, live inspector, crisp defaults, correct hide.

**Architecture:** An external store (`designStore.ts`) sits between Excalidraw's `onChange` and the panels; panels subscribe to derived slices via `useSyncExternalStore`. All panel-originated edits flow through one version-correct commit path (`commit.ts` / pure core in `commitCore.ts`) captured into undo history. Saves go through a debounced saver with an explicit flush on exit.

**Tech Stack:** React 19, `@excalidraw/excalidraw` 0.18.x, Tauri v2, vitest (node env), TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-02-design-page-figma-overhaul-design.md` (Phase 1 / Architecture sections).

## Global Constraints

- Repo root for all paths/commands: `vibe-space/` (this file's repo). Run commands from there.
- `.vibe-design.json` format stays **version 1, backward compatible**; new metadata only in `customData` (already preserved by `normalize.ts`).
- `normalize.ts`, `echoGuard.ts`, `watch.ts`, `designFile.ts`, `reference.ts` are untouched in Phase 1.
- vitest runs in **node env** and only matches `src/**/*.test.ts` — testable logic must live in pure `.ts` modules with **no `@excalidraw/excalidraw` and no React imports** (structural types only). Thin wrappers/components hold the framework imports.
- Do NOT launch or restart the app — Claude runs inside Vibe Space's own terminal; a restart kills the session. Verification is `npx vitest run` + `npx tsc --noEmit` only; visual checks are deferred to the user.
- Match existing style: 2-space indent, double quotes, co-located `*.test.ts`, comments only for non-obvious constraints.
- Commit after each task with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `commitCore.ts` — pure element mutation helpers

**Files:**
- Create: `src/design/commitCore.ts`
- Create: `src/design/commitCore.test.ts`
- Modify: `src/design/designUtils.ts` (delete `patchElements` — absorbed here)
- Modify: `src/design/designUtils.test.ts` (delete the `patchElements` describe block and its import)

**Interfaces:**
- Consumes: nothing.
- Produces: `type El`, `type Patch = Record<string, unknown>`, `bumpElement<T extends El>(el: T): T`, `applyPatches(elements: readonly El[], patches: Record<string, Patch>): El[]`, `isHidden(el: El): boolean`, `hidePatch(el: El): Patch`, `unhidePatch(el: El): Patch`. Used by Tasks 2, 5, 7.

- [ ] **Step 1: Write the failing test**

Create `src/design/commitCore.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyPatches, bumpElement, hidePatch, isHidden, unhidePatch, type El } from "./commitCore";

const el = (over: Partial<El> = {}): El => ({
  id: "a", version: 3, versionNonce: 42, updated: 1, opacity: 80, ...over,
});

describe("bumpElement", () => {
  it("increments version and refreshes updated", () => {
    const b = bumpElement(el());
    expect(b.version).toBe(4);
    expect(b.updated).toBeGreaterThan(1);
    expect(typeof b.versionNonce).toBe("number");
  });
  it("does not mutate the input", () => {
    const a = el();
    bumpElement(a);
    expect(a.version).toBe(3);
  });
});

describe("applyPatches", () => {
  const els = [el({ id: "a", x: 0 }), el({ id: "b", x: 5 })];
  it("applies the patch and bumps only the target", () => {
    const out = applyPatches(els, { a: { x: 99 } });
    expect(out[0].x).toBe(99);
    expect(out[0].version).toBe(4);
    expect(out[1]).toBe(els[1]); // identity preserved -> Excalidraw treats as unchanged
  });
  it("applies multiple patches in one pass", () => {
    const out = applyPatches(els, { a: { x: 1 }, b: { x: 2 } });
    expect(out[0].x).toBe(1);
    expect(out[1].x).toBe(2);
    expect(out[1].version).toBe(4);
  });
  it("ignores ids not in the scene", () => {
    const out = applyPatches(els, { zz: { x: 1 } });
    expect(out[0]).toBe(els[0]);
    expect(out[1]).toBe(els[1]);
  });
});

describe("hide/unhide", () => {
  it("hidePatch makes the element invisible and unclickable, remembering prior state", () => {
    const p = hidePatch(el({ opacity: 80, locked: false }));
    expect(p.opacity).toBe(0);
    expect(p.locked).toBe(true);
    expect((p.customData as Record<string, unknown>).vsHidden).toBe(true);
    expect((p.customData as Record<string, unknown>).prevOpacity).toBe(80);
    expect((p.customData as Record<string, unknown>).prevLocked).toBe(false);
  });
  it("round-trips: unhide restores opacity and locked exactly", () => {
    const hidden = { ...el({ opacity: 80, locked: true }), ...hidePatch(el({ opacity: 80, locked: true })) } as El;
    expect(isHidden(hidden)).toBe(true);
    const p = unhidePatch(hidden);
    expect(p.opacity).toBe(80);
    expect(p.locked).toBe(true);
    expect((p.customData as Record<string, unknown>).vsHidden).toBeUndefined();
    expect((p.customData as Record<string, unknown>).prevOpacity).toBeUndefined();
  });
  it("unhide falls back to sane defaults when customData was stripped", () => {
    const p = unhidePatch(el({ opacity: 0, locked: true, customData: { vsHidden: true } }));
    expect(p.opacity).toBe(100);
    expect(p.locked).toBe(false);
  });
  it("isHidden is false for normal elements, even at opacity 0", () => {
    expect(isHidden(el())).toBe(false);
    expect(isHidden(el({ opacity: 0 }))).toBe(false);
  });
  it("hidePatch preserves unrelated customData keys", () => {
    const p = hidePatch(el({ customData: { name: "Hero" } }));
    expect((p.customData as Record<string, unknown>).name).toBe("Hero");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/commitCore.test.ts`
Expected: FAIL — cannot resolve `./commitCore`.

- [ ] **Step 3: Write the implementation**

Create `src/design/commitCore.ts`:

```ts
/** Pure element-mutation helpers. No Excalidraw/React imports so tests run
 *  in vitest's node env; Excalidraw elements satisfy `El` structurally. */

export type El = {
  id: string;
  version: number;
  versionNonce: number;
  updated: number;
  opacity: number;
  locked?: boolean;
  customData?: Record<string, unknown>;
} & Record<string, unknown>;

export type Patch = Record<string, unknown>;

/** Excalidraw's reconciliation drops edits whose version didn't advance;
 *  every patched element must be bumped or the change can be silently lost. */
export function bumpElement<T extends El>(el: T): T {
  return {
    ...el,
    version: el.version + 1,
    versionNonce: Math.floor(Math.random() * 0x7fffffff),
    updated: Date.now(),
  };
}

/** Apply per-id patches, bumping only patched elements. Untouched elements
 *  keep their identity so Excalidraw treats them as unchanged. */
export function applyPatches(elements: readonly El[], patches: Record<string, Patch>): El[] {
  return elements.map((el) => {
    const p = patches[el.id];
    return p ? bumpElement({ ...el, ...p }) : el;
  });
}

export function isHidden(el: El): boolean {
  return el.customData?.vsHidden === true;
}

/** Hidden = invisible AND unclickable. Prior state rides in customData so it
 *  survives the file round-trip (normalize.ts preserves customData). */
export function hidePatch(el: El): Patch {
  return {
    opacity: 0,
    locked: true,
    customData: {
      ...el.customData,
      vsHidden: true,
      prevOpacity: el.opacity,
      prevLocked: el.locked ?? false,
    },
  };
}

export function unhidePatch(el: El): Patch {
  const cd: Record<string, unknown> = { ...el.customData };
  const opacity = typeof cd.prevOpacity === "number" ? cd.prevOpacity : 100;
  const locked = cd.prevLocked === true;
  delete cd.vsHidden;
  delete cd.prevOpacity;
  delete cd.prevLocked;
  return { opacity, locked, customData: cd };
}
```

In `src/design/designUtils.ts`, delete the `patchElements` function (keep `radToDeg`, `degToRad`, `labelForElement`). In `src/design/designUtils.test.ts`, delete the `describe("patchElements", ...)` block and remove `patchElements` from the import. (`DesignRightPanel.tsx` still imports `patchElements` at this point — that reference is removed in Task 7; until then `npx tsc --noEmit` would flag it, so the tsc gate for this task is waived; vitest is the gate.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/commitCore.test.ts src/design/designUtils.test.ts`
Expected: PASS (all).

To keep Task 5's tsc gate meaningful, temporarily re-point `DesignRightPanel.tsx`'s import: replace `import { patchElements, labelForElement, radToDeg, degToRad } from "./designUtils";` with:

```ts
import { labelForElement, radToDeg, degToRad } from "./designUtils";
import { applyPatches } from "./commitCore";
```

and in its `commit` function replace the line
`const updated = patchElements(elements, id, patch) as ExcalidrawElement[];` with:

```ts
    const updated = applyPatches(
      elements as unknown as import("./commitCore").El[],
      { [id]: patch },
    ) as unknown as ExcalidrawElement[];
```

This is a stopgap (Task 7 rewrites the file) but keeps the tree compiling.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/design/commitCore.ts src/design/commitCore.test.ts src/design/designUtils.ts src/design/designUtils.test.ts src/design/DesignRightPanel.tsx
git commit -m "feat(design): version-correct patch core + hide/unhide helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: `designStore.ts` + `useDesignSelector.ts` — external store and selectors

**Files:**
- Create: `src/design/designStore.ts`
- Create: `src/design/designStore.test.ts`
- Create: `src/design/useDesignSelector.ts` (thin React hook, no test — node env)

**Interfaces:**
- Consumes: `isHidden` from `./commitCore`; `labelForElement` from `./designUtils`.
- Produces:
  - `type StoreElement` (structural element type), `type DesignSnapshot`, `type DesignStore = { get(): DesignSnapshot; set(next: DesignSnapshot): void; subscribe(fn: () => void): () => void }`, `createDesignStore(): DesignStore`, `EMPTY_SNAPSHOT: DesignSnapshot`
  - Selectors: `type LayerRow = { id: string; type: string; label: string; hidden: boolean; locked: boolean; selected: boolean }`, `selectLayers(s): LayerRow[]`, `layersEqual(a, b): boolean`, `type InspectorSel`, `selectInspector(s): InspectorSel | null`, `inspectorEqual(a, b): boolean`, `selectZoom(s): number`, `selectActiveType(s): string`
  - Hook: `useDesignSelector<T>(store, selector, isEqual?): T`
- Used by Tasks 5, 6, 7.

- [ ] **Step 1: Write the failing test**

Create `src/design/designStore.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  createDesignStore, EMPTY_SNAPSHOT, selectLayers, layersEqual,
  selectInspector, inspectorEqual, type DesignSnapshot, type StoreElement,
} from "./designStore";

const el = (over: Partial<StoreElement> = {}): StoreElement => ({
  id: "a", type: "rectangle", version: 1, versionNonce: 1, updated: 1, opacity: 100,
  x: 10.4, y: 20.6, width: 100, height: 50, angle: 0,
  strokeColor: "#fff", backgroundColor: "transparent", strokeWidth: 1,
  ...over,
});

const snap = (over: Partial<DesignSnapshot> = {}): DesignSnapshot => ({
  ...EMPTY_SNAPSHOT, ...over,
});

describe("createDesignStore", () => {
  it("notifies subscribers on set and exposes the snapshot", () => {
    const store = createDesignStore();
    let fired = 0;
    store.subscribe(() => fired++);
    const s = snap({ zoom: 2 });
    store.set(s);
    expect(fired).toBe(1);
    expect(store.get()).toBe(s);
  });
  it("unsubscribe stops notifications", () => {
    const store = createDesignStore();
    let fired = 0;
    const un = store.subscribe(() => fired++);
    un();
    store.set(snap());
    expect(fired).toBe(0);
  });
});

describe("selectLayers", () => {
  it("reverses element order (top of stack first) and skips deleted", () => {
    const s = snap({
      elements: [el({ id: "a" }), el({ id: "b" }), el({ id: "c", isDeleted: true })],
    });
    expect(selectLayers(s).map((r) => r.id)).toEqual(["b", "a"]);
  });
  it("marks selection, lock, and hide state", () => {
    const s = snap({
      elements: [el({ id: "a", locked: true, customData: { vsHidden: true } })],
      selectedIds: { a: true },
    });
    const [row] = selectLayers(s);
    expect(row.selected).toBe(true);
    expect(row.locked).toBe(true);
    expect(row.hidden).toBe(true);
  });
  it("labels text elements with their content", () => {
    const s = snap({ elements: [el({ id: "t", type: "text", text: "Hi" })] });
    expect(selectLayers(s)[0].label).toBe('"Hi"');
  });
});

describe("layersEqual", () => {
  const s = snap({ elements: [el({ id: "a" }), el({ id: "b" })] });
  it("is true for equivalent rows (pure drag does not re-render layers)", () => {
    const moved = snap({ elements: [el({ id: "a", x: 500 }), el({ id: "b", x: 900 })] });
    expect(layersEqual(selectLayers(s), selectLayers(moved))).toBe(true);
  });
  it("is false when order changes", () => {
    const reordered = snap({ elements: [el({ id: "b" }), el({ id: "a" })] });
    expect(layersEqual(selectLayers(s), selectLayers(reordered))).toBe(false);
  });
  it("is false when selection changes", () => {
    const sel = snap({ elements: [el({ id: "a" }), el({ id: "b" })], selectedIds: { a: true } });
    expect(layersEqual(selectLayers(s), selectLayers(sel))).toBe(false);
  });
});

describe("selectInspector", () => {
  it("is null when nothing is selected", () => {
    expect(selectInspector(snap({ elements: [el()] }))).toBeNull();
  });
  it("exposes the first selected element's editable fields, rounded position", () => {
    const s = snap({
      elements: [el({ id: "a", angle: Math.PI })],
      selectedIds: { a: true },
    });
    const i = selectInspector(s)!;
    expect(i.id).toBe("a");
    expect(i.x).toBe(10);       // rounded for display stability
    expect(i.y).toBe(21);
    expect(i.angleDeg).toBe(180);
    expect(i.fontSize).toBeNull();
  });
  it("exposes fontSize for text elements", () => {
    const s = snap({
      elements: [el({ id: "t", type: "text", fontSize: 24 })],
      selectedIds: { t: true },
    });
    expect(selectInspector(s)!.fontSize).toBe(24);
  });
  it("inspectorEqual: equal for same values, different after a move", () => {
    const a = snap({ elements: [el({ id: "a" })], selectedIds: { a: true } });
    const b = snap({ elements: [el({ id: "a" })], selectedIds: { a: true } });
    const c = snap({ elements: [el({ id: "a", x: 999 })], selectedIds: { a: true } });
    expect(inspectorEqual(selectInspector(a), selectInspector(b))).toBe(true);
    expect(inspectorEqual(selectInspector(a), selectInspector(c))).toBe(false);
    expect(inspectorEqual(null, null)).toBe(true);
    expect(inspectorEqual(selectInspector(a), null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/designStore.test.ts`
Expected: FAIL — cannot resolve `./designStore`.

- [ ] **Step 3: Write the implementation**

Create `src/design/designStore.ts`:

```ts
/** External store fed by Excalidraw's onChange. Panels subscribe to derived
 *  slices (via useDesignSelector) so a 60fps drag re-renders only components
 *  whose slice actually changed. Pure — no React/Excalidraw imports. */
import { isHidden, type El } from "./commitCore";
import { labelForElement } from "./designUtils";

export type StoreElement = El & {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
};

export type DesignSnapshot = {
  elements: readonly StoreElement[];
  selectedIds: Readonly<Record<string, boolean>>;
  zoom: number;
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  activeType: string;
};

export const EMPTY_SNAPSHOT: DesignSnapshot = {
  elements: [], selectedIds: {}, zoom: 1,
  scrollX: 0, scrollY: 0, width: 0, height: 0, activeType: "selection",
};

export type DesignStore = {
  get(): DesignSnapshot;
  set(next: DesignSnapshot): void;
  subscribe(fn: () => void): () => void;
};

export function createDesignStore(): DesignStore {
  let snap = EMPTY_SNAPSHOT;
  const subs = new Set<() => void>();
  return {
    get: () => snap,
    set(next) {
      snap = next;
      subs.forEach((f) => f());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
  };
}

/* ── selectors ── */

export type LayerRow = {
  id: string; type: string; label: string;
  hidden: boolean; locked: boolean; selected: boolean;
};

export function selectLayers(s: DesignSnapshot): LayerRow[] {
  const rows: LayerRow[] = [];
  for (let i = s.elements.length - 1; i >= 0; i--) {
    const el = s.elements[i];
    if (el.isDeleted === true) continue;
    rows.push({
      id: el.id,
      type: el.type,
      label: labelForElement(el as { type: string; text?: string }),
      hidden: isHidden(el),
      locked: el.locked === true,
      selected: s.selectedIds[el.id] === true,
    });
  }
  return rows;
}

export function layersEqual(a: LayerRow[], b: LayerRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.id !== y.id || x.type !== y.type || x.label !== y.label ||
        x.hidden !== y.hidden || x.locked !== y.locked || x.selected !== y.selected) return false;
  }
  return true;
}

export type InspectorSel = {
  id: string; type: string;
  x: number; y: number; width: number; height: number; angleDeg: number;
  opacity: number; strokeColor: string; backgroundColor: string; strokeWidth: number;
  fontSize: number | null;
  hidden: boolean;
};

export function selectInspector(s: DesignSnapshot): InspectorSel | null {
  const el = s.elements.find((e) => s.selectedIds[e.id] && e.isDeleted !== true);
  if (!el) return null;
  return {
    id: el.id,
    type: el.type,
    x: Math.round(el.x),
    y: Math.round(el.y),
    width: Math.round(el.width),
    height: Math.round(el.height),
    angleDeg: Math.round((el.angle * 180) / Math.PI),
    opacity: el.opacity,
    strokeColor: el.strokeColor,
    backgroundColor: el.backgroundColor,
    strokeWidth: el.strokeWidth,
    fontSize: el.type === "text" && typeof el.fontSize === "number" ? el.fontSize : null,
    hidden: isHidden(el),
  };
}

export function inspectorEqual(a: InspectorSel | null, b: InspectorSel | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.id === b.id && a.type === b.type &&
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height &&
    a.angleDeg === b.angleDeg && a.opacity === b.opacity &&
    a.strokeColor === b.strokeColor && a.backgroundColor === b.backgroundColor &&
    a.strokeWidth === b.strokeWidth && a.fontSize === b.fontSize && a.hidden === b.hidden;
}

export const selectZoom = (s: DesignSnapshot): number => s.zoom;
export const selectActiveType = (s: DesignSnapshot): string => s.activeType;
```

Create `src/design/useDesignSelector.ts`:

```ts
import { useRef, useSyncExternalStore } from "react";
import type { DesignSnapshot, DesignStore } from "./designStore";

/** Subscribe to a derived slice of the design store. `isEqual` keeps the
 *  snapshot referentially stable so React skips re-renders for unchanged
 *  slices. Pass module-level selector/equality fns (stable identities). */
export function useDesignSelector<T>(
  store: DesignStore,
  selector: (s: DesignSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const cache = useRef<{ has: boolean; value: T }>({ has: false, value: undefined as T });
  const getSnapshot = () => {
    const next = selector(store.get());
    if (cache.current.has && isEqual(cache.current.value, next)) return cache.current.value;
    cache.current = { has: true, value: next };
    return next;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/designStore.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/design/designStore.ts src/design/designStore.test.ts src/design/useDesignSelector.ts
git commit -m "feat(design): external design store with memoized panel selectors

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: `zoom.ts` — anchored zoom math

**Files:**
- Create: `src/design/zoom.ts`
- Create: `src/design/zoom.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MIN_ZOOM = 0.1`, `MAX_ZOOM = 8`, `clampZoom(z: number): number`, `stepZoom(current: number, dir: 1 | -1): number`, `type Viewport = { zoom: number; scrollX: number; scrollY: number; width: number; height: number }`, `anchoredZoom(view: Viewport, nextZoom: number, anchor?: { x: number; y: number }): { zoom: number; scrollX: number; scrollY: number }`. Used by Task 6.

Excalidraw's coordinate model: viewport point `v` maps to scene point `v / zoom - scroll`. Anchored zoom keeps the scene point under the anchor (default: viewport center) fixed: `scroll2 = scroll1 + v / z2 - v / z1`.

- [ ] **Step 1: Write the failing test**

Create `src/design/zoom.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { anchoredZoom, clampZoom, stepZoom, MIN_ZOOM, MAX_ZOOM, type Viewport } from "./zoom";

const view: Viewport = { zoom: 1, scrollX: -200, scrollY: 50, width: 1200, height: 800 };

/** Scene point under a viewport point, per Excalidraw's model. */
const scenePoint = (v: { zoom: number; scrollX: number; scrollY: number }, x: number, y: number) =>
  ({ x: x / v.zoom - v.scrollX, y: y / v.zoom - v.scrollY });

describe("clampZoom / stepZoom", () => {
  it("clamps to [MIN_ZOOM, MAX_ZOOM]", () => {
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });
  it("steps multiplicatively and round-trips", () => {
    const up = stepZoom(1, 1);
    expect(up).toBeGreaterThan(1);
    expect(stepZoom(up, -1)).toBeCloseTo(1);
  });
  it("stepZoom saturates at the bounds", () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });
});

describe("anchoredZoom", () => {
  it("keeps the scene point under the viewport center fixed", () => {
    const next = anchoredZoom(view, 2);
    const cx = view.width / 2, cy = view.height / 2;
    expect(scenePoint(next, cx, cy).x).toBeCloseTo(scenePoint(view, cx, cy).x);
    expect(scenePoint(next, cx, cy).y).toBeCloseTo(scenePoint(view, cx, cy).y);
    expect(next.zoom).toBe(2);
  });
  it("keeps an explicit anchor fixed (cursor zoom)", () => {
    const anchor = { x: 100, y: 700 };
    const next = anchoredZoom(view, 0.5, anchor);
    expect(scenePoint(next, anchor.x, anchor.y).x).toBeCloseTo(scenePoint(view, anchor.x, anchor.y).x);
    expect(scenePoint(next, anchor.x, anchor.y).y).toBeCloseTo(scenePoint(view, anchor.x, anchor.y).y);
  });
  it("clamps the requested zoom", () => {
    expect(anchoredZoom(view, 100).zoom).toBe(MAX_ZOOM);
  });
  it("is identity when zoom is unchanged", () => {
    const next = anchoredZoom(view, 1);
    expect(next.scrollX).toBeCloseTo(view.scrollX);
    expect(next.scrollY).toBeCloseTo(view.scrollY);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/zoom.test.ts`
Expected: FAIL — cannot resolve `./zoom`.

- [ ] **Step 3: Write the implementation**

Create `src/design/zoom.ts`:

```ts
/** Anchored-zoom math. Pure — viewport in, viewport out. */

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
const STEP = 1.2;

export type Viewport = {
  zoom: number;
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
};

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function stepZoom(current: number, dir: 1 | -1): number {
  return clampZoom(dir === 1 ? current * STEP : current / STEP);
}

/** New zoom + scroll that keep the scene point under `anchor` (viewport px,
 *  default center) stationary: scene = v/zoom - scroll. */
export function anchoredZoom(
  view: Viewport,
  nextZoom: number,
  anchor?: { x: number; y: number },
): { zoom: number; scrollX: number; scrollY: number } {
  const z2 = clampZoom(nextZoom);
  const ax = anchor?.x ?? view.width / 2;
  const ay = anchor?.y ?? view.height / 2;
  return {
    zoom: z2,
    scrollX: view.scrollX + ax / z2 - ax / view.zoom,
    scrollY: view.scrollY + ay / z2 - ay / view.zoom,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/zoom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/design/zoom.ts src/design/zoom.test.ts
git commit -m "feat(design): anchored zoom math (center/cursor-stable)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 4: `saver.ts` — debounced saver with flush and retry

**Files:**
- Create: `src/design/saver.ts`
- Create: `src/design/saver.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Saver = { schedule(getText: () => string): void; flush(): Promise<void>; isDirty(): boolean }`, `makeSaver(write: (text: string) => Promise<void>, delayMs?: number): Saver`. Used by Task 5.
- Semantics: `getText` is called lazily at fire time (no per-frame serialization). A throwing `write` keeps the payload dirty for retry on the next schedule/flush; a newer `schedule` supersedes a failed payload. Writes never overlap (chained).

- [ ] **Step 1: Write the failing test**

Create `src/design/saver.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSaver } from "./saver";

describe("makeSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("writes the latest text once after the debounce delay", async () => {
    const writes: string[] = [];
    const saver = makeSaver(async (t) => { writes.push(t); }, 300);
    saver.schedule(() => "v1");
    saver.schedule(() => "v2");
    expect(writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(writes).toEqual(["v2"]);
    expect(saver.isDirty()).toBe(false);
  });

  it("calls getText lazily, only at fire time", async () => {
    let calls = 0;
    const saver = makeSaver(async () => {}, 300);
    saver.schedule(() => { calls++; return "x"; });
    expect(calls).toBe(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(calls).toBe(1);
  });

  it("flush writes immediately and cancels the pending timer", async () => {
    const writes: string[] = [];
    const saver = makeSaver(async (t) => { writes.push(t); }, 300);
    saver.schedule(() => "now");
    await saver.flush();
    expect(writes).toEqual(["now"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toEqual(["now"]); // no double write
  });

  it("flush is a no-op when clean", async () => {
    const writes: string[] = [];
    const saver = makeSaver(async (t) => { writes.push(t); }, 300);
    await saver.flush();
    expect(writes).toEqual([]);
  });

  it("a failed write stays dirty and is retried by the next flush", async () => {
    let fail = true;
    const writes: string[] = [];
    const saver = makeSaver(async (t) => {
      if (fail) throw new Error("disk full");
      writes.push(t);
    }, 300);
    saver.schedule(() => "v1");
    await vi.advanceTimersByTimeAsync(300);
    expect(saver.isDirty()).toBe(true);
    fail = false;
    await saver.flush();
    expect(writes).toEqual(["v1"]);
    expect(saver.isDirty()).toBe(false);
  });

  it("a newer schedule supersedes a failed payload", async () => {
    let fail = true;
    const writes: string[] = [];
    const saver = makeSaver(async (t) => {
      if (fail) throw new Error("nope");
      writes.push(t);
    }, 300);
    saver.schedule(() => "old");
    await vi.advanceTimersByTimeAsync(300);
    fail = false;
    saver.schedule(() => "new");
    await vi.advanceTimersByTimeAsync(300);
    expect(writes).toEqual(["new"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/saver.test.ts`
Expected: FAIL — cannot resolve `./saver`.

- [ ] **Step 3: Write the implementation**

Create `src/design/saver.ts`:

```ts
/** Debounced writer with explicit flush. The write fn owns hashing/conflict
 *  checks and the disk write; a throwing write keeps the payload dirty so a
 *  later schedule/flush retries. Pure timers — no framework imports. */

export type Saver = {
  schedule(getText: () => string): void;
  flush(): Promise<void>;
  isDirty(): boolean;
};

export function makeSaver(write: (text: string) => Promise<void>, delayMs = 300): Saver {
  let getPending: (() => string) | null = null;
  let failedText: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();

  function clearTimer() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  }

  function fire(): Promise<void> {
    clearTimer();
    const get = getPending;
    getPending = null;
    const text = get ? get() : failedText;
    if (text === null) return chain;
    failedText = null;
    chain = chain.then(async () => {
      try {
        await write(text);
      } catch {
        // keep dirty unless something newer arrived meanwhile
        if (getPending === null) failedText = text;
      }
    });
    return chain;
  }

  return {
    schedule(getText) {
      getPending = getText;
      clearTimer();
      timer = setTimeout(() => void fire(), delayMs);
    },
    flush: () => fire(),
    isDirty: () => getPending !== null || failedText !== null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/saver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/design/saver.ts src/design/saver.test.ts
git commit -m "feat(design): debounced saver with flush and dirty-retry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 5: `commit.ts` wrapper + `DesignZoomIsland.tsx`

**Files:**
- Create: `src/design/commit.ts` (thin Excalidraw wrapper — no unit test; pure logic already tested via `commitCore`/`zoom`)
- Create: `src/design/DesignZoomIsland.tsx`
- Modify: `src/App.css` (append two rules)

**Interfaces:**
- Consumes: `applyPatches`, `El`, `Patch` from `./commitCore`; `anchoredZoom`, `stepZoom` from `./zoom`; `selectZoom`, `DesignStore` from `./designStore`; `useDesignSelector` from `./useDesignSelector`.
- Produces (used by Tasks 6, 7):
  - `commitPatches(api: ExcalidrawImperativeAPI, patches: Record<string, Patch>, capture?: "immediately" | "eventually"): void`
  - `selectOnly(api: ExcalidrawImperativeAPI, id: string): void`
  - `applyExternalScene(api: ExcalidrawImperativeAPI, elements: ExcalidrawElement[], viewBackgroundColor: string): void`
  - `setViewport(api: ExcalidrawImperativeAPI, v: { zoom: number; scrollX: number; scrollY: number }): void`
  - `<DesignZoomIsland store={...} apiRef={...} />` component

- [ ] **Step 1: Write `src/design/commit.ts`**

```ts
/** Single mutation path for all panel-originated edits: version-correct
 *  (commitCore) and captured into undo history. Viewport moves and external
 *  (agent) reloads deliberately bypass undo. */
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { applyPatches, type El, type Patch } from "./commitCore";

export function commitPatches(
  api: ExcalidrawImperativeAPI,
  patches: Record<string, Patch>,
  capture: "immediately" | "eventually" = "immediately",
): void {
  const els = api.getSceneElements() as unknown as readonly El[];
  api.updateScene({
    elements: applyPatches(els, patches) as unknown as ExcalidrawElement[],
    captureUpdate: capture === "immediately"
      ? CaptureUpdateAction.IMMEDIATELY
      : CaptureUpdateAction.EVENTUALLY,
  });
}

export function selectOnly(api: ExcalidrawImperativeAPI, id: string): void {
  api.updateScene({
    appState: { selectedElementIds: { [id]: true } as AppState["selectedElementIds"] },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  });
}

export function applyExternalScene(
  api: ExcalidrawImperativeAPI,
  elements: ExcalidrawElement[],
  viewBackgroundColor: string,
): void {
  api.updateScene({
    elements,
    appState: { viewBackgroundColor },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}

export function setViewport(
  api: ExcalidrawImperativeAPI,
  v: { zoom: number; scrollX: number; scrollY: number },
): void {
  api.updateScene({
    appState: { zoom: { value: v.zoom as NormalizedZoomValue }, scrollX: v.scrollX, scrollY: v.scrollY },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}
```

- [ ] **Step 2: Write `src/design/DesignZoomIsland.tsx`**

```tsx
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { anchoredZoom, stepZoom } from "./zoom";
import { setViewport } from "./commit";
import { selectZoom, type DesignStore } from "./designStore";
import { useDesignSelector } from "./useDesignSelector";

export function DesignZoomIsland({ store, apiRef }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const zoom = useDesignSelector(store, selectZoom);

  function applyZoom(next: number) {
    const api = apiRef.current;
    if (!api) return;
    const s = store.get();
    setViewport(api, anchoredZoom(
      { zoom: s.zoom, scrollX: s.scrollX, scrollY: s.scrollY, width: s.width, height: s.height },
      next,
    ));
  }

  function fitAll() {
    apiRef.current?.scrollToContent(undefined, {
      fitToViewport: true, viewportZoomFactor: 0.9, animate: true,
    });
  }

  function fitSelection() {
    const api = apiRef.current;
    if (!api) return;
    const sel = store.get().selectedIds;
    const els = api.getSceneElements().filter((e) => sel[e.id]);
    if (els.length) api.scrollToContent(els, {
      fitToViewport: true, viewportZoomFactor: 0.7, animate: true,
    });
  }

  return (
    <div className="design-zoom-island">
      <button className="design-zoom-btn" onClick={() => applyZoom(stepZoom(zoom, -1))} title="Zoom out">–</button>
      <button className="design-zoom-pct" onClick={() => applyZoom(1)} title="Reset to 100%">
        {Math.round(zoom * 100)}%
      </button>
      <button className="design-zoom-btn" onClick={() => applyZoom(stepZoom(zoom, 1))} title="Zoom in">+</button>
      <span className="design-tool-sep" />
      <button className="design-zoom-btn wide" onClick={fitAll} title="Zoom to fit everything">Fit</button>
      <button className="design-zoom-btn wide" onClick={fitSelection} title="Zoom to selection">Sel</button>
    </div>
  );
}
```

- [ ] **Step 3: Append to `src/App.css`** (next to the existing `.design-zoom-*` rules)

```css
.design-zoom-btn.wide { width: auto; padding: 0 8px; font-size: 10px; }
button.design-zoom-pct { background: none; border: none; color: inherit; font: inherit; cursor: pointer; }
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (The island isn't rendered yet — Task 6 mounts it. If `scrollToContent`'s option names differ under tsc, check the signature in `node_modules/@excalidraw/excalidraw/dist/types/excalidraw/components/App.d.ts` and match it — do not cast to `any`.)

Run: `npx vitest run`
Expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add src/design/commit.ts src/design/DesignZoomIsland.tsx src/App.css
git commit -m "feat(design): undo-safe commit wrapper + anchored zoom island

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 6: Wire `DesignPage` + top/left bars onto store, saver, crisp defaults

**Files:**
- Modify: `src/design/DesignPage.tsx` (full rewrite below)
- Modify: `src/design/DesignTopBar.tsx`
- Modify: `src/design/DesignLeftBar.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 2, 4, 5.
- Produces: `DesignTopBar` props become `{ store, onBack, onReference }`; `DesignLeftBar` props become `{ store, apiRef }`. `DesignRightPanel` keeps its old props via a temporary `RightPanelAdapter` (removed in Task 7).
- Behavior: `DesignPage` renders once — it holds no per-frame state; children subscribe to the store themselves. Saves flush on back-navigation, unmount, window blur, and `beforeunload`. New shapes default to crisp style. A load/parse error after the scene has loaded shows a banner without unmounting the canvas.

- [ ] **Step 1: Rewrite `src/design/DesignPage.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { Excalidraw, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { readDesignFile, writeDesignFile } from "../store/persistence";
import { resolveDesignPath, ensureDesignFile } from "./designFile";
import { serializeScene, parseScene, DEFAULT_BG, type SceneElement } from "./normalize";
import { hashText, makeEchoGuard } from "./echoGuard";
import { watchDesignFile } from "./watch";
import { referenceInActiveTerminal } from "./reference";
import { createDesignStore, type DesignStore, type StoreElement } from "./designStore";
import { useDesignSelector } from "./useDesignSelector";
import { applyExternalScene } from "./commit";
import { makeSaver, type Saver } from "./saver";
import { DesignTopBar } from "./DesignTopBar";
import { DesignLeftBar } from "./DesignLeftBar";
import { DesignRightPanel } from "./DesignRightPanel";
import { DesignZoomIsland } from "./DesignZoomIsland";

type Initial = { elements: ExcalidrawElement[]; appState: Partial<AppState> };

const toEls = (e: SceneElement[]) =>
  restoreElements(e as unknown as ExcalidrawElement[], null);

/** Temporary bridge to the pre-store DesignRightPanel props; Task 7 rewrites
 *  the panel to subscribe itself and deletes this adapter. */
function RightPanelAdapter({ store, apiRef }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const elements = useDesignSelector(store, (s) => s.elements);
  const selectedIds = useDesignSelector(store, (s) => s.selectedIds);
  return (
    <DesignRightPanel
      elements={elements as unknown as readonly ExcalidrawElement[]}
      selectedIds={selectedIds as Record<string, boolean>}
      apiRef={apiRef}
    />
  );
}

export function DesignPage({ wallId, onBack }: { wallId: string; onBack: () => void }) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const storeRef = useRef(createDesignStore());
  const pathRef = useRef<string | null>(null);
  const loadedHash = useRef<string>("");
  const echo = useRef(makeEchoGuard());
  const bgRef = useRef<string>(DEFAULT_BG);
  const saverRef = useRef<Saver | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initial, setInitial] = useState<Initial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
    bgRef.current = r.viewBackgroundColor;
    const api = apiRef.current;
    if (api) applyExternalScene(api, toEls(r.elements), r.viewBackgroundColor);
  }

  /** Saver write-through: skips no-ops, yields to newer on-disk agent edits,
   *  owns echo-guard + loaded-hash bookkeeping. Rethrows write failures so
   *  the saver keeps the payload dirty and retries. */
  async function writeThrough(text: string) {
    const path = pathRef.current;
    if (!path) return;
    if (hashText(text) === loadedHash.current) return;
    const onDisk = await readDesignFile(path).catch(() => null);
    if (onDisk !== null && hashText(onDisk) !== loadedHash.current && !echo.current.isOwnEcho(onDisk)) {
      applyExternal(onDisk);
      flash("reloaded — agent updated this UI");
      return;
    }
    echo.current.markWritten(text);
    loadedHash.current = hashText(text);
    try {
      await writeDesignFile(path, text);
      setError(null);
    } catch (e) {
      loadedHash.current = ""; // the write didn't land; don't pretend it did
      setError(String(e));
      throw e;
    }
  }

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    const saver = makeSaver(writeThrough);
    saverRef.current = saver;
    const flushNow = () => { void saver.flush(); };
    window.addEventListener("blur", flushNow);
    window.addEventListener("beforeunload", flushNow);
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
      bgRef.current = r.viewBackgroundColor;
      setInitial({
        elements: toEls(r.elements),
        appState: {
          viewBackgroundColor: r.viewBackgroundColor,
          // UI mockups, not hand sketches: crisp strokes, sharp corners, clean type
          currentItemRoughness: 0,
          currentItemRoundness: "sharp",
          currentItemFontFamily: 2,
        },
      });
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
      window.removeEventListener("blur", flushNow);
      window.removeEventListener("beforeunload", flushNow);
      void saver.flush();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [wallId]);

  function onChange(els: readonly ExcalidrawElement[], appState: AppState) {
    bgRef.current = appState.viewBackgroundColor ?? DEFAULT_BG;
    storeRef.current.set({
      elements: els as unknown as readonly StoreElement[],
      selectedIds: appState.selectedElementIds as Record<string, boolean>,
      zoom: appState.zoom.value,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      width: appState.width,
      height: appState.height,
      activeType: (appState as { activeTool?: { type?: string } }).activeTool?.type ?? "selection",
    });
    // serialization happens at debounce-fire time, not per frame
    saverRef.current?.schedule(() =>
      serializeScene(storeRef.current.get().elements as unknown as SceneElement[], bgRef.current),
    );
  }

  async function reference() {
    const path = pathRef.current;
    if (!path) return;
    const how = await referenceInActiveTerminal(path);
    flash(how === "sent" ? "added to the focused terminal" : "no terminal focused — path copied");
  }

  function handleBack() {
    void saverRef.current?.flush();
    onBack();
  }

  return (
    <div className="design-page">
      <DesignTopBar store={storeRef.current} onBack={handleBack} onReference={() => void reference()} />
      <DesignLeftBar store={storeRef.current} apiRef={apiRef} />

      <div className="design-canvas">
        {error && <div className="design-error">{error}</div>}
        {initial && (
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
        <DesignZoomIsland store={storeRef.current} apiRef={apiRef} />
        {toast && <div className="design-toast">{toast}</div>}
      </div>

      <RightPanelAdapter store={storeRef.current} apiRef={apiRef} />
    </div>
  );
}
```

Note the behavior change from the old file: `{initial && (...)}` no longer includes `!error` — a later parse error (agent writing bad JSON) shows the banner *over* the still-live canvas instead of unmounting it (spec: "a corrupt file never wipes the canvas").

- [ ] **Step 2: Rewrite `src/design/DesignTopBar.tsx`**

```tsx
import { BackIcon } from "../wall/icons";
import { selectZoom, type DesignStore } from "./designStore";
import { useDesignSelector } from "./useDesignSelector";

export function DesignTopBar({ store, onBack, onReference }: {
  store: DesignStore;
  onBack: () => void;
  onReference: () => void;
}) {
  const zoom = useDesignSelector(store, selectZoom);
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

- [ ] **Step 3: Rewrite `src/design/DesignLeftBar.tsx`**

Same JSX as today; only the `activeType` prop becomes a store subscription:

```tsx
import { Fragment } from "react";
import { TOOLS } from "../wall/tools";
import { TOOL_ICONS } from "../wall/icons";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { selectActiveType, type DesignStore } from "./designStore";
import { useDesignSelector } from "./useDesignSelector";

const GROUPS: Array<Array<typeof TOOLS[number]["type"]>> = [
  ["selection", "hand"],
  ["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw", "text", "image", "eraser"],
  ["frame"],
];

export function DesignLeftBar({ store, apiRef }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const activeType = useDesignSelector(store, selectActiveType);
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

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors. (If `currentItemRoundness: "sharp"` fails the `Partial<AppState>` check, look up `StrokeRoundness` in `node_modules/@excalidraw/excalidraw/dist/types/excalidraw/types.d.ts` and use its exact literal.)

Run: `npx vitest run`
Expected: PASS — full suite, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/design/DesignPage.tsx src/design/DesignTopBar.tsx src/design/DesignLeftBar.tsx
git commit -m "feat(design): store-driven page shell, flush-on-exit saves, crisp defaults

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 7: Rebuild `DesignRightPanel` — live inputs, commit path, correct hide

**Files:**
- Modify: `src/design/DesignRightPanel.tsx` (full rewrite below)
- Modify: `src/design/DesignPage.tsx` (delete `RightPanelAdapter`, render `<DesignRightPanel store={storeRef.current} apiRef={apiRef} />` directly; drop the now-unused `useDesignSelector` import if nothing else uses it)

**Interfaces:**
- Consumes: `selectInspector`/`inspectorEqual`/`selectLayers`/`layersEqual`/`DesignStore` from `./designStore`; `useDesignSelector`; `commitPatches`/`selectOnly` from `./commit`; `hidePatch`/`unhidePatch`/`isHidden` from `./commitCore`; `degToRad` from `./designUtils`; `TOOL_ICONS`, `SelectIcon` from `../wall/icons`.
- Produces: `DesignRightPanel` props become `{ store: DesignStore; apiRef: React.RefObject<ExcalidrawImperativeAPI | null> }`.
- Behavior: inspector values track the canvas live but never fight in-progress typing (Enter/blur commits, Escape cancels); every edit is one undo step; hide makes an element invisible *and* unclickable and restores exactly on unhide; the layers list re-renders only when rows actually change.

- [ ] **Step 1: Rewrite `src/design/DesignRightPanel.tsx`**

```tsx
import { useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { degToRad } from "./designUtils";
import { hidePatch, unhidePatch, isHidden, type Patch } from "./commitCore";
import { commitPatches, selectOnly } from "./commit";
import {
  selectInspector, inspectorEqual, selectLayers, layersEqual, type DesignStore,
} from "./designStore";
import { useDesignSelector } from "./useDesignSelector";
import { TOOL_ICONS, SelectIcon } from "../wall/icons";

function ShapeIcon({ type }: { type: string }) {
  const Icon = TOOL_ICONS[type as keyof typeof TOOL_ICONS];
  return <span className="design-layer-icon">{Icon ? <Icon /> : <SelectIcon />}</span>;
}

/** Number field that tracks live canvas values while idle but never fights
 *  in-progress typing. Enter/blur commits, Escape cancels. */
function NumInput({ label, value, onCommit, narrow }: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  narrow?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  return (
    <div className="design-prop-row">
      <span className="design-prop-label">{label}</span>
      <input
        type="number"
        className={`design-prop-input${narrow ? " narrow" : ""}`}
        value={draft ?? String(value)}
        onFocus={(e) => setDraft(e.target.value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          if (!cancelled.current) {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v !== value) onCommit(v);
          }
          cancelled.current = false;
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { cancelled.current = true; (e.target as HTMLInputElement).blur(); }
        }}
      />
    </div>
  );
}

/** Width/height patches don't rescale linear elements' points, so W/H
 *  inputs are hidden for them (canvas-resize still works). */
const NO_WH_TYPES = new Set(["line", "arrow", "freedraw"]);

export function DesignRightPanel({ store, apiRef }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const insp = useDesignSelector(store, selectInspector, inspectorEqual);
  const layers = useDesignSelector(store, selectLayers, layersEqual);
  const [opDraft, setOpDraft] = useState<number | null>(null);

  function commit(id: string, patch: Patch, capture: "immediately" | "eventually" = "immediately") {
    const api = apiRef.current;
    if (api) commitPatches(api, { [id]: patch }, capture);
  }

  function toggleHidden(id: string) {
    const api = apiRef.current;
    const el = store.get().elements.find((e) => e.id === id);
    if (!api || !el) return;
    commitPatches(api, { [id]: isHidden(el) ? unhidePatch(el) : hidePatch(el) });
  }

  return (
    <div className="design-right">
      {/* ── Properties ── */}
      <div className="design-props">
        {insp ? (
          <>
            <span className="design-section-label">Transform</span>
            <div className="design-prop-section">
              <div className="design-prop-row">
                <NumInput label="X" value={insp.x} onCommit={(v) => commit(insp.id, { x: v })} />
                <NumInput label="Y" value={insp.y} onCommit={(v) => commit(insp.id, { y: v })} />
              </div>
              {!NO_WH_TYPES.has(insp.type) && (
                <div className="design-prop-row">
                  <NumInput label="W" value={insp.width} onCommit={(v) => commit(insp.id, { width: v })} />
                  <NumInput label="H" value={insp.height} onCommit={(v) => commit(insp.id, { height: v })} />
                </div>
              )}
              <NumInput label="°" value={insp.angleDeg} onCommit={(v) => commit(insp.id, { angle: degToRad(v) })} />
            </div>

            <span className="design-section-label">Appearance</span>
            <div className="design-prop-section">
              <div className="design-prop-row">
                <span className="design-prop-label">Fi</span>
                <div className="design-color-swatch">
                  <input
                    type="color"
                    value={insp.backgroundColor === "transparent" ? "#000000" : insp.backgroundColor}
                    onChange={(e) => commit(insp.id, { backgroundColor: e.target.value }, "eventually")}
                    onBlur={(e) => commit(insp.id, { backgroundColor: e.target.value })}
                  />
                </div>
                <span className="design-prop-label">St</span>
                <div className="design-color-swatch">
                  <input
                    type="color"
                    value={insp.strokeColor}
                    onChange={(e) => commit(insp.id, { strokeColor: e.target.value }, "eventually")}
                    onBlur={(e) => commit(insp.id, { strokeColor: e.target.value })}
                  />
                </div>
                <NumInput label="" value={insp.strokeWidth} narrow onCommit={(v) => commit(insp.id, { strokeWidth: v })} />
              </div>
              <div className="design-prop-row">
                <span className="design-prop-label">Op</span>
                <input
                  type="range"
                  min={0} max={100}
                  style={{ flex: 1 }}
                  value={opDraft ?? insp.opacity}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setOpDraft(v);
                    commit(insp.id, { opacity: v }, "eventually"); // live preview, no undo spam
                  }}
                  onPointerUp={() => {
                    if (opDraft !== null) commit(insp.id, { opacity: opDraft }); // one undo step
                    setOpDraft(null);
                  }}
                />
                <span className="design-prop-opacity">{opDraft ?? insp.opacity}%</span>
              </div>
            </div>

            {insp.fontSize !== null && (
              <>
                <span className="design-section-label">Text</span>
                <div className="design-prop-section">
                  <NumInput label="Sz" value={insp.fontSize} onCommit={(v) => commit(insp.id, { fontSize: v })} />
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
          {layers.map((row) => (
            <div
              key={row.id}
              className={`design-layer-row${row.selected ? " ds-selected" : ""}`}
              onClick={() => { const api = apiRef.current; if (api) selectOnly(api, row.id); }}
            >
              <ShapeIcon type={row.type} />
              <span className="design-layer-name">{row.label}</span>
              <div className="design-layer-actions">
                <button
                  className="design-layer-btn"
                  title={row.hidden ? "Show" : "Hide"}
                  onPointerDown={(e) => { e.stopPropagation(); toggleHidden(row.id); }}
                >
                  {row.hidden ? "○" : "●"}
                </button>
                <button
                  className="design-layer-btn"
                  title={row.hidden ? "Unhide to change lock" : row.locked ? "Unlock" : "Lock"}
                  disabled={row.hidden}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!row.hidden) commit(row.id, { locked: !row.locked });
                  }}
                >
                  {row.locked ? "🔒" : "🔓"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

(The ●/○/🔒/🔓 glyphs are kept for now — replacing them with SVG icons is part of the Phase 4 polish pass.)

- [ ] **Step 2: Remove the adapter from `src/design/DesignPage.tsx`**

Delete the `RightPanelAdapter` function and replace its render usage:

```tsx
      <DesignRightPanel store={storeRef.current} apiRef={apiRef} />
```

Remove the now-unused `useDesignSelector` import (and the `ExcalidrawElement`-cast it used, if unreferenced).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: PASS — full suite (commitCore, designStore, zoom, saver, designUtils, normalize, echoGuard, designFile, plus the rest of the repo).

- [ ] **Step 4: Commit**

```bash
git add src/design/DesignRightPanel.tsx src/design/DesignPage.tsx
git commit -m "feat(design): live inspector + undo-safe layer actions on the store

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Phase 1 acceptance (from the spec)

After Task 7, all of these hold — the implementer verifies the testable ones; the visual ones are confirmed by the user after an app restart (do not restart the app yourself):

- Dragging with 200+ elements re-renders only the inspector slice, not the layers list or page shell (store selectors, Tasks 2/6/7).
- Every panel edit is undoable via Ctrl+Z and survives reconciliation (commit path, Tasks 1/5/7).
- The inspector never shows stale values after canvas drags (live NumInput, Task 7).
- Leaving the page or closing the window flushes pending saves; a hard kill loses at most 300ms (saver + flush, Tasks 4/6).
- Zoom stays centered on the viewport; 100%/fit/fit-selection available (Tasks 3/5).
- New shapes are crisp by default (Task 6).
- Hidden layers are invisible, unclickable, and restore exactly (Tasks 1/7).
- Old design files load unchanged; agents keep working with the same format (no normalize changes).
