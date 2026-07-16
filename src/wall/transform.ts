export type Camera = { x: number; y: number; z: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type ScreenRect = { left: number; top: number; width: number; height: number };

/** Height (world px) reserved at the top of a terminal window for its header. */
export const HEADER_H = 24;

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

