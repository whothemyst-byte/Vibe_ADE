import { describe, expect, it } from "vitest";
import { excalidrawCamera, excalidrawViewport, type AppStateLike } from "./excalidrawCamera";

const appState: AppStateLike = {
  scrollX: 100,
  scrollY: 50,
  zoom: { value: 2 },
  width: 1000,
  height: 800,
};

describe("excalidraw adapters", () => {
  it("maps appState to a Camera {x:scrollX, y:scrollY, z:zoom}", () => {
    expect(excalidrawCamera(appState)).toEqual({ x: 100, y: 50, z: 2 });
  });

  it("computes the visible scene-space viewport rect", () => {
    // visible scene left = -scrollX; width = canvasWidth / zoom
    expect(excalidrawViewport(appState)).toEqual({ x: -100, y: -50, w: 500, h: 400 });
  });
});
