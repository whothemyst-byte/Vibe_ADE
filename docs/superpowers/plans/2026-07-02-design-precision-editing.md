# Design Page Precision Editing (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Figma-grade precision editing on the UI Design page: multi-select inspector with Mixed values, align/distribute, snapping on by default, group/ungroup + z-order controls, and zoom shortcuts with a cheatsheet overlay.

**Architecture:** All geometry/grouping/ordering logic lives in pure modules (`align.ts`, `groups.ts`, `zorder.ts`) tested in node; the UI applies their outputs through the Phase 1 commit path (`commitPatches`, one commit = one undo step). The inspector switches from a single-element selector to a multi-select selector (`selectSelection`) with `"mixed"` sentinels.

**Tech Stack:** React 19, `@excalidraw/excalidraw` 0.18.x, vitest (node env), TypeScript. Phase 1 modules: `commitCore.ts`, `designStore.ts`, `useDesignSelector.ts`, `zoom.ts`, `commit.ts`.

**Spec:** `docs/superpowers/specs/2026-07-02-design-page-figma-overhaul-design.md` (Phase 2 section).

## Global Constraints

- Repo root for all paths/commands: `vibe-space/`.
- `.vibe-design.json` stays **version 1, backward compatible**; new metadata only in `customData`. (Phase 2 adds none — `groupIds` is a native Excalidraw field already serialized.)
- vitest is **node env**, `src/**/*.test.ts` only — tested logic goes in pure `.ts` modules with **no `@excalidraw/excalidraw` or React imports** (structural types). Thin wrappers/components hold framework imports.
- Do NOT launch or restart the app (Claude runs inside it). Verification = `npx vitest run` + `npx tsc --noEmit`; visual checks deferred to the user.
- Every multi-element operation is **one `commitPatches` call = one undo step**.
- Excalidraw group convention: element `groupIds` is ordered innermost → outermost (last entry = outermost group).
- Match existing style: 2-space indent, double quotes, co-located `*.test.ts`.
- Commit after each task with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `align.ts` — rotated bboxes, group units, align/distribute patches

**Files:**
- Create: `src/design/align.ts`
- Create: `src/design/align.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces (used by Task 5):
  - `type AlignEl = { id: string; x: number; y: number; width: number; height: number; angle?: number; groupIds?: readonly string[] } & Record<string, unknown>`
  - `type Box = { minX: number; minY: number; maxX: number; maxY: number }`
  - `bboxOf(el: AlignEl): Box` — axis-aligned box of the (possibly rotated) element
  - `type AlignMode = "left" | "center-h" | "right" | "top" | "center-v" | "bottom"`
  - `alignPatches(els: readonly AlignEl[], selectedIds: Readonly<Record<string, boolean>>, mode: AlignMode): Record<string, { x?: number; y?: number }>`
  - `type DistributeAxis = "horizontal" | "vertical"`
  - `distributePatches(els: readonly AlignEl[], selectedIds: Readonly<Record<string, boolean>>, axis: DistributeAxis): Record<string, { x?: number; y?: number }>`
- Semantics: elements sharing an outermost group form one **unit** that moves as a whole. Align needs ≥2 units (else `{}`), distribute needs ≥3 (else `{}`). Distribute equalizes the gaps between unit boxes, keeping the first and last units fixed. Patches contain absolute `x`/`y` per element; unmoved elements are omitted.

- [ ] **Step 1: Write the failing test**

Create `src/design/align.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { alignPatches, bboxOf, distributePatches, type AlignEl } from "./align";

const el = (over: Partial<AlignEl> = {}): AlignEl => ({
  id: "a", x: 0, y: 0, width: 10, height: 10, ...over,
});

const all = (ids: string[]) => Object.fromEntries(ids.map((i) => [i, true]));

describe("bboxOf", () => {
  it("is the plain rect when unrotated", () => {
    expect(bboxOf(el({ x: 5, y: 6, width: 10, height: 20 })))
      .toEqual({ minX: 5, minY: 6, maxX: 15, maxY: 26 });
  });
  it("accounts for rotation around the element center", () => {
    // 100x50 rotated 90deg around center (50,25) -> 50x100 box
    const b = bboxOf(el({ x: 0, y: 0, width: 100, height: 50, angle: Math.PI / 2 }));
    expect(b.minX).toBeCloseTo(25);
    expect(b.maxX).toBeCloseTo(75);
    expect(b.minY).toBeCloseTo(-25);
    expect(b.maxY).toBeCloseTo(75);
  });
});

describe("alignPatches", () => {
  it("aligns lefts to the selection's leftmost edge", () => {
    const els = [el({ id: "a", x: 0 }), el({ id: "b", x: 200 })];
    const p = alignPatches(els, all(["a", "b"]), "left");
    expect(p.b).toEqual({ x: 0 });
    expect(p.a).toBeUndefined(); // already there -> no patch
  });
  it("aligns horizontal centers", () => {
    const els = [el({ id: "a", x: 0, width: 10 }), el({ id: "b", x: 90, width: 30 })];
    // combined box 0..120, center 60; a center 5 -> dx 55; b center 105 -> dx -45
    const p = alignPatches(els, all(["a", "b"]), "center-h");
    expect(p.a).toEqual({ x: 55 });
    expect(p.b).toEqual({ x: 45 });
  });
  it("aligns bottoms on the vertical axis", () => {
    const els = [el({ id: "a", y: 0, height: 10 }), el({ id: "b", y: 50, height: 30 })];
    const p = alignPatches(els, all(["a", "b"]), "bottom");
    expect(p.a).toEqual({ y: 70 }); // bottom target 80, a height 10
    expect(p.b).toBeUndefined();
  });
  it("moves grouped elements as one unit", () => {
    const els = [
      el({ id: "a", x: 0, groupIds: ["g1"] }),
      el({ id: "b", x: 20, groupIds: ["g1"] }),
      el({ id: "c", x: 100 }),
    ];
    const p = alignPatches(els, all(["a", "b", "c"]), "left");
    // unit(a,b) box 0..30 is leftmost -> only c moves
    expect(p.c).toEqual({ x: 0 });
    expect(p.a).toBeUndefined();
    expect(p.b).toBeUndefined();
  });
  it("returns {} for fewer than 2 units", () => {
    const els = [el({ id: "a", groupIds: ["g1"] }), el({ id: "b", x: 20, groupIds: ["g1"] })];
    expect(alignPatches(els, all(["a", "b"]), "left")).toEqual({});
  });
  it("ignores unselected elements", () => {
    const els = [el({ id: "a", x: 0 }), el({ id: "b", x: 200 }), el({ id: "z", x: -999 })];
    const p = alignPatches(els, all(["a", "b"]), "left");
    expect(p.b).toEqual({ x: 0 }); // z's position is irrelevant
  });
});

