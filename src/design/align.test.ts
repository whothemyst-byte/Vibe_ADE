import { describe, it, expect } from "vitest";
import { alignPatches, bboxOf, distributePatches, type AlignEl } from "./align";

const el = (over: Partial<AlignEl> = {}): AlignEl => ({
  id: "a", x: 0, y: 0, width: 10, height: 10, ...over,
});

const all = (ids: string[]) => Object.fromEntries(ids.map((i) => [i, true]));

describe("bboxOf", () => {
  it("is the plain rect when unrotated", () => {
    expect(bboxOf(el({ x: 5, y: 6, width: 10, height: 20 })))
      .toEqual({ minX: 5, minY: 6, maxX: 15, maxY: 26 });
  });
  it("accounts for rotation around the element center", () => {
    // 100x50 rotated 90deg around center (50,25) -> 50x100 box
    const b = bboxOf(el({ x: 0, y: 0, width: 100, height: 50, angle: Math.PI / 2 }));
    expect(b.minX).toBeCloseTo(25);
    expect(b.maxX).toBeCloseTo(75);
    expect(b.minY).toBeCloseTo(-25);
    expect(b.maxY).toBeCloseTo(75);
  });
});

describe("alignPatches", () => {
  it("aligns lefts to the selection's leftmost edge", () => {
    const els = [el({ id: "a", x: 0 }), el({ id: "b", x: 200 })];
    const p = alignPatches(els, all(["a", "b"]), "left");
    expect(p.b).toEqual({ x: 0 });
    expect(p.a).toBeUndefined(); // already there -> no patch
  });
  it("aligns horizontal centers", () => {
    const els = [el({ id: "a", x: 0, width: 10 }), el({ id: "b", x: 90, width: 30 })];
    // combined box 0..120, center 60; a center 5 -> dx 55; b center 105 -> dx -45
    const p = alignPatches(els, all(["a", "b"]), "center-h");
    expect(p.a).toEqual({ x: 55 });
    expect(p.b).toEqual({ x: 45 });
  });
  it("aligns bottoms on the vertical axis", () => {
    const els = [el({ id: "a", y: 0, height: 10 }), el({ id: "b", y: 50, height: 30 })];
    const p = alignPatches(els, all(["a", "b"]), "bottom");
    expect(p.a).toEqual({ y: 70 }); // bottom target 80, a height 10
    expect(p.b).toBeUndefined();
  });
  it("moves grouped elements as one unit", () => {
    const els = [
      el({ id: "a", x: 0, groupIds: ["g1"] }),
      el({ id: "b", x: 20, groupIds: ["g1"] }),
      el({ id: "c", x: 100 }),
    ];
    const p = alignPatches(els, all(["a", "b", "c"]), "left");
    // unit(a,b) box 0..30 is leftmost -> only c moves
    expect(p.c).toEqual({ x: 0 });
    expect(p.a).toBeUndefined();
    expect(p.b).toBeUndefined();
  });
  it("returns {} for fewer than 2 units", () => {
    const els = [el({ id: "a", groupIds: ["g1"] }), el({ id: "b", x: 20, groupIds: ["g1"] })];
    expect(alignPatches(els, all(["a", "b"]), "left")).toEqual({});
  });
  it("ignores unselected elements", () => {
    const els = [el({ id: "a", x: 0 }), el({ id: "b", x: 200 }), el({ id: "z", x: -999 })];
    const p = alignPatches(els, all(["a", "b"]), "left");
    expect(p.b).toEqual({ x: 0 }); // z's position is irrelevant
  });
});

describe("distributePatches", () => {
  it("equalizes horizontal gaps, keeping first and last fixed", () => {
    const els = [
      el({ id: "a", x: 0, width: 10 }),
      el({ id: "b", x: 30, width: 10 }),
      el({ id: "c", x: 100, width: 10 }),
    ];
    // span 0..110, widths 30, gaps (110-30)/2 = 40 -> b at 50
    const p = distributePatches(els, all(["a", "b", "c"]), "horizontal");
    expect(p.b).toEqual({ x: 50 });
    expect(p.a).toBeUndefined();
    expect(p.c).toBeUndefined();
  });
  it("distributes vertically", () => {
    const els = [
      el({ id: "a", y: 0, height: 10 }),
      el({ id: "b", y: 12, height: 10 }),
      el({ id: "c", y: 90, height: 10 }),
    ];
    // span 0..100, heights 30, gap 35 -> b at 45
    const p = distributePatches(els, all(["a", "b", "c"]), "vertical");
    expect(p.b).toEqual({ y: 45 });
  });
  it("returns {} for fewer than 3 units", () => {
    const els = [el({ id: "a" }), el({ id: "b", x: 50 })];
    expect(distributePatches(els, all(["a", "b"]), "horizontal")).toEqual({});
  });
});
