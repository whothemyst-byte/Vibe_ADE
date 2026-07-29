import { describe, it, expect } from "vitest";
import {
  FRAME_GAP, FRAME_PRESETS, FRAME_PRESET_GROUPS, framePlacement, nextFrameName,
  type FrameBox, type Viewport,
} from "./framePresets";

const view = (over: Partial<Viewport> = {}): Viewport => ({
  zoom: 1, scrollX: 0, scrollY: 0, width: 1000, height: 800, ...over,
});

describe("FRAME_PRESET_GROUPS", () => {
  it("covers phone, tablet, laptop, desktop, TV and watch", () => {
    expect(FRAME_PRESET_GROUPS.map((g) => g.label))
      .toEqual(["Phone", "Tablet", "Laptop", "Desktop", "TV", "Watch"]);
  });

  it("gives every preset a unique id and positive dimensions", () => {
    expect(new Set(FRAME_PRESETS.map((p) => p.id)).size).toBe(FRAME_PRESETS.length);
    for (const p of FRAME_PRESETS) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it("keeps phones portrait and laptops landscape", () => {
    const phones = FRAME_PRESET_GROUPS.find((g) => g.label === "Phone")!;
    for (const p of phones.presets) expect(p.height).toBeGreaterThan(p.width);
    const laptops = FRAME_PRESET_GROUPS.find((g) => g.label === "Laptop")!;
    for (const p of laptops.presets) expect(p.width).toBeGreaterThan(p.height);
  });
});

describe("framePlacement", () => {
  it("centres the first frame in the current viewport", () => {
    const at = framePlacement([], { width: 400, height: 800 }, view());
    expect(at).toEqual({ x: 500 - 200, y: 400 - 400 });
  });

  it("accounts for scroll and zoom when centring", () => {
    const at = framePlacement([], { width: 100, height: 100 }, view({ zoom: 2, scrollX: -300, scrollY: -200 }));
    // centre scene point = 1000/2/2 - (-300) = 550, 800/2/2 - (-200) = 400
    expect(at).toEqual({ x: 500, y: 350 });
  });

  it("places the next frame to the right of every existing one", () => {
    const frames: FrameBox[] = [
      { x: 0, y: 0, width: 400, height: 800 },
      { x: 500, y: 40, width: 300, height: 600 },
    ];
    expect(framePlacement(frames, { width: 200, height: 400 }, view()))
      .toEqual({ x: 800 + FRAME_GAP, y: 0 });
  });

  it("aligns to the topmost frame, not the first in the list", () => {
    const frames: FrameBox[] = [
      { x: 0, y: 200, width: 100, height: 100 },
      { x: 0, y: -50, width: 100, height: 100 },
    ];
    expect(framePlacement(frames, { width: 10, height: 10 }, view()).y).toBe(-50);
  });
});

describe("nextFrameName", () => {
  it("uses the bare label when it is free", () => {
    expect(nextFrameName([], "iPhone 16 Pro")).toBe("iPhone 16 Pro");
  });

  it("suffixes the first duplicate with 2", () => {
    expect(nextFrameName(["iPhone 16 Pro"], "iPhone 16 Pro")).toBe("iPhone 16 Pro 2");
  });

  it("skips over suffixes already in use", () => {
    expect(nextFrameName(["Desktop", "Desktop 2", "Desktop 3"], "Desktop")).toBe("Desktop 4");
  });

  it("does not collide with an unrelated label sharing a prefix", () => {
    expect(nextFrameName(["TV 4K"], "TV")).toBe("TV");
  });
});
