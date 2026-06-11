export type Camera = { x: number; y: number; z: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type ScreenRect = { left: number; top: number; width: number; height: number };

/** Height (world px) reserved at the top of a terminal window for its header. */
export const HEADER_H = 28;

/**
 * tldraw page-space rect -> screen-space CSS rect: screen = (page + camera) * zoom.
 *
 * NOTE: This omits tldraw's `screenBounds` origin offset. It is correct ONLY because
 * the tldraw canvas and the terminal overlay both use `inset: 0` from the same root,
 * so the viewport origin is always (0, 0). If the canvas ever gets an inset (i.e.
 * screenBounds.x/y != 0), add the viewport screen-bounds origin here.
 */
export function worldRectToScreen(rect: Rect, cam: Camera): ScreenRect {
  return {
    left: (rect.x + cam.x) * cam.z,
    top: (rect.y + cam.y) * cam.z,
    width: rect.w * cam.z,
    height: rect.h * cam.z,
  };
}

/** Height (world px) of the terminal card's status footer. */
export const FOOTER_H = 22;

/**
 * CSS transform for the world-space terminal layer. Children positioned at raw
 * world coordinates land at screen = (world + cam) * z, matching worldRectToScreen.
 * (CSS applies transforms right-to-left: translate first, then scale.)
 */
export function layerTransform(cam: Camera): string {
  return `scale(${cam.z}) translate(${cam.x}px, ${cam.y}px)`;
}

/** True if rects a and b overlap, treating `gap` px around each as occupied. */
export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

/** Returns the union bounding box of a non-empty array of rects. */
function unionBBox(rects: Rect[]): Rect {
  let minX = rects[0].x;
  let minY = rects[0].y;
  let maxRight = rects[0].x + rects[0].w;
  let maxBottom = rects[0].y + rects[0].h;
  for (let i = 1; i < rects.length; i++) {
    const r = rects[i];
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.w > maxRight) maxRight = r.x + r.w;
    if (r.y + r.h > maxBottom) maxBottom = r.y + r.h;
  }
  return { x: minX, y: minY, w: maxRight - minX, h: maxBottom - minY };
}

/**
 * Pick a top-left page-space point for a new `size` rect that lands adjacent to
 * the cluster of existing obstacle rects, without overlapping any of them.
 *
 * Strategy ("cluster-adjacent"):
 *  - No obstacles → return viewport-centered position.
 *  - Otherwise compute the union bbox of all obstacles and try four candidate
 *    positions adjacent to the cluster (right, below, left, above) in that order,
 *    returning the first that does not overlap any obstacle. If all four overlap
 *    (degenerate case), returns the right candidate.
 */
export function findSpawnPoint(
  viewport: Rect,
  obstacles: Rect[],
  size: { w: number; h: number },
  gap = 24
): { x: number; y: number } {
  const { w, h } = size;

  if (obstacles.length === 0) {
    return {
      x: viewport.x + (viewport.w - w) / 2,
      y: viewport.y + (viewport.h - h) / 2,
    };
  }

  const union = unionBBox(obstacles);
  const clusterLeft = union.x;
  const clusterTop = union.y;
  const clusterRight = union.x + union.w;
  const clusterBottom = union.y + union.h;

  const candidates = [
    { x: clusterRight + gap, y: clusterTop },
    { x: clusterLeft, y: clusterBottom + gap },
    { x: clusterLeft - w - gap, y: clusterTop },
    { x: clusterLeft, y: clusterTop - h - gap },
  ];

  const free = (x: number, y: number) =>
    !obstacles.some((r) => rectsOverlap({ x, y, w, h }, r, gap));

  for (const candidate of candidates) {
    if (free(candidate.x, candidate.y)) return candidate;
  }

  // Fallback: right candidate (by construction never overlaps, but guard anyway)
  return candidates[0];
}
