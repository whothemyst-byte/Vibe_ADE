# Terminal Split Layout + Wall→Space Rename — Design

Date: 2026-06-18
Status: Approved (pending spec review)

## Summary

Two changes to the wall/space view:

1. **Terminal split layout.** When 1–4 terminals are open (and no browser),
   they tile a fixed-size "stage" instead of growing a uniform grid and zooming
   the camera. A lone terminal fills the stage; a second splits it into two
   full-height columns; a third/fourth quarter it. The outer footprint stays
   constant, so adding a terminal subdivides the box rather than shrinking the
   whole region.

2. **Wall/canvas → Space rename.** User-facing copy that calls a workspace a
   "Wall" or "canvas" becomes "Space". Internal identifiers stay unchanged.

No Rust changes. No data-model or migration changes.

## Motivation

Terminals are fixed-size world-space cells (`CELL = 340×210`) laid out by
`gridLayout.ts` and fitted by a zoom-out-only camera. A lone terminal is
special-cased to the `BROWSER_PANE` size (704×444) so it reads large. Tracing
the current behavior:

- **n=1** → one 704×444 box (large). ✓
- **n=2** → two 340×210 cells side by side; bbox **704×210** (short). The
  occupied region shrinks vertically and the camera refits, so both terminals
  look small. ✗ — this is the reported problem.
- **n=3, n=4** → already a 2×2 quarter grid in a 704×444 box. ✓

So the box already stays 704×444 for n=1/3/4 — only **n=2** breaks the
invariant. The fix formalizes that 704×444 box as a fixed stage and tiles it.

## Approach

Add one pure function (`splitLayout`) and reroute a single branch in
`layoutGrid`. The existing uniform-grid path (`gridShape`/`gridPositions`/
`gridBBox`), the browser layout (`browserLayout`), and drag-reorder
(`nearestSlotIndex`) are left intact.

Rejected alternative: rewrite the whole grid as a recursive binary-split tiler
for all n. More unified, but it rewrites tested code and risks the browser
layout, reorder, and camera paths for no benefit at the common 1–4 counts; and
it makes cells unreadably tiny at high counts.

## Layout model — `src/wall/gridLayout.ts`

Introduce a fixed stage equal to the lone-terminal / browser-pane size:

```ts
export const STAGE = { w: BROWSER_PANE.w, h: BROWSER_PANE.h }; // 704 x 444
```

A pure function tiles the stage, centered on the anchor:

```ts
/** Tile up to 4 terminals inside the fixed STAGE rect centered on `anchor`:
 *  n=1 → full stage; n=2 → two full-height columns; n=3 → 2×2 with the 4th
 *  (bottom-right) cell empty; n=4 → full 2×2. Reading order. The bbox is the
 *  full stage for every n so the fitted camera is identical across 1–4. */
export function splitLayout(n: number, anchor: Point): { rects: Rect[]; bbox: Rect }
```

Geometry (with `GUTTER = 24`, half-width `= (704−24)/2 = 340`, half-height
`= (444−24)/2 = 210`):

```
n=1            n=2              n=3              n=4
+---------+    +----+----+      +----+----+      +----+----+
|         |    |    |    |      | T1 | T2 |      | T1 | T2 |
|   T1    |    | T1 | T2 |      +----+----+      +----+----+
|         |    |    |    |      | T3 |    |      | T3 | T4 |
+---------+    +----+----+      +----+----+      +----+----+
 704x444       340x444 each      340x210 each     340x210 each
```

- `bbox` is always the full 704×444 stage for n=1–4.
- Because gutters fall exactly on the 340/210 lines, n=4 is pixel-identical to
  today and n=1/n=3 are unchanged. Only n=2 changes (short side-by-side cells →
  full-height halves).

`stage` bbox = `{ x: anchor.x − STAGE.w/2, y: anchor.y − STAGE.h/2, w: STAGE.w,
h: STAGE.h }`.

