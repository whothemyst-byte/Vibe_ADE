import type { Camera, Rect } from "./transform";

/** The subset of Excalidraw's AppState we read. */
export type AppStateLike = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  width: number;
  height: number;
};

/** Excalidraw appState -> Camera for worldRectToScreen (screen = (scene + scroll) * zoom). */
export function excalidrawCamera(s: AppStateLike): Camera {
  return { x: s.scrollX, y: s.scrollY, z: s.zoom.value };
}

/** The visible region in SCENE coordinates, for spawn placement. */
export function excalidrawViewport(s: AppStateLike): Rect {
  return {
    x: -s.scrollX,
    y: -s.scrollY,
    w: s.width / s.zoom.value,
    h: s.height / s.zoom.value,
  };
}
