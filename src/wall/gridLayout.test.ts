import { describe, expect, it } from "vitest";
import { gridShape, gridPositions, gridBBox, CELL, GUTTER } from "./gridLayout";

const LANDSCAPE = 16 / 9;

describe("gridShape", () => {
  it("handles 0 and 1 terminals", () => {
    expect(gridShape(0, LANDSCAPE)).toEqual({ cols: 0, rows: 0 });
    expect(gridShape(1, LANDSCAPE)).toEqual({ cols: 1, rows: 1 });
  });

  it("puts 2 terminals side by side on a landscape screen", () => {
    expect(gridShape(2, LANDSCAPE)).toEqual({ cols: 2, rows: 1 });
  });

  it("forms 2x2 for 4 terminals on a landscape screen", () => {
    expect(gridShape(4, LANDSCAPE)).toEqual({ cols: 2, rows: 2 });
  });

  it("forms 3x2 for 6 terminals on a landscape screen", () => {
    expect(gridShape(6, LANDSCAPE)).toEqual({ cols: 3, rows: 2 });
  });

  it("forms 4x3 for 12 terminals on a landscape screen", () => {
    expect(gridShape(12, LANDSCAPE)).toEqual({ cols: 4, rows: 3 });
  });

  it("stacks vertically on a portrait screen", () => {
    expect(gridShape(2, 0.6)).toEqual({ cols: 1, rows: 2 });
  });

  it("never produces a fully empty column", () => {
    for (let n = 1; n <= 20; n++) {
      const { cols, rows } = gridShape(n, LANDSCAPE);
      expect((cols - 1) * rows).toBeLessThan(n); // last column has >= 1 cell
      expect(cols * rows).toBeGreaterThanOrEqual(n); // grid holds everything
    }
  });
});

describe("gridPositions", () => {
  it("centers a single terminal on the anchor", () => {
    const [p] = gridPositions(1, LANDSCAPE, { x: 0, y: 0 });
    expect(p).toEqual({ x: -CELL.w / 2, y: -CELL.h / 2 });
  });

  it("lays a 2x1 row with one gutter, centered on the anchor", () => {
    const pos = gridPositions(2, LANDSCAPE, { x: 100, y: 50 });
    const gridW = 2 * CELL.w + GUTTER;
    expect(pos[0]).toEqual({ x: 100 - gridW / 2, y: 50 - CELL.h / 2 });
    expect(pos[1].x - pos[0].x).toBe(CELL.w + GUTTER);
    expect(pos[1].y).toBe(pos[0].y);
  });

  it("wraps to the next row in reading order", () => {
    const pos = gridPositions(4, LANDSCAPE, { x: 0, y: 0 }); // 2x2
    expect(pos[2].x).toBe(pos[0].x); // row 2 starts at the left edge
    expect(pos[2].y - pos[0].y).toBe(CELL.h + GUTTER);
    expect(pos[3].x).toBe(pos[1].x);
  });
});

describe("gridBBox", () => {
  it("bounds exactly the laid-out cells", () => {
    const anchor = { x: 10, y: -20 };
    const pos = gridPositions(6, LANDSCAPE, anchor); // 3x2
    const bbox = gridBBox(6, LANDSCAPE, anchor);
    expect(bbox.x).toBe(Math.min(...pos.map((p) => p.x)));
    expect(bbox.y).toBe(Math.min(...pos.map((p) => p.y)));
    expect(bbox.w).toBe(3 * CELL.w + 2 * GUTTER);
    expect(bbox.h).toBe(2 * CELL.h + GUTTER);
  });
});