describe("distributePatches", () => {
  it("equalizes horizontal gaps, keeping first and last fixed", () => {
    const els = [
      el({ id: "a", x: 0, width: 10 }),
      el({ id: "b", x: 30, width: 10 }),
      el({ id: "c", x: 100, width: 10 }),
    ];
    // span 0..110, widths 30, gaps (110-30)/2 = 40 -> b at 50
    const p = distributePatches(els, all(["a", "b", "c"]), "horizontal");
    expect(p.b).toEqual({ x: 50 });
    expect(p.a).toBeUndefined();
    expect(p.c).toBeUndefined();
  });
  it("distributes vertically", () => {
    const els = [
      el({ id: "a", y: 0, height: 10 }),
      el({ id: "b", y: 12, height: 10 }),
      el({ id: "c", y: 90, height: 10 }),
    ];
    // span 0..100, heights 30, gap 35 -> b at 45
    const p = distributePatches(els, all(["a", "b", "c"]), "vertical");
    expect(p.b).toEqual({ y: 45 });
  });
  it("returns {} for fewer than 3 units", () => {
    const els = [el({ id: "a" }), el({ id: "b", x: 50 })];
    expect(distributePatches(els, all(["a", "b"]), "horizontal")).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/align.test.ts`
Expected: FAIL — cannot resolve `./align`.

- [ ] **Step 3: Write the implementation**

Create `src/design/align.ts`:

```ts
/** Align / distribute geometry. Pure — no framework imports. Elements
 *  sharing an outermost group form one unit that moves as a whole. */

export type AlignEl = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  groupIds?: readonly string[];
} & Record<string, unknown>;

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** Axis-aligned bounding box, accounting for rotation about the center. */
export function bboxOf(el: AlignEl): Box {
  const a = el.angle ?? 0;
  if (a === 0) {
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  }
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const cos = Math.cos(a), sin = Math.sin(a);
  const hw = el.width / 2, hh = el.height / 2;
  const ex = Math.abs(hw * cos) + Math.abs(hh * sin);
  const ey = Math.abs(hw * sin) + Math.abs(hh * cos);
  return { minX: cx - ex, minY: cy - ey, maxX: cx + ex, maxY: cy + ey };
}

type Unit = { ids: string[]; box: Box };

const mergeBox = (a: Box, b: Box): Box => ({
  minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
});

function buildUnits(
  els: readonly AlignEl[],
  selectedIds: Readonly<Record<string, boolean>>,
): Unit[] {
  const byGroup = new Map<string, Unit>();
  const units: Unit[] = [];
  for (const el of els) {
    if (!selectedIds[el.id]) continue;
    const outer = el.groupIds?.length ? el.groupIds[el.groupIds.length - 1] : null;
    const box = bboxOf(el);
    if (outer === null) {
      units.push({ ids: [el.id], box });
    } else {
      const u = byGroup.get(outer);
      if (u) { u.ids.push(el.id); u.box = mergeBox(u.box, box); }
      else { const nu = { ids: [el.id], box }; byGroup.set(outer, nu); units.push(nu); }
    }
  }
  return units;
}

export type AlignMode = "left" | "center-h" | "right" | "top" | "center-v" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";
type Delta = { dx: number; dy: number };
type Patches = Record<string, { x?: number; y?: number }>;

function deltasToPatches(els: readonly AlignEl[], deltas: Map<Unit, Delta>): Patches {
  const byId = new Map<string, Delta>();
  for (const [unit, d] of deltas) {
    if (Math.abs(d.dx) < 1e-9 && Math.abs(d.dy) < 1e-9) continue;
    for (const id of unit.ids) byId.set(id, d);
  }
  const out: Patches = {};
  for (const el of els) {
    const d = byId.get(el.id);
    if (!d) continue;
    out[el.id] = {};
    if (Math.abs(d.dx) > 1e-9) out[el.id].x = el.x + d.dx;
    if (Math.abs(d.dy) > 1e-9) out[el.id].y = el.y + d.dy;
  }
  return out;
}

export function alignPatches(
  els: readonly AlignEl[],
  selectedIds: Readonly<Record<string, boolean>>,
  mode: AlignMode,
): Patches {
  const units = buildUnits(els, selectedIds);
  if (units.length < 2) return {};
  const combined = units.map((u) => u.box).reduce(mergeBox);
  const deltas = new Map<Unit, Delta>();
  for (const u of units) {
    let dx = 0, dy = 0;
    switch (mode) {
      case "left": dx = combined.minX - u.box.minX; break;
      case "right": dx = combined.maxX - u.box.maxX; break;
      case "center-h":
        dx = (combined.minX + combined.maxX) / 2 - (u.box.minX + u.box.maxX) / 2; break;
      case "top": dy = combined.minY - u.box.minY; break;
      case "bottom": dy = combined.maxY - u.box.maxY; break;
      case "center-v":
        dy = (combined.minY + combined.maxY) / 2 - (u.box.minY + u.box.maxY) / 2; break;
    }
    deltas.set(u, { dx, dy });
  }
  return deltasToPatches(els, deltas);
}

export function distributePatches(
  els: readonly AlignEl[],
  selectedIds: Readonly<Record<string, boolean>>,
  axis: DistributeAxis,
): Patches {
  const units = buildUnits(els, selectedIds);
  if (units.length < 3) return {};
  const lo = (b: Box) => (axis === "horizontal" ? b.minX : b.minY);
  const hi = (b: Box) => (axis === "horizontal" ? b.maxX : b.maxY);
  const sorted = [...units].sort((a, b) => lo(a.box) - lo(b.box));
  const span = hi(sorted[sorted.length - 1].box) - lo(sorted[0].box);
  const sizes = sorted.reduce((s, u) => s + (hi(u.box) - lo(u.box)), 0);
  const gap = (span - sizes) / (sorted.length - 1);
  const deltas = new Map<Unit, Delta>();
  let cursor = hi(sorted[0].box) + gap;
  for (let i = 1; i < sorted.length - 1; i++) {
    const u = sorted[i];
    const d = cursor - lo(u.box);
    deltas.set(u, axis === "horizontal" ? { dx: d, dy: 0 } : { dx: 0, dy: d });
    cursor += (hi(u.box) - lo(u.box)) + gap;
  }
  return deltasToPatches(els, deltas);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/align.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/design/align.ts src/design/align.test.ts
git commit -m "feat(design): align/distribute geometry with group units + rotated bboxes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: `groups.ts` — group/ungroup patches

**Files:**
- Create: `src/design/groups.ts`
- Create: `src/design/groups.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces (used by Tasks 4, 5):
  - `type GroupEl = { id: string; groupIds?: readonly string[] } & Record<string, unknown>`
  - `newGroupId(): string`
  - `groupPatches(els, selectedIds, gid?): { patches: Record<string, { groupIds: string[] }>; groupId: string } | null` — null when <2 selected
  - `sharedOuterGroup(els, selectedIds): string | null` — the one group id ALL selected elements have as their outermost, else null
  - `ungroupPatches(els, selectedIds): Record<string, { groupIds: string[] }> | null` — removes the shared outermost id; null when there is none

- [ ] **Step 1: Write the failing test**

Create `src/design/groups.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupPatches, sharedOuterGroup, ungroupPatches, type GroupEl } from "./groups";

const all = (ids: string[]) => Object.fromEntries(ids.map((i) => [i, true]));
const el = (id: string, groupIds?: string[]): GroupEl => ({ id, groupIds });

describe("groupPatches", () => {
  it("appends a shared outermost group id to every selected element", () => {
    const r = groupPatches([el("a"), el("b"), el("z")], all(["a", "b"]), "G");
    expect(r).not.toBeNull();
    expect(r!.groupId).toBe("G");
    expect(r!.patches.a).toEqual({ groupIds: ["G"] });
    expect(r!.patches.b).toEqual({ groupIds: ["G"] });
    expect(r!.patches.z).toBeUndefined();
  });
  it("nests existing groups (old ids kept innermost, new id outermost)", () => {
    const r = groupPatches([el("a", ["g1"]), el("b", ["g2"])], all(["a", "b"]), "G");
    expect(r!.patches.a).toEqual({ groupIds: ["g1", "G"] });
    expect(r!.patches.b).toEqual({ groupIds: ["g2", "G"] });
  });
  it("returns null for fewer than 2 selected", () => {
    expect(groupPatches([el("a")], all(["a"]))).toBeNull();
  });
  it("generates a group id when none is given", () => {
    const r = groupPatches([el("a"), el("b")], all(["a", "b"]));
    expect(r!.groupId.length).toBeGreaterThan(4);
  });
});

describe("sharedOuterGroup", () => {
  it("finds the common outermost group", () => {
    const els = [el("a", ["x", "G"]), el("b", ["G"])];
    expect(sharedOuterGroup(els, all(["a", "b"]))).toBe("G");
  });
  it("is null when any selected element is ungrouped or differs", () => {
    expect(sharedOuterGroup([el("a", ["G"]), el("b")], all(["a", "b"]))).toBeNull();
    expect(sharedOuterGroup([el("a", ["G"]), el("b", ["H"])], all(["a", "b"]))).toBeNull();
    expect(sharedOuterGroup([el("a", ["G"])], {})).toBeNull();
  });
});

describe("ungroupPatches", () => {
  it("removes only the shared outermost id", () => {
    const els = [el("a", ["inner", "G"]), el("b", ["G"])];
    const p = ungroupPatches(els, all(["a", "b"]));
    expect(p!.a).toEqual({ groupIds: ["inner"] });
    expect(p!.b).toEqual({ groupIds: [] });
  });
  it("is null when there is no shared group", () => {
    expect(ungroupPatches([el("a"), el("b")], all(["a", "b"]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/groups.test.ts`
Expected: FAIL — cannot resolve `./groups`.

- [ ] **Step 3: Write the implementation**

Create `src/design/groups.ts`:

```ts
/** Group/ungroup as element patches. Pure — no framework imports.
 *  Excalidraw convention: groupIds is ordered innermost -> outermost. */

export type GroupEl = { id: string; groupIds?: readonly string[] } & Record<string, unknown>;

export function newGroupId(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function groupPatches(
  els: readonly GroupEl[],
  selectedIds: Readonly<Record<string, boolean>>,
  gid: string = newGroupId(),
): { patches: Record<string, { groupIds: string[] }>; groupId: string } | null {
  const selected = els.filter((e) => selectedIds[e.id]);
  if (selected.length < 2) return null;
  const patches: Record<string, { groupIds: string[] }> = {};
  for (const e of selected) {
    patches[e.id] = { groupIds: [...(e.groupIds ?? []), gid] };
  }
  return { patches, groupId: gid };
}

export function sharedOuterGroup(
  els: readonly GroupEl[],
  selectedIds: Readonly<Record<string, boolean>>,
): string | null {
  const selected = els.filter((e) => selectedIds[e.id]);
  if (selected.length === 0) return null;
  let shared: string | null = null;
  for (const e of selected) {
    const outer = e.groupIds?.length ? e.groupIds[e.groupIds.length - 1] : null;
    if (outer === null) return null;
    if (shared === null) shared = outer;
    else if (shared !== outer) return null;
  }
  return shared;
}

export function ungroupPatches(
  els: readonly GroupEl[],
  selectedIds: Readonly<Record<string, boolean>>,
): Record<string, { groupIds: string[] }> | null {
  const gid = sharedOuterGroup(els, selectedIds);
  if (gid === null) return null;
  const patches: Record<string, { groupIds: string[] }> = {};
  for (const e of els) {
    if (!selectedIds[e.id]) continue;
    patches[e.id] = { groupIds: (e.groupIds ?? []).filter((g) => g !== gid) };
  }
  return patches;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/groups.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/design/groups.ts src/design/groups.test.ts
git commit -m "feat(design): group/ungroup element patches

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: `zorder.ts` — z-order reordering

**Files:**
- Create: `src/design/zorder.ts`
- Create: `src/design/zorder.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces (used by Task 5):
  - `type ZOp = "front" | "back" | "forward" | "backward"`
  - `reorderElements<T extends { id: string }>(els: readonly T[], selectedIds: Readonly<Record<string, boolean>>, op: ZOp): T[] | null` — new array with selected elements moved (relative order preserved); `null` when nothing changes.

Scene array order is the z-order: index 0 = bottom, last = top.

- [ ] **Step 1: Write the failing test**

Create `src/design/zorder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { reorderElements } from "./zorder";

const els = ["a", "b", "c", "d"].map((id) => ({ id }));
const ids = (r: { id: string }[] | null) => r?.map((e) => e.id) ?? null;
const sel = (...s: string[]) => Object.fromEntries(s.map((i) => [i, true]));

describe("reorderElements", () => {
  it("front: moves selection to the end, preserving relative order", () => {
    expect(ids(reorderElements(els, sel("a", "c"), "front"))).toEqual(["b", "d", "a", "c"]);
  });
  it("back: moves selection to the start", () => {
    expect(ids(reorderElements(els, sel("b", "d"), "back"))).toEqual(["b", "d", "a", "c"]);
  });
  it("forward: swaps each selected element with its next unselected neighbor", () => {
    expect(ids(reorderElements(els, sel("a"), "forward"))).toEqual(["b", "a", "c", "d"]);
  });
  it("forward: a selected block moves as one", () => {
    expect(ids(reorderElements(els, sel("a", "b"), "forward"))).toEqual(["c", "a", "b", "d"]);
  });
  it("backward: swaps toward the start", () => {
    expect(ids(reorderElements(els, sel("c"), "backward"))).toEqual(["a", "c", "b", "d"]);
  });
  it("returns null when nothing changes (already at boundary)", () => {
    expect(reorderElements(els, sel("d"), "front")).toBeNull();
    expect(reorderElements(els, sel("a"), "backward")).toBeNull();
    expect(reorderElements(els, {}, "front")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/zorder.test.ts`
Expected: FAIL — cannot resolve `./zorder`.

- [ ] **Step 3: Write the implementation**

Create `src/design/zorder.ts`:

```ts
/** Z-order moves over the scene array (index 0 = bottom). Pure. */

export type ZOp = "front" | "back" | "forward" | "backward";

export function reorderElements<T extends { id: string }>(
  els: readonly T[],
  selectedIds: Readonly<Record<string, boolean>>,
  op: ZOp,
): T[] | null {
  const isSel = (e: T) => selectedIds[e.id] === true;
  let next: T[];
  if (op === "front") {
    next = [...els.filter((e) => !isSel(e)), ...els.filter(isSel)];
  } else if (op === "back") {
    next = [...els.filter(isSel), ...els.filter((e) => !isSel(e))];
  } else {
    next = [...els];
    if (op === "forward") {
      for (let i = next.length - 2; i >= 0; i--) {
        if (isSel(next[i]) && !isSel(next[i + 1])) {
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
        }
      }
    } else {
      for (let i = 1; i < next.length; i++) {
        if (isSel(next[i]) && !isSel(next[i - 1])) {
          [next[i], next[i - 1]] = [next[i - 1], next[i]];
        }
      }
    }
  }
  const changed = next.some((e, i) => e !== els[i]);
  return changed ? next : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/zorder.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/design/zorder.ts src/design/zorder.test.ts
git commit -m "feat(design): z-order reordering (front/back/forward/backward)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: `zorder.ts` — z-order reordering

(placeholder — task body below)

### Task 4: `designStore.ts` — multi-select selector + snap state

**Files:**
- Modify: `src/design/designStore.ts`
- Modify: `src/design/designStore.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `sharedOuterGroup` from `./groups` (Task 2); existing `isHidden` import stays.
- Produces (used by Tasks 5, 6, 7):
  - `type MultiValue<T> = T | "mixed"`
  - `type SelectionSel = { ids: string[]; count: number; type: MultiValue<string>; x: MultiValue<number>; y: MultiValue<number>; width: MultiValue<number>; height: MultiValue<number>; angleDeg: MultiValue<number>; opacity: MultiValue<number>; strokeColor: MultiValue<string>; backgroundColor: MultiValue<string>; strokeWidth: MultiValue<number>; fontSize: MultiValue<number> | null; hasLinear: boolean; sharedGroup: string | null }`
  - `selectSelection(s: DesignSnapshot): SelectionSel | null` — null when nothing selected; numeric position/size values rounded like the single-element selector; `fontSize` is null when no text element is selected, `"mixed"` when text sizes differ
  - `selectionEqual(a: SelectionSel | null, b: SelectionSel | null): boolean`
  - `LINEAR_TYPES: ReadonlySet<string>` = `{"line", "arrow", "freedraw"}`; `hasLinear` is true when any selected element's type is in it
  - `DesignSnapshot` gains `snapOn: boolean` (EMPTY_SNAPSHOT: `true`); `selectSnapOn(s): boolean`
- Existing `selectInspector`/`inspectorEqual` stay for now (still used by `DesignRightPanel`); Task 6 deletes them.

- [ ] **Step 1: Write the failing test**

Append to `src/design/designStore.test.ts` (also add the new names to the existing import from `./designStore`: `selectSelection`, `selectionEqual`, `selectSnapOn`):

```ts
describe("selectSelection (multi)", () => {
  it("is null when nothing is selected", () => {
    expect(selectSelection(snap({ elements: [el()] }))).toBeNull();
  });
  it("mirrors the single-element values for a 1-selection", () => {
    const s = snap({ elements: [el({ id: "a" })], selectedIds: { a: true } });
    const m = selectSelection(s)!;
    expect(m.ids).toEqual(["a"]);
    expect(m.count).toBe(1);
    expect(m.x).toBe(10);
    expect(m.type).toBe("rectangle");
    expect(m.fontSize).toBeNull();
    expect(m.hasLinear).toBe(false);
    expect(m.sharedGroup).toBeNull();
  });
  it("reports uniform values and marks differing ones as mixed", () => {
    const s = snap({
      elements: [
        el({ id: "a", x: 0, opacity: 50 }),
        el({ id: "b", x: 40, opacity: 50 }),
      ],
      selectedIds: { a: true, b: true },
    });
    const m = selectSelection(s)!;
    expect(m.count).toBe(2);
    expect(m.x).toBe("mixed");
    expect(m.opacity).toBe(50);
    expect(m.width).toBe(100);
  });
  it("flags linear types and shared groups", () => {
    const s = snap({
      elements: [
        el({ id: "a", type: "arrow", groupIds: ["G"] }),
        el({ id: "b", groupIds: ["G"] }),
      ],
      selectedIds: { a: true, b: true },
    });
    const m = selectSelection(s)!;
    expect(m.hasLinear).toBe(true);
    expect(m.sharedGroup).toBe("G");
    expect(m.type).toBe("mixed");
  });
  it("fontSize: null without text, value when uniform, mixed when not", () => {
    const noText = snap({ elements: [el({ id: "a" })], selectedIds: { a: true } });
    expect(selectSelection(noText)!.fontSize).toBeNull();
    const uniform = snap({
      elements: [el({ id: "t", type: "text", fontSize: 24 }), el({ id: "u", type: "text", fontSize: 24 })],
      selectedIds: { t: true, u: true },
    });
    expect(selectSelection(uniform)!.fontSize).toBe(24);
    const mixed = snap({
      elements: [el({ id: "t", type: "text", fontSize: 24 }), el({ id: "u", type: "text", fontSize: 12 })],
      selectedIds: { t: true, u: true },
    });
    expect(selectSelection(mixed)!.fontSize).toBe("mixed");
  });
  it("selectionEqual compares by value, including ids", () => {
    const a = snap({ elements: [el({ id: "a" })], selectedIds: { a: true } });
    const b = snap({ elements: [el({ id: "a" })], selectedIds: { a: true } });
    const c = snap({ elements: [el({ id: "a", x: 500 })], selectedIds: { a: true } });
    expect(selectionEqual(selectSelection(a), selectSelection(b))).toBe(true);
    expect(selectionEqual(selectSelection(a), selectSelection(c))).toBe(false);
    expect(selectionEqual(null, null)).toBe(true);
    expect(selectionEqual(selectSelection(a), null)).toBe(false);
  });
  it("snapOn defaults to true in the empty snapshot", () => {
    expect(selectSnapOn(snap())).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/designStore.test.ts`
Expected: FAIL — `selectSelection` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/design/designStore.ts`:

1. Add the import at the top (after the existing imports):

```ts
import { sharedOuterGroup } from "./groups";
```

2. Add `snapOn` to the snapshot type and empty value, and `groupIds` to `StoreElement` (so it satisfies `GroupEl` structurally without casts):

```ts
// in StoreElement:
  groupIds?: readonly string[];

// in DesignSnapshot:
  snapOn: boolean;

// EMPTY_SNAPSHOT gains:
  snapOn: true,
```

3. Append after `selectInspector`/`inspectorEqual`:

```ts
export type MultiValue<T> = T | "mixed";

export const LINEAR_TYPES: ReadonlySet<string> = new Set(["line", "arrow", "freedraw"]);

export type SelectionSel = {
  ids: string[];
  count: number;
  type: MultiValue<string>;
  x: MultiValue<number>; y: MultiValue<number>;
  width: MultiValue<number>; height: MultiValue<number>;
  angleDeg: MultiValue<number>;
  opacity: MultiValue<number>;
  strokeColor: MultiValue<string>;
  backgroundColor: MultiValue<string>;
  strokeWidth: MultiValue<number>;
  fontSize: MultiValue<number> | null;
  hasLinear: boolean;
  sharedGroup: string | null;
};

function uniform<T>(values: T[]): MultiValue<T> {
  return values.every((v) => v === values[0]) ? values[0] : "mixed";
}

export function selectSelection(s: DesignSnapshot): SelectionSel | null {
  const sel = s.elements.filter((e) => s.selectedIds[e.id] && e.isDeleted !== true);
  if (sel.length === 0) return null;
  const texts = sel.filter((e) => e.type === "text");
  const fontSizes = texts
    .map((e) => (typeof e.fontSize === "number" ? e.fontSize : null))
    .filter((v): v is number => v !== null);
  return {
    ids: sel.map((e) => e.id),
    count: sel.length,
    type: uniform(sel.map((e) => e.type)),
    x: uniform(sel.map((e) => Math.round(e.x))),
    y: uniform(sel.map((e) => Math.round(e.y))),
    width: uniform(sel.map((e) => Math.round(e.width))),
    height: uniform(sel.map((e) => Math.round(e.height))),
    angleDeg: uniform(sel.map((e) => Math.round((e.angle * 180) / Math.PI))),
    opacity: uniform(sel.map((e) => e.opacity)),
    strokeColor: uniform(sel.map((e) => e.strokeColor)),
    backgroundColor: uniform(sel.map((e) => e.backgroundColor)),
    strokeWidth: uniform(sel.map((e) => e.strokeWidth)),
    fontSize: fontSizes.length === 0 ? null : uniform(fontSizes),
    hasLinear: sel.some((e) => LINEAR_TYPES.has(e.type)),
    sharedGroup: sharedOuterGroup(sel, s.selectedIds),
  };
}

export function selectionEqual(a: SelectionSel | null, b: SelectionSel | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.ids.join(",") === b.ids.join(",") && a.count === b.count &&
    a.type === b.type && a.x === b.x && a.y === b.y &&
    a.width === b.width && a.height === b.height && a.angleDeg === b.angleDeg &&
    a.opacity === b.opacity && a.strokeColor === b.strokeColor &&
    a.backgroundColor === b.backgroundColor && a.strokeWidth === b.strokeWidth &&
    a.fontSize === b.fontSize && a.hasLinear === b.hasLinear &&
    a.sharedGroup === b.sharedGroup;
}

export const selectSnapOn = (s: DesignSnapshot): boolean => s.snapOn;
```

Note: `DesignPage.tsx` builds full snapshots in `onChange` — adding the `snapOn` field makes that object literal fail tsc until it also sets `snapOn`. Add it now (Task 7 wires the real toggle):

```ts
// in DesignPage onChange, inside storeRef.current.set({ ... }):
      snapOn: (appState as { objectsSnapModeEnabled?: boolean }).objectsSnapModeEnabled ?? true,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/designStore.test.ts`
Expected: PASS (all, including the 7 new).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/design/designStore.ts src/design/designStore.test.ts src/design/DesignPage.tsx
git commit -m "feat(design): multi-select selector with mixed values + snap state

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 5: `commit.ts` additions + `DesignSelectionActions.tsx`

**Files:**
- Modify: `src/design/commit.ts` (add three wrappers)
- Create: `src/design/DesignSelectionActions.tsx`
- Modify: `src/App.css` (append action-bar rules)

**Interfaces:**
- Consumes: `alignPatches`/`distributePatches`/`AlignEl` (Task 1), `groupPatches`/`ungroupPatches` (Task 2), `reorderElements`/`ZOp` (Task 3), `selectSelection`/`selectionEqual`/`SelectionSel` (Task 4), `commitPatches` (Phase 1), `bumpElement`/`El` (Phase 1).
- Produces (used by Task 6):
  - In `commit.ts`: `commitReorder(api, op: ZOp): void`, `setSelectedGroup(api, groupId: string, memberIds: string[]): void`, `setSnapMode(api, on: boolean): void`, `selectSmart(api, id: string): void` (layers panel reflects groups: clicking a grouped element's row selects its whole outermost group)
  - `<DesignSelectionActions store={...} apiRef={...} />` — renders nothing when selection is empty; align row at ≥2, distribute at ≥3, group at ≥2, ungroup when a shared group exists, z-order always.
- No unit test (thin UI/wrapper layer over tested pure modules); gate = tsc + full vitest.

- [ ] **Step 1: Extend `src/design/commit.ts`**

Add to the imports:

```ts
import { applyPatches, bumpElement, type El, type Patch } from "./commitCore";
import { reorderElements, type ZOp } from "./zorder";
```

Append:

```ts
/** Reorder the scene array (z-order). Moved elements are bumped so the
 *  change is never reconciled away. One undo step. */
export function commitReorder(api: ExcalidrawImperativeAPI, op: ZOp): void {
  const els = api.getSceneElements() as unknown as readonly El[];
  const sel = api.getAppState().selectedElementIds as Record<string, boolean>;
  const next = reorderElements(els, sel, op);
  if (!next) return;
  const oldIndex = new Map(els.map((e, i) => [e.id, i]));
  const bumped = next.map((e, i) => (oldIndex.get(e.id) === i ? e : bumpElement(e)));
  api.updateScene({
    elements: bumped as unknown as ExcalidrawElement[],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/** After grouping, select the new group like Excalidraw would. */
export function setSelectedGroup(
  api: ExcalidrawImperativeAPI,
  groupId: string,
  memberIds: string[],
): void {
  api.updateScene({
    appState: {
      selectedGroupIds: { [groupId]: true },
      selectedElementIds: Object.fromEntries(memberIds.map((id) => [id, true])) as AppState["selectedElementIds"],
    },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  });
}

export function setSnapMode(api: ExcalidrawImperativeAPI, on: boolean): void {
  api.updateScene({
    appState: { objectsSnapModeEnabled: on },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}

/** Select from the layers list the way the canvas would: a grouped element
 *  selects its whole outermost group. */
export function selectSmart(api: ExcalidrawImperativeAPI, id: string): void {
  const els = api.getSceneElements();
  const outerOf = (e: unknown): string | null => {
    const g = (e as { groupIds?: readonly string[] }).groupIds;
    return g?.length ? g[g.length - 1] : null;
  };
  const target = els.find((e) => e.id === id);
  const outer = target ? outerOf(target) : null;
  if (!outer) { selectOnly(api, id); return; }
  const memberIds = els.filter((e) => outerOf(e) === outer).map((e) => e.id);
  setSelectedGroup(api, outer, memberIds);
}
```

- [ ] **Step 2: Create `src/design/DesignSelectionActions.tsx`**

```tsx
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { alignPatches, distributePatches, type AlignEl, type AlignMode, type DistributeAxis } from "./align";
import { groupPatches, ungroupPatches } from "./groups";
import type { ZOp } from "./zorder";
import { commitPatches, commitReorder, setSelectedGroup } from "./commit";
import { selectSelection, selectionEqual, type DesignStore } from "./designStore";
import { useDesignSelector } from "./useDesignSelector";

/* Minimal 12x12 stroke icons; Phase 4's polish pass may replace them. */
const I = (d: string) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d={d} />
  </svg>
);
const ICONS: Record<string, JSX.Element> = {
  "left": I("M1.5 1v10 M4 3.5h6 M4 8.5h4"),
  "center-h": I("M6 1v10 M2 3.5h8 M3.5 8.5h5"),
  "right": I("M10.5 1v10 M2 3.5h6 M4 8.5h4"),
  "top": I("M1 1.5h10 M3.5 4v6 M8.5 4v4"),
  "center-v": I("M1 6h10 M3.5 2v8 M8.5 3.5v5"),
  "bottom": I("M1 10.5h10 M3.5 2v6 M8.5 4v4"),
  "dist-h": I("M1.5 1v10 M10.5 1v10 M4.5 4h3v4h-3z"),
  "dist-v": I("M1 1.5h10 M1 10.5h10 M4 4.5h4v3h-4z"),
  "front": I("M4 4h7v7H4z M1 8V1h7"),
  "forward": I("M6 10V2 M3 5l3-3 3 3"),
  "backward": I("M6 2v8 M3 7l3 3 3-3"),
  "back": I("M1 1h7v7H1z M4 4h7v7"),
  "group": I("M1 1h4v4H1z M7 7h4v4H7z M5 3h3v2 M3 5v3h2"),
  "ungroup": I("M1 1h4v4H1z M7 7h4v4H7z"),
};

function Btn({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button className="design-action-btn" title={title} onPointerDown={(e) => { e.preventDefault(); onClick(); }}>
      {ICONS[icon]}
    </button>
  );
}

export function DesignSelectionActions({ store, apiRef }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const sel = useDesignSelector(store, selectSelection, selectionEqual);
  if (!sel) return null;

  const els = () => store.get().elements as unknown as readonly AlignEl[];
  const ids = () => store.get().selectedIds;

  function align(mode: AlignMode) {
    const api = apiRef.current;
    if (!api) return;
    const p = alignPatches(els(), ids(), mode);
    if (Object.keys(p).length) commitPatches(api, p);
  }
  function distribute(axis: DistributeAxis) {
    const api = apiRef.current;
    if (!api) return;
    const p = distributePatches(els(), ids(), axis);
    if (Object.keys(p).length) commitPatches(api, p);
  }
  function group() {
    const api = apiRef.current;
    if (!api) return;
    const r = groupPatches(els(), ids());
    if (!r) return;
    commitPatches(api, r.patches);
    setSelectedGroup(api, r.groupId, Object.keys(r.patches));
  }
  function ungroup() {
    const api = apiRef.current;
    if (!api) return;
    const p = ungroupPatches(els(), ids());
    if (p) commitPatches(api, p);
  }
  const z = (op: ZOp) => { const api = apiRef.current; if (api) commitReorder(api, op); };

  return (
    <div className="design-actions">
      {sel.count >= 2 && (
        <div className="design-actions-row">
          <Btn icon="left" title="Align left" onClick={() => align("left")} />
          <Btn icon="center-h" title="Align horizontal centers" onClick={() => align("center-h")} />
          <Btn icon="right" title="Align right" onClick={() => align("right")} />
          <Btn icon="top" title="Align top" onClick={() => align("top")} />
          <Btn icon="center-v" title="Align vertical centers" onClick={() => align("center-v")} />
          <Btn icon="bottom" title="Align bottom" onClick={() => align("bottom")} />
          {sel.count >= 3 && (
            <>
              <span className="design-action-sep" />
              <Btn icon="dist-h" title="Distribute horizontal spacing" onClick={() => distribute("horizontal")} />
              <Btn icon="dist-v" title="Distribute vertical spacing" onClick={() => distribute("vertical")} />
            </>
          )}
        </div>
      )}
      <div className="design-actions-row">
        <Btn icon="back" title="Send to back" onClick={() => z("back")} />
        <Btn icon="backward" title="Send backward" onClick={() => z("backward")} />
        <Btn icon="forward" title="Bring forward" onClick={() => z("forward")} />
        <Btn icon="front" title="Bring to front" onClick={() => z("front")} />
        {(sel.count >= 2 || sel.sharedGroup) && <span className="design-action-sep" />}
        {sel.count >= 2 && <Btn icon="group" title="Group (Ctrl+G)" onClick={group} />}
        {sel.sharedGroup && <Btn icon="ungroup" title="Ungroup (Ctrl+Shift+G)" onClick={ungroup} />}
      </div>
    </div>
  );
}
```

If tsc rejects `JSX.Element` under the project's React 19 types, use `React.ReactElement` (import type from `react`) instead.

- [ ] **Step 3: Append to `src/App.css`** (after the `.design-layer-*` rules; if those don't exist, after the `button.design-zoom-pct:hover` rule added in Phase 1)

```css
.design-actions { display: flex; flex-direction: column; gap: 2px; padding: 2px 0 6px; }
.design-actions-row { display: flex; align-items: center; gap: 2px; }
.design-action-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 22px; background: transparent; border: none; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-sm); transition: background .12s, color .12s; }
.design-action-btn:hover { background: rgba(243,238,229,.06); color: var(--text); }
.design-action-sep { width: 1px; height: 14px; background: var(--rule); margin: 0 3px; }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors (component not mounted yet — Task 6 mounts it).

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/design/commit.ts src/design/DesignSelectionActions.tsx src/App.css
git commit -m "feat(design): selection actions bar (align/distribute/group/z-order)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 6: `DesignRightPanel` v2 — multi-select inspector with Mixed values

**Files:**
- Modify: `src/design/DesignRightPanel.tsx` (full rewrite below)
- Modify: `src/design/designStore.ts` (delete `selectInspector`, `inspectorEqual`, `InspectorSel` — superseded)
- Modify: `src/design/designStore.test.ts` (delete the `selectInspector` describe block; drop those names from the import)

**Interfaces:**
- Consumes: `selectSelection`/`selectionEqual` (Task 4), `DesignSelectionActions` (Task 5), Phase 1 modules as before.
- Produces: panel props unchanged (`{ store, apiRef }`). Editing a field with N elements selected applies to all N in **one** undo step; differing values display as a `Mixed` placeholder.

- [ ] **Step 1: Rewrite `src/design/DesignRightPanel.tsx`**

```tsx
import { useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { degToRad } from "./designUtils";
import { hidePatch, unhidePatch, isHidden, type Patch } from "./commitCore";
import { commitPatches, selectSmart } from "./commit";
import {
  selectSelection, selectionEqual, selectLayers, layersEqual,
  type DesignStore, type MultiValue,
} from "./designStore";
import { useDesignSelector } from "./useDesignSelector";
import { DesignSelectionActions } from "./DesignSelectionActions";
import { TOOL_ICONS, SelectIcon } from "../wall/icons";

function ShapeIcon({ type }: { type: string }) {
  const Icon = TOOL_ICONS[type as keyof typeof TOOL_ICONS];
  return <span className="design-layer-icon">{Icon ? <Icon /> : <SelectIcon />}</span>;
}

/** Number field that tracks live canvas values while idle but never fights
 *  in-progress typing. Enter/blur commits, Escape cancels. "mixed" renders
 *  as an empty field with a Mixed placeholder; committing applies to all. */
function NumInput({ label, value, onCommit, narrow }: {
  label: string;
  value: MultiValue<number>;
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
        placeholder={value === "mixed" ? "Mixed" : undefined}
        value={draft ?? (value === "mixed" ? "" : String(value))}
        onFocus={(e) => setDraft(e.target.value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          if (!cancelled.current) {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && (value === "mixed" || v !== value)) onCommit(v);
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

const colorValue = (v: MultiValue<string>): string =>
  v === "mixed" ? "#888888" : v === "transparent" ? "#000000" : v;

export function DesignRightPanel({ store, apiRef }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const sel = useDesignSelector(store, selectSelection, selectionEqual);
  const layers = useDesignSelector(store, selectLayers, layersEqual);
  const [opDraft, setOpDraft] = useState<number | null>(null);

  /** One patch for every selected element -> one undo step. */
  function commitAll(patch: Patch, capture: "immediately" | "eventually" = "immediately") {
    const api = apiRef.current;
    if (!api || !sel) return;
    commitPatches(api, Object.fromEntries(sel.ids.map((id) => [id, patch])), capture);
  }

  function commitOne(id: string, patch: Patch) {
    const api = apiRef.current;
    if (api) commitPatches(api, { [id]: patch });
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
        {sel ? (
          <>
            <DesignSelectionActions store={store} apiRef={apiRef} />

            <span className="design-section-label">
              {sel.count > 1 ? `Transform · ${sel.count} selected` : "Transform"}
            </span>
            <div className="design-prop-section">
              <div className="design-prop-row">
                <NumInput label="X" value={sel.x} onCommit={(v) => commitAll({ x: v })} />
                <NumInput label="Y" value={sel.y} onCommit={(v) => commitAll({ y: v })} />
              </div>
              {!sel.hasLinear && (
                <div className="design-prop-row">
                  <NumInput label="W" value={sel.width} onCommit={(v) => commitAll({ width: v })} />
                  <NumInput label="H" value={sel.height} onCommit={(v) => commitAll({ height: v })} />
                </div>
              )}
              <NumInput label="°" value={sel.angleDeg} onCommit={(v) => commitAll({ angle: degToRad(v) })} />
            </div>

            <span className="design-section-label">Appearance</span>
            <div className="design-prop-section">
              <div className="design-prop-row">
                <span className="design-prop-label">Fi</span>
                <div className="design-color-swatch">
                  <input
                    type="color"
                    value={colorValue(sel.backgroundColor)}
                    onChange={(e) => commitAll({ backgroundColor: e.target.value }, "eventually")}
                    onBlur={(e) => commitAll({ backgroundColor: e.target.value })}
                  />
                </div>
                <span className="design-prop-label">St</span>
                <div className="design-color-swatch">
                  <input
                    type="color"
                    value={colorValue(sel.strokeColor)}
                    onChange={(e) => commitAll({ strokeColor: e.target.value }, "eventually")}
                    onBlur={(e) => commitAll({ strokeColor: e.target.value })}
                  />
                </div>
                <NumInput label="" value={sel.strokeWidth} narrow onCommit={(v) => commitAll({ strokeWidth: v })} />
              </div>
              <div className="design-prop-row">
                <span className="design-prop-label">Op</span>
                <input
                  type="range"
                  min={0} max={100}
                  style={{ flex: 1 }}
                  value={opDraft ?? (sel.opacity === "mixed" ? 100 : sel.opacity)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setOpDraft(v);
                    commitAll({ opacity: v }, "eventually"); // live preview, no undo spam
                  }}
                  onPointerUp={() => {
                    if (opDraft !== null) commitAll({ opacity: opDraft }); // one undo step
                    setOpDraft(null);
                  }}
                />
                <span className="design-prop-opacity">
                  {opDraft ?? (sel.opacity === "mixed" ? "–" : sel.opacity)}%
                </span>
              </div>
            </div>

            {sel.fontSize !== null && (
              <>
                <span className="design-section-label">Text</span>
                <div className="design-prop-section">
                  <NumInput label="Sz" value={sel.fontSize} onCommit={(v) => commitAll({ fontSize: v })} />
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
              onClick={() => { const api = apiRef.current; if (api) selectSmart(api, row.id); }}
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
                    if (!row.hidden) commitOne(row.id, { locked: !row.locked });
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

Note: `fontSize` can be `"mixed"`, which `NumInput` accepts (`MultiValue<number>`); `sel.fontSize !== null` narrows away only the null case.

- [ ] **Step 2: Delete the superseded single-element selector**

In `src/design/designStore.ts`, delete `export type InspectorSel = {...}`, `export function selectInspector(...)`, and `export function inspectorEqual(...)` (all fully replaced by `SelectionSel`/`selectSelection`/`selectionEqual`).

In `src/design/designStore.test.ts`, delete the `describe("selectInspector", ...)` block and remove `selectInspector`, `inspectorEqual` from the import.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: PASS — full suite.

- [ ] **Step 4: Commit**

```bash
git add src/design/DesignRightPanel.tsx src/design/designStore.ts src/design/designStore.test.ts
git commit -m "feat(design): multi-select inspector with Mixed values + actions bar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 7: Snap toggle — top bar button, on by default

**Files:**
- Modify: `src/design/DesignPage.tsx` (initial appState + pass `apiRef` to top bar)
- Modify: `src/design/DesignTopBar.tsx` (snap toggle button)
- Modify: `src/App.css` (active-state rule)

**Interfaces:**
- Consumes: `setSnapMode` (Task 5), `selectSnapOn` (Task 4).
- Produces: `DesignTopBar` props become `{ store, apiRef, onBack, onReference }`. Snapping (`objectsSnapModeEnabled`) is on by default on the design page and toggleable from the top bar.

- [ ] **Step 1: Default snapping on in `src/design/DesignPage.tsx`**

In the `setInitial` call, add to the `appState` object:

```ts
          objectsSnapModeEnabled: true,
```

(directly after `currentItemFontFamily: 2,`). The `snapOn` field in `onChange` was already wired in Task 4.

In the render, pass the api ref to the top bar:

```tsx
      <DesignTopBar store={storeRef.current} apiRef={apiRef} onBack={handleBack} onReference={() => void reference()} />
```

- [ ] **Step 2: Rewrite `src/design/DesignTopBar.tsx`**

```tsx
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { BackIcon } from "../wall/icons";
import { setSnapMode } from "./commit";
import { selectSnapOn, selectZoom, type DesignStore } from "./designStore";
import { useDesignSelector } from "./useDesignSelector";

const SnapIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d="M3 1v5a3.5 3.5 0 0 0 7 0V1 M3 1h2.5 M7.5 1H10 M3 4h2.5 M7.5 4H10" />
  </svg>
);

export function DesignTopBar({ store, apiRef, onBack, onReference }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
  onBack: () => void;
  onReference: () => void;
}) {
  const zoom = useDesignSelector(store, selectZoom);
  const snapOn = useDesignSelector(store, selectSnapOn);
  return (
    <div className="design-topbar">
      <button className="cnvs-btn" onClick={onBack} title="Back to wall">
        <BackIcon />
      </button>
      <span className="design-title">UI Design</span>
      <span className="design-spacer" />
      <button
        className={`cnvs-btn design-snap${snapOn ? " active" : ""}`}
        onClick={() => { const api = apiRef.current; if (api) setSnapMode(api, !snapOn); }}
        title={snapOn ? "Snapping on — click to disable" : "Snapping off — click to enable"}
      >
        <SnapIcon />
      </button>
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

- [ ] **Step 3: Append to `src/App.css`** (after the `.design-action-sep` rule from Task 5)

```css
.design-snap.active { color: var(--accent); }
```

(If the theme uses a different accent token name, check `:root` in `src/App.css`/`src/theme.css` and use the existing warm-amber accent variable.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/design/DesignPage.tsx src/design/DesignTopBar.tsx src/App.css
git commit -m "feat(design): object snapping on by default with top-bar toggle

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 8: Zoom shortcuts + cheatsheet overlay

**Files:**
- Create: `src/design/viewport.ts` (shared fit helpers)
- Create: `src/design/DesignShortcuts.tsx` (cheatsheet overlay)
- Modify: `src/design/DesignZoomIsland.tsx` (use the shared helpers)
- Modify: `src/design/DesignPage.tsx` (keyboard handler + overlay mount)
- Modify: `src/App.css` (overlay styles)

**Interfaces:**
- Consumes: `DesignStore`, `apiRef`, Phase 1 zoom island.
- Produces:
  - `viewport.ts`: `fitAll(api: ExcalidrawImperativeAPI): void`, `fitSelection(api: ExcalidrawImperativeAPI, selectedIds: Readonly<Record<string, boolean>>): void`
  - `<DesignShortcuts onClose={() => void} />`
  - Keyboard on the design page: `Shift+1` zoom-to-fit, `Shift+2` zoom-to-selection, `?` toggles the cheatsheet, `Escape` closes it. Handled at window **capture** phase with `stopPropagation()` so Excalidraw's own `?` help dialog never opens; suppressed while typing in inputs/textareas/contenteditable.

- [ ] **Step 1: Create `src/design/viewport.ts`**

```ts
/** Shared viewport helpers (zoom island + keyboard shortcuts). */
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export function fitAll(api: ExcalidrawImperativeAPI): void {
  api.scrollToContent(undefined, {
    fitToViewport: true, viewportZoomFactor: 0.9, animate: true,
  });
}

export function fitSelection(
  api: ExcalidrawImperativeAPI,
  selectedIds: Readonly<Record<string, boolean>>,
): void {
  const els = api.getSceneElements().filter((e) => selectedIds[e.id]);
  if (els.length) api.scrollToContent(els, {
    fitToViewport: true, viewportZoomFactor: 0.7, animate: true,
  });
}
```

- [ ] **Step 2: Use them in `src/design/DesignZoomIsland.tsx`**

Replace the local `fitAll`/`fitSelection` function declarations with calls to the shared helpers: add `import { fitAll, fitSelection } from "./viewport";`, delete the two local functions, and change the two buttons to:

```tsx
      <button className="design-zoom-btn wide" onClick={() => { const api = apiRef.current; if (api) fitAll(api); }} title="Zoom to fit everything (Shift+1)">Fit</button>
      <button className="design-zoom-btn wide" onClick={() => { const api = apiRef.current; if (api) fitSelection(api, store.get().selectedIds); }} title="Zoom to selection (Shift+2)">Sel</button>
```

- [ ] **Step 3: Create `src/design/DesignShortcuts.tsx`**

```tsx
const ROWS: Array<[string, string]> = [
  ["V / H", "Select / Hand"],
  ["R · O · D", "Rectangle · Ellipse · Diamond"],
  ["A · L · P", "Arrow · Line · Draw"],
  ["T · E · F", "Text · Eraser · Frame"],
  ["Ctrl+Z / Ctrl+Shift+Z", "Undo / Redo"],
  ["Ctrl+G / Ctrl+Shift+G", "Group / Ungroup"],
  ["Ctrl+D", "Duplicate"],
  ["Ctrl+[ / Ctrl+]", "Send backward / Bring forward"],
  ["Shift+1 / Shift+2", "Zoom to fit / to selection"],
  ["Alt+drag", "Duplicate by dragging"],
  ["?", "This cheatsheet"],
];

export function DesignShortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className="design-shortcuts-backdrop" onClick={onClose}>
      <div className="design-shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="design-shortcuts-head">Keyboard shortcuts</div>
        {ROWS.map(([keys, what]) => (
          <div key={keys} className="design-shortcuts-row">
            <span className="design-shortcuts-keys">{keys}</span>
            <span className="design-shortcuts-what">{what}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire keyboard + overlay in `src/design/DesignPage.tsx`**

Add imports:

```ts
import { fitAll, fitSelection } from "./viewport";
import { DesignShortcuts } from "./DesignShortcuts";
```

Add state next to the other `useState` calls:

```ts
  const [showShortcuts, setShowShortcuts] = useState(false);
```

Add a keyboard effect after the existing load effect. Capture phase + `stopPropagation` keeps Excalidraw's own `?` help dialog closed; typing targets are exempt:

```ts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return;
      const api = apiRef.current;
      if (e.key === "?") {
        e.preventDefault(); e.stopPropagation();
        setShowShortcuts((v) => !v);
      } else if (e.key === "Escape") {
        setShowShortcuts(false); // no preventDefault: Escape still deselects on canvas
      } else if (e.shiftKey && e.code === "Digit1" && api) {
        e.preventDefault(); e.stopPropagation();
        fitAll(api);
      } else if (e.shiftKey && e.code === "Digit2" && api) {
        e.preventDefault(); e.stopPropagation();
        fitSelection(api, storeRef.current.get().selectedIds);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
```

Mount the overlay just before the closing `</div>` of `.design-page`:

```tsx
      {showShortcuts && <DesignShortcuts onClose={() => setShowShortcuts(false)} />}
```

- [ ] **Step 5: Append to `src/App.css`** (after the `.design-snap.active` rule)

```css
.design-shortcuts-backdrop { position: absolute; inset: 0; z-index: 40; background: rgba(0,0,0,.35); display: grid; place-items: center; }
.design-shortcuts { min-width: 320px; background: var(--glass); backdrop-filter: blur(14px); border: 1px solid var(--rule); border-radius: var(--radius-sm); box-shadow: var(--shadow); padding: 14px 16px; }
.design-shortcuts-head { font: 500 12px var(--font-display); color: var(--text); margin-bottom: 10px; }
.design-shortcuts-row { display: flex; justify-content: space-between; gap: 24px; padding: 3px 0; }
.design-shortcuts-keys { font: 500 11px var(--font-mono); color: var(--text); white-space: nowrap; }
.design-shortcuts-what { font: 400 11.5px var(--font-ui); color: var(--text-muted); }
```

Note: `.design-shortcuts-backdrop` uses `position: absolute` against `.design-page` — mount point must be inside the `.design-page` div (it is, per Step 4). If `.design-page` lacks `position: relative`, add it to the existing `.design-page` rule.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: PASS — full suite.

- [ ] **Step 7: Commit**

```bash
git add src/design/viewport.ts src/design/DesignShortcuts.tsx src/design/DesignZoomIsland.tsx src/design/DesignPage.tsx src/App.css
git commit -m "feat(design): zoom shortcuts (Shift+1/2) + keyboard cheatsheet overlay

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Phase 2 acceptance (from the spec)

After Task 8 — testable items verified by the implementer, visual items by the user after an app restart (never restart the app yourself):

- Multi-select shows shared properties; differing values render as `Mixed`; committing a field applies to every selected element in one undo step (Tasks 4, 6).
- Align left/center-h/right/top/center-v/bottom and distribute horizontal/vertical respect group bounding boxes and rotated elements; each is a single undo step (Tasks 1, 5).
- Object snapping is on by default and toggleable from the top bar (Task 7).
- Group/ungroup and 4-way z-order controls in the actions bar; Excalidraw's native Ctrl+G / Ctrl+Shift+G / Ctrl+[ / Ctrl+] still work (Tasks 2, 3, 5).
- Shift+1 / Shift+2 zoom shortcuts work even when focus is outside the canvas; `?` opens the cheatsheet (our overlay, not Excalidraw's help dialog); shortcuts never fire while typing in panel inputs (Task 8).
- File format unchanged (`groupIds` is a native serialized field; no new customData).
