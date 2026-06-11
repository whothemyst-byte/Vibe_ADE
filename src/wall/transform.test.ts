import { describe, expect, it } from "vitest";
import {
  worldRectToScreen,
  findSpawnPoint,
  rectsOverlap,
  layerTransform,
  type Camera,
  type Rect,
} from "./transform";

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

describe("findSpawnPoint", () => {
  const viewport: Rect = { x: 0, y: 0, w: 2000, h: 1400 };
  const size = { w: 420, h: 260 };

  it("centers in viewport when there are no obstacles", () => {
    expect(findSpawnPoint(viewport, [], size)).toEqual({
      x: (2000 - 420) / 2,
      y: (1400 - 260) / 2,
    });
  });

  it("places the new window adjacent-right of a single obstacle with the gap, no overlap", () => {
    const obstacle: Rect = { x: 100, y: 100, w: 420, h: 260 };
    const got = findSpawnPoint(viewport, [obstacle], size);
    // Expected: right of cluster
    expect(got).toEqual({ x: 100 + 420 + 24, y: 100 });
    const newRect: Rect = { x: got.x, y: got.y, w: size.w, h: size.h };
    expect(rectsOverlap(newRect, obstacle, 24)).toBe(false);
  });

  it("anchors to the union of multiple obstacles (placed right of the cluster), overlapping none", () => {
    const obstacles: Rect[] = [
      { x: 0, y: 0, w: 420, h: 260 },
      { x: 500, y: 300, w: 420, h: 260 },
    ];
    // Union right = 500 + 420 = 920; expected x = 920 + 24 = 944
    const got = findSpawnPoint(viewport, obstacles, size);
    expect(got.x).toBe(920 + 24);
    const newRect: Rect = { x: got.x, y: got.y, w: size.w, h: size.h };
    expect(rectsOverlap(newRect, obstacles[0], 24)).toBe(false);
    expect(rectsOverlap(newRect, obstacles[1], 24)).toBe(false);
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
