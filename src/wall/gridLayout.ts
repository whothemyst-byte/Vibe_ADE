import { HEADER_H, type Camera, type Rect } from "./transform";

/** Fixed terminal cell size (world px) — terminals are uniform in the grid. */
export const CELL = { w: 600, h: 440 };
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
  if (n === 1) {
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

/** Floor on the vertical offset between successive cards in the maximize
 *  deck — never shrinks past a full header, so each card's header stays
 *  legible and clickable above the one overlapping it from below. */
const DECK_MIN_PEEK = HEADER_H;

/**
 * Layout when one terminal is maximized: the maximized card fills the full
 * STAGE and the remaining cards form a peek stack to its right, spaced to
 * exactly fill the stage's height — a couple of terminals spread out with
 * room between them instead of clumping small, while enough terminals to
 * outgrow the stage fall back to DECK_MIN_PEEK overlapping tabs (array
 * order, so later cards render on top and overlap the ones above).
 */
export function maximizeLayout(
  maximizedIndex: number,
  totalCards: number,
  anchor: Point
): { rects: Rect[]; bbox: Rect } {
  const othersCount = totalCards - 1;
  const peek = othersCount > 1 ? Math.max(DECK_MIN_PEEK, (STAGE.h - CELL.h) / (othersCount - 1)) : 0;
  const deckH = othersCount > 0 ? CELL.h + (othersCount - 1) * peek : 0;
  const rightColW = othersCount > 0 ? GUTTER + CELL.w : 0;
  const totalW = STAGE.w + rightColW;
  const totalH = Math.max(STAGE.h, deckH);
  const x0 = anchor.x - totalW / 2;
  const y0 = anchor.y - totalH / 2;
  const maxRect: Rect = { x: x0, y: anchor.y - STAGE.h / 2, w: STAGE.w, h: STAGE.h };
  const deckX = x0 + STAGE.w + GUTTER;
  const deckY = y0 + (totalH - deckH) / 2;
  const rects: Rect[] = [];
  let otherIdx = 0;
  for (let i = 0; i < totalCards; i++) {
    if (i === maximizedIndex) {
      rects.push(maxRect);
    } else {
      rects.push({ x: deckX, y: deckY + otherIdx * peek, w: CELL.w, h: CELL.h });
      otherIdx++;
    }
  }
  return { rects, bbox: { x: x0, y: y0, w: totalW, h: totalH } };
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
