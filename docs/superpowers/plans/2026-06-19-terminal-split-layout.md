# Terminal Split Layout + Wall→Space Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 1–4 terminals tile a fixed-size box (1 full, 2 side-by-side columns, 3–4 quartered) instead of shrinking the whole region, and rename user-facing "Wall"/"canvas" to "Space".

**Architecture:** Add one pure function `splitLayout(n, anchor)` to `gridLayout.ts` that tiles a fixed 704×444 `STAGE` for n=1–4 (bbox constant so the fitted camera never shifts), and reroute a single branch in `WallView.tsx`'s `layoutGrid` to use it. The browser layout and the ≥5-terminal uniform grid are untouched; drag-reorder needs no change because it reads cards' live rects. The rename touches only display strings.

**Tech Stack:** TypeScript, React 19, Zustand, Excalidraw, Vitest. Tauri desktop app (verify visually via `npm run shot`).

Spec: `docs/superpowers/specs/2026-06-18-terminal-split-layout-design.md`

---

## File Structure

- `scripts/screenshot.ps1` (already created) — dev screenshot capture; committed in Task 1.
- `src/wall/gridLayout.ts` — add `STAGE` constant + `splitLayout()` pure function (Task 2).
- `src/wall/gridLayout.test.ts` — add `splitLayout` test block (Task 2).
- `src/wall/WallView.tsx` — reroute `layoutGrid` to `splitLayout` for the no-browser n≤4 case; remove the `loneRect` special case; fix imports (Task 3).
- `src/start/StartPage.tsx`, `src/auth/LoginPage.tsx`, `src/settings/SettingsModal.tsx`, `src/wall/WallView.tsx` — Wall/canvas → Space display strings (Task 4).

