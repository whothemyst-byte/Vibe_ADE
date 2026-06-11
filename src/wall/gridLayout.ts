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
