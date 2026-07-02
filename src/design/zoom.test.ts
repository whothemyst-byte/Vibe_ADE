import { describe, it, expect } from "vitest";
import { anchoredZoom, clampZoom, stepZoom, MIN_ZOOM, MAX_ZOOM, type Viewport } from "./zoom";

const view: Viewport = { zoom: 1, scrollX: -200, scrollY: 50, width: 1200, height: 800 };

/** Scene point under a viewport point, per Excalidraw's model. */
const scenePoint = (v: { zoom: number; scrollX: number; scrollY: number }, x: number, y: number) =>
  ({ x: x / v.zoom - v.scrollX, y: y / v.zoom - v.scrollY });

describe("clampZoom / stepZoom", () => {
  it("clamps to [MIN_ZOOM, MAX_ZOOM]", () => {
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });
  it("steps multiplicatively and round-trips", () => {
    const up = stepZoom(1, 1);
    expect(up).toBeGreaterThan(1);
    expect(stepZoom(up, -1)).toBeCloseTo(1);
  });
  it("stepZoom saturates at the bounds", () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });
});

describe("anchoredZoom", () => {
  it("keeps the scene point under the viewport center fixed", () => {
    const next = anchoredZoom(view, 2);
    const cx = view.width / 2, cy = view.height / 2;
    expect(scenePoint(next, cx, cy).x).toBeCloseTo(scenePoint(view, cx, cy).x);
    expect(scenePoint(next, cx, cy).y).toBeCloseTo(scenePoint(view, cx, cy).y);
    expect(next.zoom).toBe(2);
  });
  it("keeps an explicit anchor fixed (cursor zoom)", () => {
    const anchor = { x: 100, y: 700 };
    const next = anchoredZoom(view, 0.5, anchor);
    expect(scenePoint(next, anchor.x, anchor.y).x).toBeCloseTo(scenePoint(view, anchor.x, anchor.y).x);
    expect(scenePoint(next, anchor.x, anchor.y).y).toBeCloseTo(scenePoint(view, anchor.x, anchor.y).y);
  });
  it("clamps the requested zoom", () => {
    expect(anchoredZoom(view, 100).zoom).toBe(MAX_ZOOM);
  });
  it("is identity when zoom is unchanged", () => {
    const next = anchoredZoom(view, 1);
    expect(next.scrollX).toBeCloseTo(view.scrollX);
    expect(next.scrollY).toBeCloseTo(view.scrollY);
  });
});
