/** Anchored-zoom math. Pure — viewport in, viewport out. */

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
const STEP = 1.2;

export type Viewport = {
  zoom: number;
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
};

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function stepZoom(current: number, dir: 1 | -1): number {
  return clampZoom(dir === 1 ? current * STEP : current / STEP);
}

/** New zoom + scroll that keep the scene point under `anchor` (viewport px,
 *  default center) stationary: scene = v/zoom - scroll. */
export function anchoredZoom(
  view: Viewport,
  nextZoom: number,
  anchor?: { x: number; y: number },
): { zoom: number; scrollX: number; scrollY: number } {
  const z2 = clampZoom(nextZoom);
  const ax = anchor?.x ?? view.width / 2;
  const ay = anchor?.y ?? view.height / 2;
  return {
    zoom: z2,
    scrollX: view.scrollX + ax / z2 - ax / view.zoom,
    scrollY: view.scrollY + ay / z2 - ay / view.zoom,
  };
}
