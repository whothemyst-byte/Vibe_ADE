# Groq Proxy + Managed Terminal Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voice agent works out of the box via a Supabase Edge Function proxy holding the Groq key (per-device daily quota), terminals arrange in a screen-aspect grid with auto-fit camera and drag-to-reorder, and agent names become easy to pronounce.

**Architecture:** A Deno edge function `groq-proxy` in the existing FlowMate Supabase project (`cvithwrsgmtdajaddsab`) forwards whitelisted chat/STT calls to Groq, metering per-device usage in a `groq_usage` table. The frontend's `groq.ts` gains a `GroqAuth` union (direct user key vs proxy+deviceId). A new pure module `src/wall/gridLayout.ts` computes grid shape/positions/camera; `WallView` re-lays-out whenever terminal membership or order changes (layout writes only x/y, so it can't loop); `TerminalWindow` drag becomes reorder.

**Tech Stack:** React + Excalidraw + zustand + vitest (frontend), Supabase Edge Functions (Deno) + Postgres (proxy).

**Spec:** `docs/superpowers/specs/2026-06-12-groq-proxy-and-terminal-grid-design.md`

**Working directory:** `C:\Users\admin\Desktop\Quansynd\vibe-walls` (its own git repo, branch `master`). Run tests with `npx vitest run <file>`.

---

## File Map

| File | Action | Responsibility |
| --- | --- | --- |
| `src/wall/agentNames.ts` | Modify | New pronounceable name pool |
| `src/wall/gridLayout.ts` | Create | Pure grid math: shape, positions, bbox, camera fit, nearest slot |
| `src/wall/gridLayout.test.ts` | Create | Tests for all grid math |
| `src/wall/terminalStore.ts` | Modify | Add `anchor` + `moveToIndex` |
| `src/wall/terminalStore.test.ts` | Modify | Tests for the above |
| `src/store/types.ts` | Modify | `WallDoc.gridAnchor` |
| `src/wall/WallView.tsx` | Modify | Grid layout effect, camera fit, simplified `addTerminal`, camera-centering `focus_terminal` |
| `src/wall/TerminalWindow.tsx` | Modify | Drag-to-reorder, remove resize handle |
| `src/App.css` | Modify | Remove `.terminal-resize` rule |
| `src/wall/transform.ts` / `transform.test.ts` | Modify | Remove now-dead `findSpawnPoint`, `rectsOverlap`, `unionBBox` |
| `src/settings/settings.ts` / `settings.test.ts` | Modify | `vibe.deviceId` field |
| `src/settings/settingsStore.ts` | Modify | Generate deviceId on first load |
| `src/vibe/groq.ts` / `groq.test.ts` | Modify | `GroqAuth` backend switch |
| `src/vibe/VibeAgent.tsx` | Modify | Build auth, drop key gates |
| `src/settings/SettingsModal.tsx` | Modify | "Optional key" copy |
| `supabase/functions/groq-proxy/rules.ts` | Create | Pure request validation + quota rules |
| `supabase/functions/groq-proxy/rules.test.ts` | Create | Tests (vitest include extended) |
| `supabase/functions/groq-proxy/index.ts` | Create | Deno handler: CORS, validate, meter, forward |
| `vitest.config.ts` | Modify | Include `supabase/functions/**/*.test.ts` |
| `README.md` | Modify | Document bundled usage + own-key upgrade |

---

### Task 1: Pronounceable agent names

**Files:**
- Modify: `src/wall/agentNames.ts`
- Test: `src/wall/agentNames.test.ts` (existing tests are name-agnostic; no test changes needed)

These names are spoken to and by the voice agent, so the pool favors short, phonetically unambiguous names.

- [ ] **Step 1: Replace the name pool**

In `src/wall/agentNames.ts`, replace the `AGENT_NAMES` array (keep the `pickAgentName` function untouched):

```ts
/** Short, easy-to-pronounce agent names (spoken to/by the voice agent). */
export const AGENT_NAMES = [
  "Max", "Leo", "Mia", "Zoe", "Ben", "Sam", "Ruby", "Toby",
  "Milo", "Nina", "Coco", "Daisy", "Finn", "Lily", "Oscar", "Penny",
  "Rosie", "Sunny", "Teddy", "Bella", "Charlie", "Ellie", "Jack", "Lucy",
  "Ollie", "Poppy", "Archie", "Holly", "Louie", "Maggie", "Frankie", "Winnie",
];
```

(Deliberately avoids near-homophones of each other — no "Max/Jax", "Ellie/Nelly" pairs beyond what STT separates reliably.)

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/wall/agentNames.test.ts`
Expected: 4 tests PASS (they assert pool membership and suffixing, not specific names).

- [ ] **Step 3: Commit**

```bash
git add src/wall/agentNames.ts
git commit -m "feat(wall): pronounceable agent name pool"
```

### Task 2: gridLayout.ts — grid shape from screen aspect

**Files:**
- Create: `src/wall/gridLayout.ts`
- Test: `src/wall/gridLayout.test.ts`

`gridShape(n, aspect)` picks cols/rows whose overall pixel shape (cells are 420×260 + 24px gutters) best matches the screen aspect ratio, skipping shapes with a fully-empty column. Comparison is in log space so 2× too wide and 2× too tall are equally bad.

- [ ] **Step 1: Write the failing tests**

Create `src/wall/gridLayout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gridShape } from "./gridLayout";

const LANDSCAPE = 16 / 9;