## Wiring — `src/wall/WallView.tsx` (`layoutGrid`)

Branch selection inside `layoutGrid`:

- `hasBrowser` → `browserLayout(...)` (unchanged).
- `!hasBrowser && cards.length <= 4` → `splitLayout(cards.length, anchor)`. Its
  `rects[i]` set each terminal card's `x/y/w/h`; its `bbox` feeds `fitCamera`.
- `!hasBrowser && cards.length >= 5` → `gridPositions`/`gridBBox` with fixed
  `CELL` (unchanged) — camera zooms out to fit the grown grid.

The existing `loneTerminal`/`loneRect` special case is removed; `splitLayout(1)`
produces the identical rect (STAGE == BROWSER_PANE).

Drag-to-reorder: drop slots use the active layout's rects, so for n≤4 a dragged
terminal snaps to the tiled cells (`nearestSlotIndex` fed the `splitLayout`
rects). The exact call site in `TerminalWindow` is confirmed during planning;
behavior for the browser/≥5 paths is unchanged.

## Persistence

Terminals already persist `x/y/w/h` in `WallDoc.terminals`; varying tile sizes
need no schema change, and `layoutGrid` recomputes them on load. No migration.

## Tests (TDD) — `src/wall/gridLayout.test.ts`

Add a `splitLayout` describe block:

- **n=1**: one rect equal to the full stage, centered on the anchor.
- **n=2**: two rects; equal full-height halves (`h == STAGE.h`); one gutter
  between; combined width + gutter == STAGE.w; `rects[1].x − rects[0].x ==
  340 + GUTTER`; same `y`.
- **n=3**: three rects at 340×210 in positions TL, TR, BL; no bottom-right rect.
- **n=4**: four rects forming the full 2×2.
- **bbox invariant**: for n = 1..4, `bbox` equals the stage centered on the
  anchor (so a `fitCamera(bbox, screen)` is identical across counts).

Existing grid/browser/reorder tests stay green (those paths are untouched).

## Rename: Wall/canvas → Space

User-facing text only. Internal identifiers stay to avoid breaking persistence
and state: `WallView`, `useCardStore`, `kind: "wall"`, the `"canvas"` settings
section key, CSS class names (`wall-card`, etc.), and Vibe command `name` keys
(`exit_wall`, `open_terminal`, …).

Concrete edits:

- `src/start/StartPage.tsx`: `"Walls"` → `"Spaces"`; `1 wall / N walls` →
  `1 space / N spaces`; `"New canvas"` → `"New space"`.
- `src/auth/LoginPage.tsx`: `"Sign in to your canvas."` → `"Sign in to your
  space."`.
- `src/settings/SettingsModal.tsx`: the **Canvas** tab label and the pane
  heading → `"Space"` (keep the internal `"canvas"` section key and
  `SPACE_ONLY` membership); tidy the pane sub-copy so it doesn't say "canvas".
- `src/wall/WallView.tsx`: Vibe command *descriptions* and spoken return strings
  that say "this wall"/"the wall" → "this space"/"the space" (e.g. "Left the
  wall." → "Left the space."). Command `name` keys unchanged.

Risk: Vibe eval/registry tests may assert on copy. Run `npm test` (and the vibe
eval if affected) after the rename; adjust only assertions that check renamed
display strings.

## Scope guardrail

Everything lives in `src/wall/gridLayout.ts`, `src/wall/WallView.tsx`,
`src/wall/gridLayout.test.ts`, and the three rename files. No Rust, no schema,
no migration.

## Verification

- `npm test` green (new `splitLayout` tests + existing suite).
- Visual review via the screenshot loop (`npm run app` already running; `npm run
  shot`): confirm 1 → full box, 2 → side-by-side full-height halves in the same
  box, 3 → quarters with empty bottom-right, 4 → full 2×2, and that the outer
  box does not move between counts. Confirm start page reads "Spaces / N spaces /
  New space" and the Settings tab reads "Space".
