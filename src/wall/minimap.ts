import type { Rect } from "./transform";

/**
 * Projects world-space card rects + the camera viewport into a fixed minimap
 * box: union bounds, uniform scale (fit), centered. toWorld inverts a minimap
 * point back to world coordinates for click-to-jump.
 */
export function minimapProject(
  cards: Rect[],
  viewport: Rect,
  box: { w: number; h: number; pad: number }
): { cards: Rect[]; viewport: Rect; toWorld: (p: { x: number; y: number }) => { x: number; y: number } } {
  const all = [...cards, viewport];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of all) {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const scale = Math.min((box.w - 2 * box.pad) / bw, (box.h - 2 * box.pad) / bh);
  const ox = (box.w - bw * scale) / 2 - x0 * scale;
  const oy = (box.h - bh * scale) / 2 - y0 * scale;
  const map = (r: Rect): Rect => ({ x: r.x * scale + ox, y: r.y * scale + oy, w: r.w * scale, h: r.h * scale });
  return {
    cards: cards.map(map),
    viewport: map(viewport),
    toWorld: (p) => ({ x: (p.x - ox) / scale, y: (p.y - oy) / scale }),
  };
}
