import { describe, expect, it } from "vitest";
import { gridShape } from "./gridLayout";

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