describe("gridShape", () => {
  it("handles 0 and 1 terminals", () => {
    expect(gridShape(0, LANDSCAPE)).toEqual({ cols: 0, rows: 0 });
    expect(gridShape(1, LANDSCAPE)).toEqual({ cols: 1, rows: 1 });
  });

  it("puts 2 terminals side by side on a landscape screen", () => {
    expect(gridShape(2, LANDSCAPE)).toEqual({ cols: 2, rows: 1 });
  });

  it("forms 2x2 for 4 terminals on a landscape screen", () => {
    expect(gridShape(4, LANDSCAPE)).toEqual({ cols: 2, rows: 2 });
  });

  it("forms 3x2 for 6 terminals on a landscape screen", () => {
    expect(gridShape(6, LANDSCAPE)).toEqual({ cols: 3, rows: 2 });
  });

  it("forms 4x3 for 12 terminals on a landscape screen", () => {
    expect(gridShape(12, LANDSCAPE)).toEqual({ cols: 4, rows: 3 });
  });

  it("stacks vertically on a portrait screen", () => {
    expect(gridShape(2, 0.6)).toEqual({ cols: 1, rows: 2 });
  });

  it("never produces a fully empty column", () => {
    for (let n = 1; n <= 20; n++) {
      const { cols, rows } = gridShape(n, LANDSCAPE);
      expect((cols - 1) * rows).toBeLessThan(n); // last column has >= 1 cell
      expect(cols * rows).toBeGreaterThanOrEqual(n); // grid holds everything
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wall/gridLayout.test.ts`
Expected: FAIL — `Cannot find module './gridLayout'` (or similar).

- [ ] **Step 3: Implement gridShape**

Create `src/wall/gridLayout.ts`:

```ts
import type { Camera, Rect } from "./transform";

/** Fixed terminal cell size (world px) — terminals are uniform in the grid. */
export const CELL = { w: 420, h: 260 };
export const GUTTER = 24;

export type Point = { x: number; y: number };

/**
 * Cols/rows whose overall pixel shape best matches the screen aspect (w/h).
 * Cells are CELL-sized with GUTTER gaps, so the cell aspect (not just the
 * count) drives the choice. Shapes with a fully empty column are skipped.
 * Comparison happens in log space so "2x too wide" == "2x too tall".
 */
export function gridShape(n: number, aspect: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: n, rows: n };
  let best = { cols: 1, rows: n };
  let bestDiff = Infinity;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    if (cols > 1 && (cols - 1) * rows >= n) continue; // would leave a column empty
    const w = cols * CELL.w + (cols - 1) * GUTTER;
    const h = rows * CELL.h + (rows - 1) * GUTTER;
    const diff = Math.abs(Math.log(w / h) - Math.log(aspect));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = { cols, rows };
    }
  }
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wall/gridLayout.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wall/gridLayout.ts src/wall/gridLayout.test.ts
git commit -m "feat(wall): gridShape picks cols/rows matching screen aspect"
```

### Task 3: gridLayout.ts — positions and bounding box

**Files:**
- Modify: `src/wall/gridLayout.ts`
- Test: `src/wall/gridLayout.test.ts`

The grid is centered on a stable world-space `anchor` point. `gridPositions` returns each terminal's top-left; `gridBBox` is the grid's bounding box (for camera fit).

- [ ] **Step 1: Write the failing tests**

Append to `src/wall/gridLayout.test.ts` (extend the import to `import { gridShape, gridPositions, gridBBox, CELL, GUTTER } from "./gridLayout";`):

```ts
describe("gridPositions", () => {
  it("centers a single terminal on the anchor", () => {
    const [p] = gridPositions(1, LANDSCAPE, { x: 0, y: 0 });
    expect(p).toEqual({ x: -CELL.w / 2, y: -CELL.h / 2 });
  });

  it("lays a 2x1 row with one gutter, centered on the anchor", () => {
    const pos = gridPositions(2, LANDSCAPE, { x: 100, y: 50 });
    const gridW = 2 * CELL.w + GUTTER;
    expect(pos[0]).toEqual({ x: 100 - gridW / 2, y: 50 - CELL.h / 2 });
    expect(pos[1].x - pos[0].x).toBe(CELL.w + GUTTER);
    expect(pos[1].y).toBe(pos[0].y);
  });

  it("wraps to the next row in reading order", () => {
    const pos = gridPositions(4, LANDSCAPE, { x: 0, y: 0 }); // 2x2
    expect(pos[2].x).toBe(pos[0].x); // row 2 starts at the left edge
    expect(pos[2].y - pos[0].y).toBe(CELL.h + GUTTER);
    expect(pos[3].x).toBe(pos[1].x);
  });
});

describe("gridBBox", () => {
  it("bounds exactly the laid-out cells", () => {
    const anchor = { x: 10, y: -20 };
    const pos = gridPositions(6, LANDSCAPE, anchor); // 3x2
    const bbox = gridBBox(6, LANDSCAPE, anchor);
    expect(bbox.x).toBe(Math.min(...pos.map((p) => p.x)));
    expect(bbox.y).toBe(Math.min(...pos.map((p) => p.y)));
    expect(bbox.w).toBe(3 * CELL.w + 2 * GUTTER);
    expect(bbox.h).toBe(2 * CELL.h + GUTTER);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wall/gridLayout.test.ts`
Expected: new tests FAIL — `gridPositions is not a function`.

- [ ] **Step 3: Implement gridPositions + gridBBox**

Append to `src/wall/gridLayout.ts`:

```ts
/** Top-left points for n cells in reading order, grid centered on `anchor`. */
export function gridPositions(n: number, aspect: number, anchor: Point): Point[] {
  const { cols } = gridShape(n, aspect);
  const bbox = gridBBox(n, aspect, anchor);
  return Array.from({ length: n }, (_, i) => ({
    x: bbox.x + (i % cols) * (CELL.w + GUTTER),
    y: bbox.y + Math.floor(i / cols) * (CELL.h + GUTTER),
  }));
}

/** Bounding box of the n-cell grid centered on `anchor`. */
export function gridBBox(n: number, aspect: number, anchor: Point): Rect {
  const { cols, rows } = gridShape(n, aspect);
  const w = cols * CELL.w + (cols - 1) * GUTTER;
  const h = rows * CELL.h + (rows - 1) * GUTTER;
  return { x: anchor.x - w / 2, y: anchor.y - h / 2, w, h };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wall/gridLayout.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wall/gridLayout.ts src/wall/gridLayout.test.ts
git commit -m "feat(wall): grid cell positions and bounding box around a stable anchor"
```

### Task 4: gridLayout.ts — camera fit and nearest slot

**Files:**
- Modify: `src/wall/gridLayout.ts`
- Test: `src/wall/gridLayout.test.ts`

Excalidraw camera convention (see `transform.ts`): `screen = (world + cam.xy) * cam.z`, where `cam = {x: scrollX, y: scrollY, z: zoom}`. `fitCamera` centers a bbox on screen, zooming out only (capped at `maxZoom`). `nearestSlotIndex` is the drop-target picker for drag-reorder.

- [ ] **Step 1: Write the failing tests**

Append to `src/wall/gridLayout.test.ts` (extend the import with `fitCamera, nearestSlotIndex`):

```ts
describe("fitCamera", () => {
  const screen = { w: 1600, h: 900 };

  it("keeps zoom at 1 when the bbox fits, and centers it", () => {
    const bbox = { x: 0, y: 0, w: 420, h: 260 };
    const cam = fitCamera(bbox, screen);
    expect(cam.z).toBe(1);
    // world center of bbox maps to screen center: (cx + cam.x) * z = screenW/2
    expect((bbox.x + bbox.w / 2 + cam.x) * cam.z).toBeCloseTo(screen.w / 2);
    expect((bbox.y + bbox.h / 2 + cam.y) * cam.z).toBeCloseTo(screen.h / 2);
  });

  it("zooms out (z < 1) when the padded bbox exceeds the screen", () => {
    const bbox = { x: -1000, y: -600, w: 2000, h: 1200 };
    const cam = fitCamera(bbox, screen);
    expect(cam.z).toBeLessThan(1);
    expect(cam.z).toBeCloseTo(Math.min(1600 / (2000 + 96), 900 / (1200 + 96)));
    expect((bbox.x + bbox.w / 2 + cam.x) * cam.z).toBeCloseTo(screen.w / 2);
  });

  it("respects a custom maxZoom cap", () => {
    const cam = fitCamera({ x: 0, y: 0, w: 100, h: 100 }, screen, 48, 0.5);
    expect(cam.z).toBe(0.5);
  });
});

describe("nearestSlotIndex", () => {
  const rects = [
    { x: 0, y: 0, w: 420, h: 260 },
    { x: 444, y: 0, w: 420, h: 260 },
    { x: 0, y: 284, w: 420, h: 260 },
  ];

  it("returns the index of the rect whose center is nearest", () => {
    expect(nearestSlotIndex({ x: 210, y: 130 }, rects)).toBe(0);
    expect(nearestSlotIndex({ x: 700, y: 100 }, rects)).toBe(1);
    expect(nearestSlotIndex({ x: 150, y: 500 }, rects)).toBe(2);
  });

  it("returns -1 for an empty list", () => {
    expect(nearestSlotIndex({ x: 0, y: 0 }, [])).toBe(-1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wall/gridLayout.test.ts`
Expected: new tests FAIL — `fitCamera is not a function`.

- [ ] **Step 3: Implement fitCamera + nearestSlotIndex**

Append to `src/wall/gridLayout.ts`:

```ts
/**
 * Camera that centers `bbox` on a screen of CSS px size `screen`, zoomed out
 * just enough to fit it with `pad` world-px padding — never zoomed in beyond
 * `maxZoom`. Excalidraw convention: screen = (world + cam.xy) * cam.z.
 */
export function fitCamera(
  bbox: Rect,
  screen: { w: number; h: number },
  pad = 48,
  maxZoom = 1
): Camera {
  const z = Math.min(maxZoom, screen.w / (bbox.w + 2 * pad), screen.h / (bbox.h + 2 * pad));
  return {
    x: screen.w / (2 * z) - (bbox.x + bbox.w / 2),
    y: screen.h / (2 * z) - (bbox.y + bbox.h / 2),
    z,
  };
}

/** Index of the rect whose center is nearest to `p` (drop-target slot); -1 if none. */
export function nearestSlotIndex(p: Point, rects: Rect[]): number {
  let best = -1;
  let bestD = Infinity;
  rects.forEach((r, i) => {
    const dx = r.x + r.w / 2 - p.x;
    const dy = r.y + r.h / 2 - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wall/gridLayout.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wall/gridLayout.ts src/wall/gridLayout.test.ts
git commit -m "feat(wall): camera fit (zoom-out only) and nearest-slot picking"
```

### Task 5: terminalStore — anchor + moveToIndex

**Files:**
- Modify: `src/wall/terminalStore.ts`
- Test: `src/wall/terminalStore.test.ts`

The store gains the grid's persistent world-space `anchor` (null until the first layout) and `moveToIndex` for drag-reorder. Array order is grid order.

- [ ] **Step 1: Write the failing tests**

Append to `src/wall/terminalStore.test.ts` (inside the existing `describe`, reusing the `mk` helper; also reset the anchor in `beforeEach` by changing it to `useTerminalStore.setState({ terminals: [], anchor: null })`):

```ts
  it("moveToIndex reorders a terminal", () => {
    useTerminalStore.getState().add(mk("a"));
    useTerminalStore.getState().add(mk("b"));
    useTerminalStore.getState().add(mk("c"));
    useTerminalStore.getState().moveToIndex("c", 0);
    expect(useTerminalStore.getState().terminals.map((t) => t.id)).toEqual(["c", "a", "b"]);
    useTerminalStore.getState().moveToIndex("c", 2);
    expect(useTerminalStore.getState().terminals.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("moveToIndex ignores unknown ids and clamps the index", () => {
    useTerminalStore.getState().add(mk("a"));
    useTerminalStore.getState().add(mk("b"));
    useTerminalStore.getState().moveToIndex("nope", 0);
    useTerminalStore.getState().moveToIndex("a", 99);
    expect(useTerminalStore.getState().terminals.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("stores the grid anchor", () => {
    expect(useTerminalStore.getState().anchor).toBeNull();
    useTerminalStore.setState({ anchor: { x: 5, y: 6 } });
    expect(useTerminalStore.getState().anchor).toEqual({ x: 5, y: 6 });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wall/terminalStore.test.ts`
Expected: new tests FAIL — `moveToIndex is not a function`.

- [ ] **Step 3: Implement anchor + moveToIndex**

Replace the `TerminalStore` type and store body in `src/wall/terminalStore.ts`:

```ts
type TerminalStore = {
  terminals: TerminalState[];
  /** World-space center of the managed grid; null until the first layout. */
  anchor: { x: number; y: number } | null;
  add: (t: TerminalState) => void;
  update: (id: string, patch: Partial<TerminalState>) => void;
  remove: (id: string) => void;
  /** Reorders a terminal to `index` (grid order = array order). */
  moveToIndex: (id: string, index: number) => void;
};

export const useTerminalStore = create<TerminalStore>((set) => ({
  terminals: [],
  anchor: null,
  add: (t) => set((s) => ({ terminals: [...s.terminals, t] })),
  update: (id, patch) =>
    set((s) => ({
      terminals: s.terminals.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  remove: (id) => set((s) => ({ terminals: s.terminals.filter((t) => t.id !== id) })),
  moveToIndex: (id, index) =>
    set((s) => {
      const from = s.terminals.findIndex((t) => t.id === id);
      if (from === -1) return {};
      const next = [...s.terminals];
      const [moved] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(index, next.length)), 0, moved);
      return { terminals: next };
    }),
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wall/terminalStore.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wall/terminalStore.ts src/wall/terminalStore.test.ts
git commit -m "feat(wall): terminal store gains grid anchor and moveToIndex"
```

### Task 6: WallView — managed grid integration

**Files:**
- Modify: `src/store/types.ts`
- Modify: `src/wall/WallView.tsx`

No new unit tests (WallView is a component; the repo has no component tests — all logic it calls was tested in Tasks 2–5). Verification is typecheck + manual run.

How the layout triggers: WallView subscribes to the terminal store and recomputes the grid whenever the **membership/order signature** (joined ids) changes — covering add, close (from the card's X button or voice), and drag-reorder, regardless of which module mutated the store. The layout pass writes only x/y/w/h, which never changes the signature, so it cannot loop.

- [ ] **Step 1: Add `gridAnchor` to WallDoc**

In `src/store/types.ts`, add to `WallDoc`:

```ts
export type WallDoc = {
  scene: WallScene;
  terminals: SavedTerminal[];
  background: Background;
  /** World-space center of the managed terminal grid. */
  gridAnchor?: { x: number; y: number };
};
```

- [ ] **Step 2: Wire the grid into WallView**

All edits in `src/wall/WallView.tsx`:

**2a — imports.** Remove `findSpawnPoint` and `Rect` from the `./transform` import (neither is used after Step 3); add the grid module:

```ts
import { layerTransform, type Camera } from "./transform";
import { CELL, fitCamera, gridBBox, gridPositions } from "./gridLayout";
```

Delete the `const TERMINAL_SIZE = { w: 420, h: 260 };` line (CELL replaces it).

**2b — persist/restore the anchor.** In `buildDoc()`, add `gridAnchor` to the returned doc:

```ts
return {
  scene: { ... },                       // unchanged
  terminals: ...,                       // unchanged
  background: backgroundRef.current,
  gridAnchor: useTerminalStore.getState().anchor ?? undefined,
};
```

In the load effect, include the anchor in the same `setState` that installs the terminals (so the layout subscriber sees both at once):

```ts
useTerminalStore.setState({
  anchor: doc?.gridAnchor ?? null,
  terminals: (doc?.terminals ?? [])
    .filter((t) => !wasSessionDead(t.id))
    .map((t) => { ... }),               // unchanged name-assignment body
});
```

**2c — the layout pass.** Add below `applyCamera` (it uses it):

```ts
/**
 * Lays the managed grid out around the stable anchor and fits the camera
 * (zoom-out only). Writes only x/y/w/h, so the signature subscriber that
 * calls this never re-fires for layout writes.
 */
const layoutGrid = useCallback(() => {
  const { terminals, anchor } = useTerminalStore.getState();
  if (terminals.length === 0) return;
  const api = apiRef.current;
  const st = api?.getAppState() as AppStateLike | undefined;
  const screen = { w: st?.width ?? window.innerWidth, h: st?.height ?? window.innerHeight };
  const aspect = screen.w / screen.h;
  let a = anchor;
  if (!a) {
    // First layout on this wall: anchor the grid at the current viewport center.
    const vp = st ? excalidrawViewport(st) : { x: 0, y: 0, w: screen.w, h: screen.h };
    a = { x: vp.x + vp.w / 2, y: vp.y + vp.h / 2 };
    useTerminalStore.setState({ anchor: a });
  }
  const pos = gridPositions(terminals.length, aspect, a);
  useTerminalStore.setState({
    terminals: terminals.map((t, i) =>
      t.x === pos[i].x && t.y === pos[i].y && t.w === CELL.w && t.h === CELL.h
        ? t // keep referential equality so unmoved windows skip re-rendering
        : { ...t, x: pos[i].x, y: pos[i].y, w: CELL.w, h: CELL.h }
    ),
  });
  if (api && st) {
    const cam = fitCamera(gridBBox(terminals.length, aspect, a), screen);
    api.updateScene({
      appState: { scrollX: cam.x, scrollY: cam.y, zoom: { value: cam.z as NormalizedZoomValue } },
    });
    applyCamera(cam);
  }
}, [applyCamera]);

// Re-layout whenever terminal membership or order changes, from any source.
useEffect(() => {
  let prevSig = useTerminalStore.getState().terminals.map((t) => t.id).join("|");
  return useTerminalStore.subscribe((s) => {
    const sig = s.terminals.map((t) => t.id).join("|");
    if (sig === prevSig) return;
    prevSig = sig;
    layoutGrid();
  });
}, [layoutGrid]);
```

(`NormalizedZoomValue` is already imported at the top of the file; `AppStateLike` and `excalidrawViewport` come from `./excalidrawCamera`, already imported.)

- [ ] **Step 3: Simplify addTerminal**

Replace the body of `addTerminal` — spawn-point math goes away; the layout subscriber positions the new terminal:

```ts
const addTerminal = async (presetId: string) => {
  // Default cwd to the wall folder. If the path hasn't resolved yet (click during
  // the initial load), look it up on demand so agents never start in the wrong dir.
  let cwd = wallPath;
  if (!cwd) cwd = (await loadIndex()).find((w) => w.id === wallId)?.path ?? "";
  useTerminalStore.getState().add({
    id: crypto.randomUUID(),
    name: pickAgentName(useTerminalStore.getState().terminals.map((t) => t.name)),
    x: 0, y: 0, w: CELL.w, h: CELL.h, // placeholder; the grid layout positions it
    presetId, cwd,
  });
};
```

- [ ] **Step 4: focus_terminal centers the camera instead of reordering**

In the managed grid, array order IS grid order, so the old "move to end of array = bring to front" would shuffle the grid — and nothing overlaps anymore anyway. Replace the `focus_terminal` command's `description` and `run`:

```ts
useVibeCommand({
  name: "focus_terminal",
  description: "Center the view on a terminal by its agent name.",
  parameters: {
    type: "object",
    properties: { name: { type: "string", description: "Agent name shown on the terminal" } },
    required: ["name"],
  },
  run: (args) => {
    const wanted = String(args.name ?? "").toLowerCase();
    const { terminals } = useTerminalStore.getState();
    const t = terminals.find((t) => t.name.toLowerCase().includes(wanted));
    if (!t) {
      const names = terminals.map((t) => t.name).join(", ") || "none";
      return `Error: no terminal matches "${args.name}". Open terminals: ${names}.`;
    }
    const api = apiRef.current;
    const st = api?.getAppState() as AppStateLike | undefined;
    if (api && st) {
      // Center on the terminal at the current zoom (zooming out if it doesn't fit).
      const cam = fitCamera(
        { x: t.x, y: t.y, w: t.w, h: t.h },
        { w: st.width, h: st.height },
        48,
        st.zoom.value
      );
      api.updateScene({
        appState: { scrollX: cam.x, scrollY: cam.y, zoom: { value: cam.z as NormalizedZoomValue } },
      });
      applyCamera(cam);
    }
    return `Centered on terminal ${t.name}.`;
  },
});
```

- [ ] **Step 5: Typecheck + full test run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all existing tests PASS. (`findSpawnPoint` and `excalidrawViewport` are still exported and tested — removal of dead spawn code happens in Task 8.)

- [ ] **Step 6: Manual smoke test**

Run: `npx tauri dev` (or `npm run tauri dev`).
- Open a wall, launch 1 terminal → centered on screen.
- Launch a 2nd → they sit side by side, camera unchanged (still fits).
- Launch 6 → 3×2 grid, camera zoomed out so all fit with padding.
- Close one → grid compacts, camera re-fits.
- Reopen the wall → terminals restore into the same grid spot (anchor persisted).

- [ ] **Step 7: Commit**

```bash
git add src/store/types.ts src/wall/WallView.tsx
git commit -m "feat(wall): managed grid layout with auto-fit camera"
```

### Task 7: TerminalWindow — drag to reorder, no resize

**Files:**
- Modify: `src/wall/TerminalWindow.tsx`
- Modify: `src/App.css` (remove the `.terminal-resize` rule)

Drag still mutates the DOM directly per-frame (no React work), but on release it either snaps back (same slot) or commits a reorder via `moveToIndex` — which triggers the WallView layout pass that snaps everything to the grid. The resize handle is removed entirely (uniform cells).

- [ ] **Step 1: Rewrite the drag gesture, delete resize**

In `src/wall/TerminalWindow.tsx`:

**1a — imports.** Add `nearestSlotIndex`:

```ts
import { nearestSlotIndex } from "./gridLayout";
```

**1b — drop the `update` selector** (it was only used by drag/resize commits): delete the line `const update = useTerminalStore((s) => s.update);`.

**1c — replace `beginDrag`:**

```ts
// Dragging follows the cursor (DOM-only, no per-frame React work); on release
// the terminal either snaps back or commits a grid reorder via moveToIndex,
// which triggers WallView's layout pass.
const beginDrag = (e: ReactPointerEvent) => {
  e.stopPropagation();
  // Camera can't change mid-gesture: the pointer is captured by the window, not the canvas.
  const z = cameraRef.current.z;
  const sx = e.clientX, sy = e.clientY;
  const ox = terminal.x, oy = terminal.y;
  let nx = ox, ny = oy;
  const onMove = (ev: PointerEvent) => {
    nx = ox + (ev.clientX - sx) / z;
    ny = oy + (ev.clientY - sy) / z;
    const el = wrapRef.current;
    if (el) el.style.transform = `translate(${nx}px, ${ny}px)`;
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    // Snap the element back first; a reorder re-renders with new positions anyway.
    const el = wrapRef.current;
    if (el) el.style.transform = `translate(${terminal.x}px, ${terminal.y}px)`;
    const { terminals, moveToIndex } = useTerminalStore.getState();
    const slot = nearestSlotIndex(
      { x: nx + terminal.w / 2, y: ny + terminal.h / 2 },
      terminals.map((t) => ({ x: t.x, y: t.y, w: t.w, h: t.h }))
    );
    const from = terminals.findIndex((t) => t.id === id);
    if (slot !== -1 && slot !== from) moveToIndex(id, slot);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
};
```

**1d — delete `beginResize` entirely**, and delete the resize handle from the JSX:

```tsx
<div className="terminal-resize" onPointerDown={beginResize} />
```

- [ ] **Step 2: Remove the orphaned CSS**

In `src/App.css`, find and delete the `.terminal-resize { ... }` rule block (search for `terminal-resize`). Don't touch neighboring rules.

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean.

- [ ] **Step 4: Manual smoke test**

In `npx tauri dev`: open 4 terminals (2×2). Drag the top-left terminal onto the bottom-right cell → they swap and snap to the grid. Drag a terminal a few pixels and release → snaps back to its own cell. No resize handle visible in the corner.

- [ ] **Step 5: Commit**

```bash
git add src/wall/TerminalWindow.tsx src/App.css
git commit -m "feat(wall): drag reorders grid slots; remove per-terminal resize"
```

### Task 8: Remove dead spawn-point code

**Files:**
- Modify: `src/wall/transform.ts`
- Modify: `src/wall/transform.test.ts`

`findSpawnPoint` (and its private helpers) became dead in Task 6 — the grid replaced cluster-adjacent spawning. `rectsOverlap` and `unionBBox` exist only for it.

- [ ] **Step 1: Delete the dead code**

In `src/wall/transform.ts`, delete:
- the `rectsOverlap` function (and its doc comment),
- the `unionBBox` function (and its doc comment),
- the `findSpawnPoint` function (and its doc comment).

Keep `Camera`, `Rect`, `ScreenRect`, `HEADER_H`, `FOOTER_H`, `worldRectToScreen`, `layerTransform` — all still used.

- [ ] **Step 2: Delete their tests**

In `src/wall/transform.test.ts`, remove `findSpawnPoint` and `rectsOverlap` from the import and delete the entire `describe("findSpawnPoint", ...)` block. Keep the `worldRectToScreen` / `layerTransform` tests.

- [ ] **Step 3: Verify nothing else referenced them**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean. Also grep to be sure: `grep -rn "findSpawnPoint\|rectsOverlap\|unionBBox" src` → no matches.

- [ ] **Step 4: Commit**

```bash
git add src/wall/transform.ts src/wall/transform.test.ts
git commit -m "chore(wall): remove spawn-point code obsoleted by the grid"
```

### Task 9: Settings — vibe.deviceId

**Files:**
- Modify: `src/settings/settings.ts`
- Modify: `src/settings/settingsStore.ts`
- Test: `src/settings/settings.test.ts`

`deviceId` identifies this install to the proxy's quota. It lives in settings (`vibe.deviceId`), defaults to `""`, and `settingsStore.load()` generates + persists one the first time. `mergeSettings` stays pure (no UUID generation inside it).

- [ ] **Step 1: Write the failing tests**

Append to `src/settings/settings.test.ts` (match the file's existing test style — it tests `mergeSettings` with raw objects):

```ts
  it("defaults vibe.deviceId to empty and preserves a saved one", () => {
    expect(mergeSettings({}).vibe.deviceId).toBe("");
    expect(
      mergeSettings({ vibe: { deviceId: "abc-123" } }).vibe.deviceId
    ).toBe("abc-123");
    expect(mergeSettings({ vibe: { deviceId: 42 } }).vibe.deviceId).toBe("");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/settings/settings.test.ts`
Expected: FAIL — `deviceId` is undefined / type error.

- [ ] **Step 3: Implement the field**

In `src/settings/settings.ts`:

```ts
// in the Settings type:
vibe: { enabled: boolean; groqApiKey: string; hotkey: string; voice: string; deviceId: string };

// in DEFAULT_SETTINGS:
vibe: { enabled: false, groqApiKey: "", hotkey: "Ctrl+Shift+V", voice: "", deviceId: "" },

// in mergeSettings' vibe block:
deviceId: typeof vibe.deviceId === "string" ? vibe.deviceId : d.vibe.deviceId,
```

- [ ] **Step 4: Generate it on first load**

In `src/settings/settingsStore.ts`, replace `load`:

```ts
load: async () => {
  try {
    const loaded = await loadSettings();
    // First run (or pre-deviceId settings file): mint a stable anonymous id
    // for the Groq proxy quota and persist it.
    if (!loaded.vibe.deviceId) {
      loaded.vibe.deviceId = crypto.randomUUID();
      void saveSettings(loaded).catch(() => {});
    }
    set({ settings: loaded });
  } catch {
    /* keep defaults if the backend isn't reachable */
  }
},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/settings`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/settings/settings.ts src/settings/settings.test.ts src/settings/settingsStore.ts
git commit -m "feat(settings): anonymous deviceId for the groq proxy quota"
```

### Task 10: groq.ts — direct/proxy backend switch

**Files:**
- Modify: `src/vibe/groq.ts`
- Test: `src/vibe/groq.test.ts`

`transcribe`/`chat` take a `GroqAuth` union instead of a bare key string. Direct = user's own key against `api.groq.com`. Proxy = device id against the edge function. A proxy 429 means the daily allowance ran out, so it gets its own message pointing at the own-key upgrade.

- [ ] **Step 1: Update the tests (they define the contract)**

Rewrite `src/vibe/groq.test.ts`. The existing direct-path assertions stay, with `"gsk_key"` replaced by `{ kind: "direct", key: "gsk_key" }`; new proxy tests are added:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { transcribe, chat, GroqError, type GroqAuth } from "./groq";

const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const fail = (status: number) =>
  Promise.resolve(new Response("{}", { status }));

const direct: GroqAuth = { kind: "direct", key: "gsk_key" };
const proxy: GroqAuth = { kind: "proxy", deviceId: "dev-1" };

afterEach(() => vi.unstubAllGlobals());

describe("transcribe (direct)", () => {
  it("posts multipart wav to groq and returns the text", async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ text: "open a terminal" }));
    vi.stubGlobal("fetch", fetchMock);
    const text = await transcribe(new Blob(["x"], { type: "audio/wav" }), direct);
    expect(text).toBe("open a terminal");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(init.headers.Authorization).toBe("Bearer gsk_key");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("model")).toBe("whisper-large-v3-turbo");
  });

  it("maps 401 to a missing-key message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(401)));
    await expect(transcribe(new Blob(), direct)).rejects.toThrow(/groq api key/i);
  });

  it("maps 429 to a rate-limit message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(429)));
    await expect(transcribe(new Blob(), direct)).rejects.toThrow(/try again in a moment/i);
  });

  it("maps network failure to an offline message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(transcribe(new Blob(), direct)).rejects.toThrow(/couldn't reach/i);
  });
});

describe("transcribe (proxy)", () => {
  it("posts to the edge function with the device id, no Authorization", async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ text: "hi" }));
    vi.stubGlobal("fetch", fetchMock);
    await transcribe(new Blob(["x"]), proxy);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://cvithwrsgmtdajaddsab.supabase.co/functions/v1/groq-proxy/transcribe"
    );
    expect(init.headers["x-device-id"]).toBe("dev-1");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("maps proxy 429 to the daily-allowance message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(429)));
    await expect(transcribe(new Blob(), proxy)).rejects.toThrow(/own .*key|daily/i);
  });
});

describe("chat", () => {
  it("posts messages+tools to groq directly and returns the assistant message", async () => {
    const message = { role: "assistant", content: "Done!", tool_calls: undefined };
    const fetchMock = vi.fn().mockReturnValue(ok({ choices: [{ message }] }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await chat([{ role: "user", content: "hi" }], [], direct);
    expect(out).toEqual(message);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("llama-3.3-70b-versatile");
    expect(body.tool_choice).toBeUndefined(); // no tools registered -> no tool fields
  });

  it("posts to the proxy chat route when using proxy auth", async () => {
    const message = { role: "assistant", content: "Done!" };
    const fetchMock = vi.fn().mockReturnValue(ok({ choices: [{ message }] }));
    vi.stubGlobal("fetch", fetchMock);
    await chat([{ role: "user", content: "hi" }], [], proxy);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://cvithwrsgmtdajaddsab.supabase.co/functions/v1/groq-proxy/chat"
    );
    expect(init.headers["x-device-id"]).toBe("dev-1");
    expect(JSON.parse(init.body).model).toBe("llama-3.3-70b-versatile");
  });

  it("includes tools and tool_choice when tools are provided", async () => {
    const message = { role: "assistant", content: "Done!" };
    const fetchMock = vi.fn().mockReturnValue(ok({ choices: [{ message }] }));
    vi.stubGlobal("fetch", fetchMock);
    const tool = {
      type: "function" as const,
      function: { name: "noop", description: "d", parameters: { type: "object", properties: {} } },
    };
    await chat([{ role: "user", content: "hi" }], [tool], direct);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toEqual([tool]);
    expect(body.tool_choice).toBe("auto");
  });

  it("throws GroqError with status on http errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(500)));
    await expect(chat([], [], direct)).rejects.toBeInstanceOf(GroqError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/vibe/groq.test.ts`
Expected: FAIL — type errors / wrong URLs (the contract changed).

- [ ] **Step 3: Implement GroqAuth in groq.ts**

In `src/vibe/groq.ts`, replace the constants block, `describeHttp`, and `post`; update both exported functions' signatures:

```ts
const BASE = "https://api.groq.com/openai/v1";
/** Public Supabase project URL (the anon URL is not a secret; auth lives server-side). */
const PROXY_BASE = "https://cvithwrsgmtdajaddsab.supabase.co/functions/v1/groq-proxy";
export const STT_MODEL = "whisper-large-v3-turbo";
export const CHAT_MODEL = "llama-3.3-70b-versatile";

/** Direct = user's own Groq key. Proxy = bundled access via our edge function. */
export type GroqAuth =
  | { kind: "direct"; key: string }
  | { kind: "proxy"; deviceId: string };

function describeHttp(status: number, auth: GroqAuth): GroqError {
  if (status === 401) return new GroqError("I need a valid Groq API key — check Settings.", status);
  if (status === 429) {
    return auth.kind === "proxy"
      ? new GroqError(
          "I've used up today's free allowance — add your own free Groq key in Settings for unlimited use.",
          status
        )
      : new GroqError("My brain is rate-limited — try again in a moment.", status);
  }
  return new GroqError(`Groq request failed (HTTP ${status}).`, status);
}

async function post(
  directPath: string,
  proxyPath: string,
  auth: GroqAuth,
  init: RequestInit
): Promise<unknown> {
  const url = auth.kind === "direct" ? `${BASE}${directPath}` : `${PROXY_BASE}${proxyPath}`;
  const authHeaders =
    auth.kind === "direct"
      ? { Authorization: `Bearer ${auth.key}` }
      : { "x-device-id": auth.deviceId };
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...authHeaders, ...(init.headers ?? {}) } });
  } catch {
    throw new GroqError("I couldn't reach my brain — are you online?");
  }
  if (!res.ok) throw describeHttp(res.status, auth);
  return res.json();
}
```

And the two call sites:

```ts
export async function transcribe(wav: Blob, auth: GroqAuth): Promise<string> {
  const form = new FormData();
  form.append("file", wav, "utterance.wav");
  form.append("model", STT_MODEL);
  const json = (await post("/audio/transcriptions", "/transcribe", auth, {
    method: "POST",
    body: form,
  })) as { text?: string };
  return (json.text ?? "").trim();
}

export async function chat(
  messages: ChatMessage[],
  tools: ToolDef[],
  auth: GroqAuth
): Promise<AssistantMessage> {
  const json = (await post("/chat/completions", "/chat", auth, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    }),
  })) as { choices?: { message?: AssistantMessage }[] };
  const msg = json.choices?.[0]?.message;
  if (!msg) throw new GroqError("Groq returned an empty response.");
  return msg;
}
```

(Everything else in the file — `GroqError`, `ToolCall`, `ChatMessage`, `AssistantMessage` — is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/vibe/groq.test.ts`
Expected: all PASS. (`VibeAgent.tsx` will have type errors until Task 11 — that's expected; don't run `tsc` yet.)

- [ ] **Step 5: Commit**

```bash
git add src/vibe/groq.ts src/vibe/groq.test.ts
git commit -m "feat(vibe): GroqAuth switch between user key and bundled proxy"
```

### Task 11: VibeAgent + SettingsModal — key becomes optional

**Files:**
- Modify: `src/vibe/VibeAgent.tsx`
- Modify: `src/settings/SettingsModal.tsx`

- [ ] **Step 1: Build auth in VibeAgent, remove the key gates**

In `src/vibe/VibeAgent.tsx`:

**1a — import the type:**

```ts
import { transcribe, chat, type ChatMessage, type GroqAuth } from "./groq";
```

**1b — derive auth** right after `const vibe = useSettingsStore(...)`:

```ts
// Own key (unlimited, direct) when set; otherwise the bundled proxy.
const auth: GroqAuth = vibe.groqApiKey
  ? { kind: "direct", key: vibe.groqApiKey }
  : { kind: "proxy", deviceId: vibe.deviceId };
```

**1c — remove both gates:**
- In `runUtterance`, delete the line `if (!vibe.groqApiKey) { fail("I need a Groq API key — check Settings."); return; }`
- In `listen`, delete the line `if (!vibe.groqApiKey) { fail("I need a Groq API key — check Settings."); return; }`

**1d — swap the call sites:**
- In `runUtterance`: `(msgs, tools) => chat(msgs, tools, auth)` (replaces the `vibe.groqApiKey` argument).
- In `captureTranscript`: `await transcribe(wav, auth)`.

**1e — effect deps:** in the hotkey effect and the `__vibeSay` effect, replace `vibe.groqApiKey` in the dependency arrays with `vibe.groqApiKey, vibe.deviceId` (auth derives from both).

- [ ] **Step 2: Settings copy — key becomes optional**

In `src/settings/SettingsModal.tsx` (Vibe section):

Replace the `set-sub` paragraph text with:

```tsx
<p className="set-sub">
  Voice companion. Works out of the box — speech recognition and the brain run
  through our hosted gateway with a free daily allowance. Paste your own free
  Groq API key (console.groq.com) for unlimited usage. The "Vibe" wake word
  runs fully offline. Models: Llama 3.3 70B (brain) + Whisper large-v3-turbo
  (ears).
</p>
```

Replace the key row's label:

```tsx
<span className="set-label">Groq API key (optional)</span>
```

- [ ] **Step 3: Typecheck + full tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean — this closes the type break left by Task 10.

- [ ] **Step 4: Commit**

```bash
git add src/vibe/VibeAgent.tsx src/settings/SettingsModal.tsx
git commit -m "feat(vibe): voice agent works without a user key (proxy default)"
```

### Task 12: Database migration — groq_usage + bump function

**Files:**
- Create: `supabase/migrations/20260612_groq_usage.sql` (committed copy of what's applied)

Apply via the Supabase MCP tool `apply_migration` (name: `groq_usage`) against the existing project, AND save the same SQL into the repo for the record.

- [ ] **Step 1: Apply the migration**

```sql
create table if not exists public.groq_usage (
  device_id text not null,
  day date not null default current_date,
  count int not null default 0,
  primary key (device_id, day)
);

-- RLS on with NO policies: clients can't touch it; the edge function uses the
-- service role, which bypasses RLS.
alter table public.groq_usage enable row level security;

-- Atomic increment-and-read for the proxy's daily quota.
create or replace function public.bump_groq_usage(p_device_id text)
returns int
language sql
security definer
set search_path = public
as $$
  insert into groq_usage (device_id, day, count)
  values (p_device_id, current_date, 1)
  on conflict (device_id, day) do update set count = groq_usage.count + 1
  returning count;
$$;

-- Only the service role (the edge function) may call it.
revoke execute on function public.bump_groq_usage(text) from public, anon, authenticated;
grant execute on function public.bump_groq_usage(text) to service_role;
```

- [ ] **Step 2: Verify**

Via MCP `execute_sql`: `select public.bump_groq_usage('test-device');` → returns `1`; run again → `2`. Then clean up: `delete from public.groq_usage where device_id = 'test-device';`

- [ ] **Step 3: Commit the SQL copy**

Save the SQL above to `supabase/migrations/20260612_groq_usage.sql`, then:

```bash
git add supabase/migrations/20260612_groq_usage.sql
git commit -m "feat(proxy): groq_usage table + atomic bump function (applied to supabase)"
```

### Task 13: Edge function rules (pure) + tests

**Files:**
- Create: `supabase/functions/groq-proxy/rules.ts`
- Test: `supabase/functions/groq-proxy/rules.test.ts`
- Modify: `vitest.config.ts`

The request-validation and quota rules are plain TypeScript (no Deno APIs) so vitest can test them on Node.

- [ ] **Step 1: Extend vitest include**

In `vitest.config.ts`:

```ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "supabase/functions/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write the failing tests**

Create `supabase/functions/groq-proxy/rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkRequest, overQuota, DAILY_LIMIT, CHAT_MODEL, STT_MODEL } from "./rules";

describe("checkRequest", () => {
  it("allows whitelisted models on their routes", () => {
    expect(checkRequest("chat", CHAT_MODEL, "dev-1")).toBeNull();
    expect(checkRequest("transcribe", STT_MODEL, "dev-1")).toBeNull();
  });

  it("rejects missing device id with 400", () => {
    expect(checkRequest("chat", CHAT_MODEL, null)).toEqual({
      status: 400,
      message: "missing x-device-id",
    });
    expect(checkRequest("chat", CHAT_MODEL, "")).toEqual({
      status: 400,
      message: "missing x-device-id",
    });
  });

  it("rejects non-whitelisted models with 400", () => {
    expect(checkRequest("chat", "openai/gpt-oss-120b", "d")?.status).toBe(400);
    expect(checkRequest("chat", STT_MODEL, "d")?.status).toBe(400); // wrong route
    expect(checkRequest("transcribe", null, "d")?.status).toBe(400);
  });

  it("rejects unknown routes with 404", () => {
    expect(checkRequest("embeddings", CHAT_MODEL, "d")?.status).toBe(404);
  });
});

describe("overQuota", () => {
  it("allows up to the daily limit and rejects beyond it", () => {
    expect(overQuota(1)).toBe(false);
    expect(overQuota(DAILY_LIMIT)).toBe(false);
    expect(overQuota(DAILY_LIMIT + 1)).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/groq-proxy/rules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement rules.ts**

Create `supabase/functions/groq-proxy/rules.ts`:

```ts
/** Pure request rules for the groq-proxy edge function (no Deno APIs — vitest-testable). */

export const DAILY_LIMIT = 300;
export const CHAT_MODEL = "llama-3.3-70b-versatile";
export const STT_MODEL = "whisper-large-v3-turbo";

export type Rejection = { status: number; message: string };

/** null = allowed. Only the app's two models pass, and a device id is mandatory. */
export function checkRequest(
  route: string,
  model: string | null,
  deviceId: string | null
): Rejection | null {
  if (!deviceId) return { status: 400, message: "missing x-device-id" };
  if (route === "chat")
    return model === CHAT_MODEL ? null : { status: 400, message: "model not allowed" };
  if (route === "transcribe")
    return model === STT_MODEL ? null : { status: 400, message: "model not allowed" };
  return { status: 404, message: "unknown route" };
}

/** True once a device's daily count exceeds the allowance. */
export function overQuota(count: number, limit = DAILY_LIMIT): boolean {
  return count > limit;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/groq-proxy/rules.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts supabase/functions/groq-proxy/rules.ts supabase/functions/groq-proxy/rules.test.ts
git commit -m "feat(proxy): pure validation + quota rules for groq-proxy"
```

### Task 14: Edge function handler + deploy + secret (CHECKPOINT)

**Files:**
- Create: `supabase/functions/groq-proxy/index.ts`

> **CHECKPOINT — needs the user.** The `GROQ_API_KEY` secret must be set by the user (Claude must never see or invent the key). Pause and ask before the final verification step.

- [ ] **Step 1: Write the handler**

Create `supabase/functions/groq-proxy/index.ts`:

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRequest, overQuota, DAILY_LIMIT } from "./rules.ts";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const ROUTES: Record<string, string> = {
  chat: "/chat/completions",
  transcribe: "/audio/transcriptions",
};

// The Tauri webview enforces CORS like a browser; allow the headers the app sends.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function reject(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return reject(405, "method not allowed");

  const route = new URL(req.url).pathname.split("/").pop() ?? "";
  const deviceId = req.headers.get("x-device-id");

  // Pull the model out of the body (JSON for chat, multipart for transcribe)
  // and rebuild the body to forward.
  let body: BodyInit;
  let model: string | null = null;
  let contentHeaders: Record<string, string> = {};
  try {
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const json = await req.json();
      model = typeof json.model === "string" ? json.model : null;
      body = JSON.stringify(json);
      contentHeaders = { "Content-Type": "application/json" };
    } else {
      const form = await req.formData(); // re-sending FormData regenerates the multipart boundary
      const m = form.get("model");
      model = typeof m === "string" ? m : null;
      body = form;
    }
  } catch {
    return reject(400, "unreadable body");
  }

  const rejected = checkRequest(route, model, deviceId);
  if (rejected) return reject(rejected.status, rejected.message);

  const { data: count, error } = await supabase.rpc("bump_groq_usage", {
    p_device_id: deviceId,
  });
  if (error) return reject(500, "usage tracking failed");
  if (overQuota(count as number)) {
    return reject(429, `daily limit of ${DAILY_LIMIT} requests reached`);
  }

  const res = await fetch(`${GROQ_BASE}${ROUTES[route]}`, {
    method: "POST",
    headers: { ...contentHeaders, Authorization: `Bearer ${Deno.env.get("GROQ_API_KEY")}` },
    body,
  });
  return new Response(res.body, {
    status: res.status,
    headers: {
      ...CORS,
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
});
```

- [ ] **Step 2: Deploy with JWT verification off**

The app sends no Supabase JWT (the device id + quota are the gate; an anon JWT would add nothing since it's public anyway). Deploy via the Supabase MCP tool `deploy_edge_function` with `name: "groq-proxy"` and the two files (`index.ts`, `rules.ts`). If the MCP deploy doesn't expose a verify-JWT toggle, disable it in the dashboard: Edge Functions → groq-proxy → Details → "Verify JWT" off. (CLI equivalent: `supabase functions deploy groq-proxy --no-verify-jwt`.)

- [ ] **Step 3: CHECKPOINT — ask the user to set the secret**

Ask the user to set the Groq API key as a function secret (Dashboard → Edge Functions → Secrets, or `supabase secrets set GROQ_API_KEY=gsk_...`). **Do not proceed until they confirm.**

- [ ] **Step 4: Verify end to end**

```bash
curl -s -X POST "https://cvithwrsgmtdajaddsab.supabase.co/functions/v1/groq-proxy/chat" -H "Content-Type: application/json" -H "x-device-id: plan-verify" -d "{\"model\":\"llama-3.3-70b-versatile\",\"messages\":[{\"role\":\"user\",\"content\":\"say ok\"}]}"
```
Expected: 200 with a chat completion JSON.

Negative checks:
- Same call without `x-device-id` → 400.
- Same call with `"model":"openai/gpt-oss-120b"` → 400.

Then clean the verify row via MCP `execute_sql`: `delete from public.groq_usage where device_id = 'plan-verify';`

- [ ] **Step 5: Manual app smoke test**

In `npx tauri dev`, clear the Groq key field in Settings → Vibe, then use the hotkey and say "what can you do" → the pet answers (via the proxy). Paste a key back → still works (direct).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/groq-proxy/index.ts
git commit -m "feat(proxy): groq-proxy edge function (deployed, jwt off, device quota)"
```

### Task 15: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Vibe section of the README**

Find the README section describing the voice companion setup (it currently instructs getting a Groq key). Replace the key instructions with:

```markdown
### Voice companion (Vibe)

Works out of the box: speech recognition and the agent brain run through a
hosted gateway with a free daily allowance per device (300 requests/day).
For unlimited usage, grab a free API key at https://console.groq.com and
paste it in Settings → Vibe — the app then talks to Groq directly and skips
the shared allowance.

The "Vibe" wake word runs fully offline (vosk); the wake model download
instructions below are unchanged.
```

Keep the existing vosk model download instructions untouched.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: bundled voice usage + optional own Groq key"
```

---

## Post-plan verification (whole feature)

- [ ] `npx tsc --noEmit && npx vitest run` — everything green.
- [ ] `npx tauri dev` full pass: grid open/close/reorder/zoom-fit, voice agent with no key (proxy), voice agent with key (direct), new agent names appear.
- [ ] Confirm `groq_usage` rows accumulate for the app's device id (MCP `execute_sql`: `select * from public.groq_usage order by day desc limit 5;`).
