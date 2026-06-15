import type { Camera, Rect } from "./transform";

/** Fixed terminal cell size (world px) — terminals are uniform in the grid. */
export const CELL = { w: 340, h: 210 };
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

/** Browser pane: spans a 2x2 block of the terminal cell grid. */
export const BROWSER_PANE = {
  w: 2 * CELL.w + GUTTER,
  h: 2 * CELL.h + GUTTER,
};

/**
 * Layout when a browser is open: the browser is the dominant pane on the
 * left; terminals stack right of it in columns of two (column-major), tops
 * aligned, so a full column sits flush with the pane. The whole block is
 * centered on `anchor`.
 */
export function browserLayout(
  nTerminals: number,
  anchor: Point
): { browser: Rect; terminals: Point[]; bbox: Rect } {
  const cols = Math.ceil(nTerminals / 2);
  const w = BROWSER_PANE.w + cols * (CELL.w + GUTTER);
  const h = BROWSER_PANE.h;
  const x = anchor.x - w / 2;
  const y = anchor.y - h / 2;
  const browser = { x, y, w: BROWSER_PANE.w, h: BROWSER_PANE.h };
  const terminals = Array.from({ length: nTerminals }, (_, i) => ({
    x: x + BROWSER_PANE.w + GUTTER + Math.floor(i / 2) * (CELL.w + GUTTER),
    y: y + (i % 2) * (CELL.h + GUTTER),
  }));
  return { browser, terminals, bbox: { x, y, w, h } };
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
