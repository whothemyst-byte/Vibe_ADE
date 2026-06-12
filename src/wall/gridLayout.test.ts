import { describe, expect, it } from "vitest";
import {
  gridShape,
  gridPositions,
  gridBBox,
  fitCamera,
  nearestSlotIndex,
  browserLayout,
  BROWSER_PANE,
  CELL,
  GUTTER,
} from "./gridLayout";

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

describe("fitCamera", () => {
  const screen = { w: 1600, h: 900 };

  it("keeps zoom at 1 when the bbox fits, and centers it", () => {
    const bbox = { x: 0, y: 0, w: 420, h: 260 };
    const cam = fitCamera(bbox, screen);
    expect(cam.z).toBe(1);
    // world center of bbox maps to screen center: (cx + cam.x) * z = screenW/2
    expect((bbox.x + bbox.w / 2 + cam.x) * cam.z).toBeCloseTo(screen.w / 2);
    expect((bbox.y + bbox.h / 2 + cam.y) * cam.z).toBeCloseTo(screen.h / 2);
  });

  it("zooms out (z < 1) when the padded bbox exceeds the screen", () => {
    const bbox = { x: -1000, y: -600, w: 2000, h: 1200 };
    const cam = fitCamera(bbox, screen);
    expect(cam.z).toBeLessThan(1);
    expect(cam.z).toBeCloseTo(Math.min(1600 / (2000 + 96), 900 / (1200 + 96)));
    expect((bbox.x + bbox.w / 2 + cam.x) * cam.z).toBeCloseTo(screen.w / 2);
  });

  it("respects a custom maxZoom cap", () => {
    const cam = fitCamera({ x: 0, y: 0, w: 100, h: 100 }, screen, 48, 0.5);
    expect(cam.z).toBe(0.5);
  });
});

describe("browserLayout", () => {
  it("spans the browser pane over a 2x2 cell block", () => {
    expect(BROWSER_PANE.w).toBe(2 * CELL.w + GUTTER);
    expect(BROWSER_PANE.h).toBe(2 * CELL.h + GUTTER);
  });

  it("centers a lone browser on the anchor", () => {
    const L = browserLayout(0, { x: 0, y: 0 });
    expect(L.browser).toEqual({
      x: -BROWSER_PANE.w / 2,
      y: -BROWSER_PANE.h / 2,
      w: BROWSER_PANE.w,
      h: BROWSER_PANE.h,
    });
    expect(L.terminals).toEqual([]);
    expect(L.bbox).toEqual(L.browser);
  });

  it("stacks two terminals in a column right of the browser, tops aligned", () => {
    const L = browserLayout(2, { x: 0, y: 0 });
    const colX = L.browser.x + L.browser.w + GUTTER;
    expect(L.terminals[0]).toEqual({ x: colX, y: L.browser.y });
    expect(L.terminals[1]).toEqual({ x: colX, y: L.browser.y + CELL.h + GUTTER });
    // Column bottom flush with the browser bottom (2 cells + gutter = pane height).
    expect(L.terminals[1].y + CELL.h).toBe(L.browser.y + L.browser.h);
  });

  it("overflows into further columns of two, column-major", () => {
    const L = browserLayout(5, { x: 0, y: 0 });
    const colX = (i: number) => L.browser.x + L.browser.w + GUTTER + i * (CELL.w + GUTTER);
    expect(L.terminals[2].x).toBe(colX(1)); // third terminal starts column 2
    expect(L.terminals[2].y).toBe(L.browser.y);
    expect(L.terminals[4].x).toBe(colX(2)); // fifth starts column 3
    expect(L.bbox.w).toBe(BROWSER_PANE.w + 3 * (CELL.w + GUTTER));
  });

  it("centers the whole block on the anchor", () => {
    const anchor = { x: 100, y: -50 };
    const L = browserLayout(2, anchor);
    expect(L.bbox.x + L.bbox.w / 2).toBeCloseTo(anchor.x);
    expect(L.bbox.y + L.bbox.h / 2).toBeCloseTo(anchor.y);
  });
});

describe("nearestSlotIndex", () => {
  const rects = [
    { x: 0, y: 0, w: 420, h: 260 },
    { x: 444, y: 0, w: 420, h: 260 },
    { x: 0, y: 284, w: 420, h: 260 },
  ];

  it("returns the index of the rect whose center is nearest", () => {
    expect(nearestSlotIndex({ x: 210, y: 130 }, rects)).toBe(0);
    expect(nearestSlotIndex({ x: 700, y: 100 }, rects)).toBe(1);
    expect(nearestSlotIndex({ x: 150, y: 500 }, rects)).toBe(2);
  });

  it("returns -1 for an empty list", () => {
    expect(nearestSlotIndex({ x: 0, y: 0 }, [])).toBe(-1);
  });
});
