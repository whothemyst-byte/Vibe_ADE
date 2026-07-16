import { describe, expect, it } from "vitest";
import { minimapProject } from "./minimap";

const BOX = { w: 180, h: 120, pad: 8 };

describe("minimapProject", () => {
  it("fits all cards and the viewport inside the padded box", () => {
    const cards = [
      { x: -500, y: -200, w: 600, h: 440 },
      { x: 200, y: 300, w: 600, h: 440 },
    ];
    const viewport = { x: -100, y: -100, w: 1200, h: 800 };
    const m = minimapProject(cards, viewport, BOX);
    for (const r of [...m.cards, m.viewport]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(BOX.w);
      expect(r.y + r.h).toBeLessThanOrEqual(BOX.h);
    }
  });

  it("preserves aspect: uniform scale on both axes", () => {
    const cards = [{ x: 0, y: 0, w: 100, h: 100 }];
    const viewport = { x: 0, y: 0, w: 400, h: 100 };
    const m = minimapProject(cards, viewport, BOX);
    expect(m.cards[0].w).toBeCloseTo(m.cards[0].h, 6);
  });

  it("toWorld inverts the projection", () => {
    const cards = [{ x: 50, y: 80, w: 600, h: 440 }];
    const viewport = { x: -1000, y: -500, w: 2000, h: 1200 };
    const m = minimapProject(cards, viewport, BOX);
    const p = { x: m.cards[0].x, y: m.cards[0].y };
    const w = m.toWorld(p);
    expect(w.x).toBeCloseTo(50, 4);
    expect(w.y).toBeCloseTo(80, 4);
  });

  it("handles zero cards (viewport only)", () => {
    const m = minimapProject([], { x: 0, y: 0, w: 1000, h: 600 }, BOX);
    expect(m.cards).toEqual([]);
    expect(m.viewport.w).toBeGreaterThan(0);
  });
});
