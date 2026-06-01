export type Camera = { x: number; y: number; z: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type ScreenRect = { left: number; top: number; width: number; height: number };

/** Height (world px) reserved at the top of a terminal window for its header. */
export const HEADER_H = 28;

/** tldraw page-space rect -> screen-space CSS rect: screen = (page + camera) * zoom. */
export function worldRectToScreen(rect: Rect, cam: Camera): ScreenRect {
  return {
    left: (rect.x + cam.x) * cam.z,
    top: (rect.y + cam.y) * cam.z,
    width: rect.w * cam.z,
    height: rect.h * cam.z,
  };
}
