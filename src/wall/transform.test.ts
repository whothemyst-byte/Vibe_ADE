import { describe, expect, it } from "vitest";
import {
  worldRectToScreen,
  findSpawnPoint,
  rectsOverlap,
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
  // A viewport large enough that a second window can fit beside a centered one.
  const viewport: Rect = { x: 0, y: 0, w: 2000, h: 1400 };
  const size = { w: 420, h: 260 };

  it("centers in the viewport when nothing else is there", () => {
    expect(findSpawnPoint(viewport, [], size)).toEqual({
      x: (2000 - 420) / 2,
      y: (1400 - 260) / 2,
    });
  });

  it("returns a non-overlapping, fully-visible slot when the center is taken", () => {
    const centered: Rect = { x: (2000 - 420) / 2, y: (1400 - 260) / 2, w: 420, h: 260 };
    const got = findSpawnPoint(viewport, [centered], size);
    const gotRect: Rect = { x: got.x, y: got.y, w: size.w, h: size.h };

    // Does not overlap the existing centered window (respecting the gap)...
    expect(rectsOverlap(gotRect, centered, 12)).toBe(false);
    // ...and stays inside the viewport.
    expect(got.x).toBeGreaterThanOrEqual(viewport.x);
    expect(got.y).toBeGreaterThanOrEqual(viewport.y);
    expect(got.x + size.w).toBeLessThanOrEqual(viewport.x + viewport.w);
    expect(got.y + size.h).toBeLessThanOrEqual(viewport.y + viewport.h);
  });

  it("cascades near center when the viewport is too small for a free slot", () => {
    const small: Rect = { x: 0, y: 0, w: 1000, h: 800 };
    const centered: Rect = { x: (1000 - 420) / 2, y: (800 - 260) / 2, w: 420, h: 260 };
    const got = findSpawnPoint(small, [centered], size);
    // No free slot exists, so it offsets from the centered position (near focus).
    expect(got).toEqual({ x: centered.x + 28, y: centered.y + 28 });
  });

  it("respects the viewport origin (pan offset)", () => {
    const panned: Rect = { x: 5000, y: -2000, w: 1000, h: 800 };
    expect(findSpawnPoint(panned, [], size)).toEqual({
      x: 5000 + (1000 - 420) / 2,
      y: -2000 + (800 - 260) / 2,
    });
  });
});
