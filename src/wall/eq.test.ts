import { describe, expect, it } from "vitest";
import { BAR_COUNT, barsFromBins, isSilent, simulateBars } from "./eq";

describe("barsFromBins", () => {
  it("groups bins into BAR_COUNT bars normalized to 0..1", () => {
    const bins = new Uint8Array(1024).fill(255);
    const bars = barsFromBins(bins);
    expect(bars).toHaveLength(BAR_COUNT);
    for (const b of bars) expect(b).toBeCloseTo(1, 5);
  });

  it("returns zeros for silence", () => {
    expect(barsFromBins(new Uint8Array(1024))).toEqual(new Array(BAR_COUNT).fill(0));
  });

  it("keeps every bar within 0..1 for arbitrary data", () => {
    const bins = new Uint8Array(512).map((_, i) => (i * 37) % 256);
    for (const b of barsFromBins(bins)) {
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });
});

describe("isSilent", () => {
  it("is true only when every bin is zero", () => {
    expect(isSilent(new Uint8Array(64))).toBe(true);
    const one = new Uint8Array(64);
    one[13] = 1;
    expect(isSilent(one)).toBe(false);
  });
});

describe("simulateBars", () => {
  it("is deterministic in t and stays within 0.05..1", () => {
    const prev = new Array(BAR_COUNT).fill(0.5);
    const a = simulateBars(prev, 1234);
    expect(simulateBars(prev, 1234)).toEqual(a);
    for (const b of a) {
      expect(b).toBeGreaterThanOrEqual(0.05);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it("moves smoothly: one step never jumps a bar more than 0.35", () => {
    const prev = new Array(BAR_COUNT).fill(0.5);
    const next = simulateBars(prev, 999);
    next.forEach((b, i) => expect(Math.abs(b - prev[i])).toBeLessThanOrEqual(0.35));
  });
});