No Rust, no data-model, no migration changes. `src/wall/TerminalWindow.tsx` and `src/wall/BrowserWindow.tsx` are intentionally untouched (their reorder feeds `nearestSlotIndex` the cards' live rects, which already reflect the new layout).

---

### Task 1: Commit the dev screenshot tooling

Already implemented and verified earlier; commit it as a clean baseline before the feature work.

**Files:**
- Add: `scripts/screenshot.ps1`
- Modify: `package.json` (the `app` + `shot` scripts), `.gitignore` (the `.dev/` ignore)

- [ ] **Step 1: Stage only the screenshot-tooling files**

```bash
git add scripts/screenshot.ps1 package.json .gitignore
```

- [ ] **Step 2: Verify the staged diff is only the tooling**

Run: `git status --short`
Expected: `scripts/screenshot.ps1`, `package.json`, `.gitignore` staged; no other files added (leave `graphify-out/`, `.claude/`, `CLAUDE.md` untracked — not ours to commit).

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(dev): screenshot capture loop for the Tauri window

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Add `STAGE` + `splitLayout` to gridLayout (TDD)

**Files:**
- Modify: `src/wall/gridLayout.ts`
- Test: `src/wall/gridLayout.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this import to the existing import block at the top of `src/wall/gridLayout.test.ts` (add `STAGE` and `splitLayout` to the names imported from `./gridLayout`):

```ts
import {
  gridShape,
  gridPositions,
  gridBBox,
  fitCamera,
  nearestSlotIndex,
  browserLayout,
  splitLayout,
  STAGE,
  BROWSER_PANE,
  CELL,
  GUTTER,
} from "./gridLayout";
```

Append this describe block to the end of `src/wall/gridLayout.test.ts`:

```ts
describe("splitLayout", () => {
  const A = { x: 0, y: 0 };
  const stageRect = { x: -STAGE.w / 2, y: -STAGE.h / 2, w: STAGE.w, h: STAGE.h };
  const HALF_W = (STAGE.w - GUTTER) / 2;
  const HALF_H = (STAGE.h - GUTTER) / 2;

  it("fills the whole stage with one terminal", () => {
    const L = splitLayout(1, A);
    expect(L.rects).toEqual([stageRect]);
    expect(L.bbox).toEqual(stageRect);
  });

  it("splits two terminals into full-height columns", () => {
    const L = splitLayout(2, A);
    expect(L.rects).toHaveLength(2);
    expect(L.rects[0]).toEqual({ x: stageRect.x, y: stageRect.y, w: HALF_W, h: STAGE.h });
    expect(L.rects[1]).toEqual({ x: stageRect.x + HALF_W + GUTTER, y: stageRect.y, w: HALF_W, h: STAGE.h });
    expect(L.rects[0].w + GUTTER + L.rects[1].w).toBe(STAGE.w);
    expect(L.bbox).toEqual(stageRect);
  });

  it("quarters three terminals and leaves the bottom-right empty", () => {
    const L = splitLayout(3, A);
    expect(L.rects).toHaveLength(3);
    expect(L.rects[0]).toEqual({ x: stageRect.x, y: stageRect.y, w: HALF_W, h: HALF_H }); // TL
    expect(L.rects[1]).toEqual({ x: stageRect.x + HALF_W + GUTTER, y: stageRect.y, w: HALF_W, h: HALF_H }); // TR
    expect(L.rects[2]).toEqual({ x: stageRect.x, y: stageRect.y + HALF_H + GUTTER, w: HALF_W, h: HALF_H }); // BL
    expect(L.bbox).toEqual(stageRect);
  });

  it("fills the full 2x2 with four terminals", () => {
    const L = splitLayout(4, A);
    expect(L.rects).toHaveLength(4);
    expect(L.rects[3]).toEqual({
      x: stageRect.x + HALF_W + GUTTER,
      y: stageRect.y + HALF_H + GUTTER,
      w: HALF_W,
      h: HALF_H,
    }); // BR
    expect(L.bbox).toEqual(stageRect);
  });

  it("keeps an identical bbox across 1–4 so the camera never shifts", () => {
    for (const n of [1, 2, 3, 4]) {
      expect(splitLayout(n, A).bbox).toEqual(stageRect);
    }
  });

  it("centers the stage on a non-origin anchor", () => {
    const L = splitLayout(2, { x: 100, y: -50 });
    expect(L.bbox).toEqual({ x: 100 - STAGE.w / 2, y: -50 - STAGE.h / 2, w: STAGE.w, h: STAGE.h });
  });

  it("derives quartered cells that equal CELL", () => {
    expect(HALF_W).toBe(CELL.w);
    expect(HALF_H).toBe(CELL.h);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/wall/gridLayout.test.ts`
Expected: FAIL — `splitLayout`/`STAGE` are not exported (`splitLayout is not a function` / import error).

- [ ] **Step 3: Implement `STAGE` + `splitLayout`**

In `src/wall/gridLayout.ts`, immediately after the `BROWSER_PANE` constant (around line 74), add:

```ts
/** The fixed footprint a 1–4 terminal layout tiles, centered on the anchor.
 *  Equals the lone-terminal / browser-pane size, so a single terminal reads
 *  large and 2–4 subdivide that same box. */
export const STAGE = { w: BROWSER_PANE.w, h: BROWSER_PANE.h };

/**
 * Tile 1–4 terminals inside the fixed STAGE rect centered on `anchor`:
 *   n=1 → full stage; n=2 → two full-height columns; n=3 → 2×2 with the
 *   bottom-right cell empty; n=4 → full 2×2. Reading order. The bbox is the
 *   full stage for every n, so a fitted camera is identical across 1–4.
 *  Caller guarantees 1 ≤ n ≤ 4.
 */
export function splitLayout(n: number, anchor: Point): { rects: Rect[]; bbox: Rect } {
  const bbox: Rect = {
    x: anchor.x - STAGE.w / 2,
    y: anchor.y - STAGE.h / 2,
    w: STAGE.w,
    h: STAGE.h,
  };
  const halfW = (STAGE.w - GUTTER) / 2;
  const halfH = (STAGE.h - GUTTER) / 2;
  const colX = bbox.x + halfW + GUTTER;
  const rowY = bbox.y + halfH + GUTTER;

  let rects: Rect[];
  if (n <= 1) {
    rects = [{ x: bbox.x, y: bbox.y, w: STAGE.w, h: STAGE.h }];
  } else if (n === 2) {
    rects = [
      { x: bbox.x, y: bbox.y, w: halfW, h: STAGE.h },
      { x: colX, y: bbox.y, w: halfW, h: STAGE.h },
    ];
  } else {
    // n === 3 or 4: 2×2 quarters in reading order; n=3 leaves bottom-right empty.
    const quads: Rect[] = [
      { x: bbox.x, y: bbox.y, w: halfW, h: halfH }, // TL
      { x: colX, y: bbox.y, w: halfW, h: halfH }, // TR
      { x: bbox.x, y: rowY, w: halfW, h: halfH }, // BL
      { x: colX, y: rowY, w: halfW, h: halfH }, // BR
    ];
    rects = quads.slice(0, n);
  }
  return { rects, bbox };
}
```

(`Rect` and `Point` are already in scope: `Rect` is imported from `./transform` at the top of the file, `Point` is defined locally.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/wall/gridLayout.test.ts`
Expected: PASS — all `splitLayout` tests plus the existing `gridShape`/`gridPositions`/`gridBBox`/`browserLayout`/`nearestSlotIndex` tests.

- [ ] **Step 5: Commit**

```bash
git add src/wall/gridLayout.ts src/wall/gridLayout.test.ts
git commit -m "feat(wall): splitLayout tiler for 1-4 terminals in a fixed stage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire `splitLayout` into `layoutGrid`

**Files:**
- Modify: `src/wall/WallView.tsx` (import line 16; `layoutGrid` body, ~lines 248-301)

- [ ] **Step 1: Update the gridLayout import**

In `src/wall/WallView.tsx` line 16, replace:

```ts
import { browserLayout, BROWSER_PANE, CELL, fitCamera, gridBBox, gridPositions } from "./gridLayout";
```

with (drop now-unused `BROWSER_PANE`, add `splitLayout`):

```ts
import { browserLayout, CELL, fitCamera, gridBBox, gridPositions, splitLayout } from "./gridLayout";
```

- [ ] **Step 2: Replace the lone-terminal block with the split branch**

In `layoutGrid`, replace this block (currently ~lines 262-284):

```ts
    // With a browser open it becomes the dominant left pane and terminals
    // stack in columns of two beside it; otherwise the uniform grid applies.
    const hasBrowser = cards.some((c) => c.kind === "browser");
    // A lone terminal gets the dominant browser-pane size so it doesn't float
    // tiny in the middle of the screen — it reads at the same scale the browser
    // does. Text/chrome stay native px (the camera only ever zooms out to fit).
    const loneTerminal = !hasBrowser && cards.length === 1;
    const loneRect = loneTerminal
      ? { x: a.x - BROWSER_PANE.w / 2, y: a.y - BROWSER_PANE.h / 2, w: BROWSER_PANE.w, h: BROWSER_PANE.h }
      : null;
    const bl = hasBrowser ? browserLayout(cards.length - 1, a) : null;
    const pos = bl || loneRect ? null : gridPositions(cards.length, aspect, a);
    let ti = 0;
    const rectOf = (c: Card, i: number): { x: number; y: number; w: number; h: number } => {
      if (loneRect) return loneRect;
      if (bl) {
        if (c.kind === "browser") return bl.browser;
        const p = bl.terminals[ti++];
        return { x: p.x, y: p.y, w: CELL.w, h: CELL.h };
      }
      const p = pos![i];
      return { x: p.x, y: p.y, w: CELL.w, h: CELL.h };
    };
```

with:

```ts
    // With a browser open it becomes the dominant left pane and terminals stack
    // in columns of two beside it. With no browser and 1–4 terminals, they tile
    // a fixed stage (1 full, 2 columns, 3–4 quartered). Otherwise (5+) the
    // uniform grid grows and the camera zooms out to fit.
    const hasBrowser = cards.some((c) => c.kind === "browser");
    const split = !hasBrowser && cards.length <= 4 ? splitLayout(cards.length, a) : null;
    const bl = hasBrowser ? browserLayout(cards.length - 1, a) : null;
    const pos = split || bl ? null : gridPositions(cards.length, aspect, a);
    let ti = 0;
    const rectOf = (c: Card, i: number): { x: number; y: number; w: number; h: number } => {
      if (split) return split.rects[i];
      if (bl) {
        if (c.kind === "browser") return bl.browser;
        const p = bl.terminals[ti++];
        return { x: p.x, y: p.y, w: CELL.w, h: CELL.h };
      }
      const p = pos![i];
      return { x: p.x, y: p.y, w: CELL.w, h: CELL.h };
    };
```

(When `split` is non-null there is no browser, so every card is a terminal and `i` is its reading-order index — `split.rects[i]` is always defined for `i < cards.length ≤ 4`.)

- [ ] **Step 3: Update the bbox line to use the split bbox**

In the same function, replace (currently ~line 294):

```ts
      const bbox = loneRect ?? (bl ? bl.bbox : gridBBox(cards.length, aspect, a));
```

with:

```ts
      const bbox = split ? split.bbox : bl ? bl.bbox : gridBBox(cards.length, aspect, a);
```

- [ ] **Step 4: Typecheck (no unused imports, no type errors)**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms `BROWSER_PANE` removal left nothing dangling and `splitLayout` types line up.)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (no behavior tests cover `layoutGrid` directly; this confirms nothing else broke).

- [ ] **Step 6: Visual verification via the screenshot loop**

The dev app is running (`npm run app`). In a space, open terminals one at a time and capture after each:

Run: `npm run shot`, then view `.dev/shots/latest.png`. Repeat for 1, 2, 3, 4 terminals.
Expected: 1 → one large box; 2 → two equal full-height columns inside the **same** box; 3 → quarters with bottom-right empty; 4 → full 2×2. The outer box does not move/resize between counts. (If a Rust rebuild is needed it isn't — these are React-only edits, hot-reloaded.)

- [ ] **Step 7: Commit**

```bash
git add src/wall/WallView.tsx
git commit -m "feat(wall): tile 1-4 terminals in a fixed stage via splitLayout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Rename Wall/canvas → Space (display strings)

**Files:**
- Modify: `src/start/StartPage.tsx`, `src/auth/LoginPage.tsx`, `src/settings/SettingsModal.tsx`, `src/wall/WallView.tsx`

- [ ] **Step 1: StartPage heading, count, and button**

In `src/start/StartPage.tsx`:

Replace (line ~70):
```tsx
          <h1 className="start-title">Walls</h1>
          <span className="start-sub">{walls.length} {walls.length === 1 ? "wall" : "walls"}</span>
```
with:
```tsx
          <h1 className="start-title">Spaces</h1>
          <span className="start-sub">{walls.length} {walls.length === 1 ? "space" : "spaces"}</span>
```

Replace (line ~84):
```tsx
          <span>New canvas</span>
```
with:
```tsx
          <span>New space</span>
```

(Leave class names like `wall-card`, `new-canvas`, and the `walls` variable — internal.)

- [ ] **Step 2: LoginPage subtitle**

In `src/auth/LoginPage.tsx` (line ~132), replace:
```tsx
            : "Sign in to your canvas."}
```
with:
```tsx
            : "Sign in to your space."}
```

- [ ] **Step 3: Settings "Canvas" tab label + pane copy**

In `src/settings/SettingsModal.tsx`:

Replace the APP_SECTIONS entry (line ~32):
```tsx
  { key: "canvas", label: "Canvas", icon: ImageIcon },
```
with (keep the `"canvas"` key — only the visible label changes):
```tsx
  { key: "canvas", label: "Space", icon: ImageIcon },
```

Replace the pane heading + sub-copy (lines ~351-352):
```tsx
      <h2 className="set-title">Canvas</h2>
      <p className="set-sub">Space-level canvas behavior. Theme the current space from the Themes tab.</p>
```
with:
```tsx
      <h2 className="set-title">Space</h2>
      <p className="set-sub">Background and behavior for this space. Theme it from the Themes tab.</p>
```

(Leave the `"canvas"` section key, the `Section` type, `SPACE_ONLY`, and `settings.canvas.*` — internal/persisted.)

- [ ] **Step 4: Vibe spoken/description copy in WallView**

In `src/wall/WallView.tsx`, update user-facing "wall" wording in Vibe command text (keep the command `name` keys like `open_terminal`, `apply_theme`, `open_browser`, `close_browser`, `browser_back`, `change_background`, `exit_wall` unchanged):

- `open_terminal` description: `"Spawn a new agent terminal on this wall. ..."` → `"...on this space. ..."`
- `apply_theme` description: `"Apply a pre-made theme to this wall. ..."` → `"...to this space. ..."`
- `close_terminal` description: `"Close a terminal on this wall by its agent name (e.g. 'Ada')."` → `"...on this space by its agent name (e.g. 'Ada')."`
- `send_to_terminal` description: `"Type a prompt or command into a terminal on this wall and press Enter ..."` → `"...into a terminal on this space and press Enter ..."`
- `open_browser` description: `"Open the wall's browser at a URL, ..."` → `"Open the space's browser at a URL, ..."`
- `close_browser` description: `"Close the wall's browser window."` → `"Close the space's browser window."`
- `browser_back` description: `"Go back one page in the wall browser's history."` → `"...in the space browser's history."`
- `read_browser` description: `"Read the current page in the wall's browser. ..."` → `"...in the space's browser. ..."`
- `change_background` description: `"Set this wall's background to a solid color. ..."` → `"Set this space's background to a solid color. ..."`
- `exit_wall` description: `"Leave this wall and return to the start page (saves first)."` → `"Leave this space and return to the start page (saves first)."`
- `exit_wall` return string: `return "Left the wall.";` → `return "Left the space.";`

- [ ] **Step 5: Toolbar fallback + TaskBoard space labels**

In `src/wall/Toolbar.tsx` (line ~20), replace the no-name fallback:
```tsx
        {current?.name ?? "Wall"} <span className="cnvs-caret"><ChevronDownIcon /></span>
```
with:
```tsx
        {current?.name ?? "Space"} <span className="cnvs-caret"><ChevronDownIcon /></span>
```

In `src/tasks/TaskBoard.tsx` (lines ~128 and ~137), replace:
```tsx
          <button className="tb-chip" onClick={() => onOpenWall(linkedWall.id)} title="Open wall">
```
with:
```tsx
          <button className="tb-chip" onClick={() => onOpenWall(linkedWall.id)} title="Open space">
```
and:
```tsx
          <option value="">{linkedWall ? "Change wall…" : "Link wall…"}</option>
```
with:
```tsx
          <option value="">{linkedWall ? "Change space…" : "Link space…"}</option>
```

(Leave the `onOpenWall`/`linkedWall` identifiers — internal.)

- [ ] **Step 6: Confirm no test asserts on the renamed strings**

Run: `npm test`
Expected: PASS. If any test fails on a renamed display string, update that assertion to the new "space" wording (do not revert the rename). Note: `vibe:eval` (`npm run vibe:eval`) is a live/networked eval, not part of `npm test`; skip it.

- [ ] **Step 7: Typecheck and visual check**

Run: `npx tsc --noEmit`
Expected: no errors.
Then `npm run shot` on the start page and the Settings modal; confirm "Spaces", "N spaces", "New space", and the Settings "Space" tab read correctly.

- [ ] **Step 8: Commit**

```bash
git add src/start/StartPage.tsx src/auth/LoginPage.tsx src/settings/SettingsModal.tsx src/wall/WallView.tsx src/wall/Toolbar.tsx src/tasks/TaskBoard.tsx
git commit -m "feat(ui): rename Wall/canvas to Space in user-facing copy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Refresh the graphify graph

- [ ] **Step 1: Update the knowledge graph (AST-only, no API cost)**

Run: `graphify update .`
Expected: completes; `graphify-out/` reflects the new `splitLayout` symbol. (Per project CLAUDE.md. `graphify-out/` is untracked — do not commit it here.)

