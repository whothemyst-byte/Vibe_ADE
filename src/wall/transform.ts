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

/** True if rects a and b overlap, treating `gap` px around each as occupied. */
export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

/**
 * Pick a top-left page-space point for a new `size` rect inside the current
 * `viewport` (page space) that does not overlap any `existing` rect. Prefers the
 * viewport center (the focused area); if that's occupied, scans a grid within the
 * viewport for the first free, fully-visible slot; if the viewport is full, cascades
 * from center so the new window still lands near the focus.
 */
export function findSpawnPoint(
  viewport: Rect,
  existing: Rect[],
  size: { w: number; h: number },
  gap = 12
): { x: number; y: number } {
  const { w, h } = size;
  const free = (x: number, y: number) =>
    !existing.some((r) => rectsOverlap({ x, y, w, h }, r, gap));

  const centered = {
    x: viewport.x + (viewport.w - w) / 2,
    y: viewport.y + (viewport.h - h) / 2,
  };
  if (free(centered.x, centered.y)) return centered;

  const pad = 16;
  const step = 40;
  for (let y = viewport.y + pad; y + h <= viewport.y + viewport.h - pad; y += step) {
    for (let x = viewport.x + pad; x + w <= viewport.x + viewport.w - pad; x += step) {
      if (free(x, y)) return { x, y };
    }
  }

  // Viewport is full — cascade from center so it's still near the focus.
  const n = existing.length;
  return { x: centered.x + n * 28, y: centered.y + n * 28 };
}
