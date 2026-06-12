import { describe, expect, it } from "vitest";
import { worldRectToScreen, layerTransform, type Camera, type Rect } from "./transform";

const rect: Rect = { x: 10, y: 20, w: 100, h: 50 };

describe("worldRectToScreen", () => {
  it("is identity at zoom 1 with no pan", () => {
    const cam: Camera = { x: 0, y: 0, z: 1 };
    expect(worldRectToScreen(rect, cam)).toEqual({ left: 10, top: 20, width: 100, height: 50 });
  });

  it("scales position and size by zoom", () => {
    const cam: Camera = { x: 0, y: 0, z: 2 };
    expect(worldRectToScreen(rect, cam)).toEqual({ left: 20, top: 40, width: 200, height: 100 });
  });

  it("applies camera pan before zoom", () => {
    const cam: Camera = { x: 5, y: -10, z: 2 };
    // left = (10 + 5) * 2 = 30 ; top = (20 - 10) * 2 = 20
    expect(worldRectToScreen(rect, cam)).toEqual({ left: 30, top: 20, width: 200, height: 100 });
  });
});

describe("layerTransform", () => {
  it("scale-then-translate reproduces worldRectToScreen", () => {
    const cam = { x: 120, y: -40, z: 1.5 };
    expect(layerTransform(cam)).toBe("scale(1.5) translate(120px, -40px)");
    // CSS right-to-left order: p -> translate -> scale = (p + cam) * z,
    // which is exactly worldRectToScreen's mapping for the rect origin.
    const r = { x: 10, y: 20, w: 100, h: 50 };
    const screen = worldRectToScreen(r, cam);
    expect((r.x + cam.x) * cam.z).toBe(screen.left);
    expect((r.y + cam.y) * cam.z).toBe(screen.top);
  });
});
