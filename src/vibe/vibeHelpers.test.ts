// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  clampPosition, defaultVibePosition, loadVibePosition, saveVibePosition,
  VIBE_SIZE, VIBE_MARGIN, VIBE_POSITION_STORAGE_KEY,
} from "./vibeHelpers";

describe("clampPosition", () => {
  it("keeps an in-bounds position", () => {
    expect(clampPosition({ x: 100, y: 100 }, 1280, 800)).toEqual({ x: 100, y: 100 });
  });
  it("clamps to margins on all edges", () => {
    expect(clampPosition({ x: -50, y: -50 }, 1280, 800)).toEqual({ x: VIBE_MARGIN, y: VIBE_MARGIN });
    expect(clampPosition({ x: 9999, y: 9999 }, 1280, 800)).toEqual({
      x: 1280 - VIBE_SIZE - VIBE_MARGIN,
      y: 800 - VIBE_SIZE - VIBE_MARGIN,
    });
  });
});

describe("defaultVibePosition", () => {
  it("sits in the bottom-right gutter", () => {
    const p = defaultVibePosition(1280, 800);
    expect(p.x).toBeLessThan(1280 - VIBE_SIZE);
    expect(p.y).toBeLessThan(800 - VIBE_SIZE);
  });
});

describe("load/save", () => {
  beforeEach(() => window.localStorage.clear());
  it("round-trips a position", () => {
    saveVibePosition({ x: 42, y: 7 });
    expect(loadVibePosition()).toEqual({ x: 42, y: 7 });
  });
  it("returns null on missing or corrupt data", () => {
    expect(loadVibePosition()).toBeNull();
    window.localStorage.setItem(VIBE_POSITION_STORAGE_KEY, "{nope");
    expect(loadVibePosition()).toBeNull();
    window.localStorage.setItem(VIBE_POSITION_STORAGE_KEY, JSON.stringify({ x: "a" }));
    expect(loadVibePosition()).toBeNull();
  });
});
