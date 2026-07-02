import { describe, it, expect } from "vitest";
import { reorderElements } from "./zorder";

const els = ["a", "b", "c", "d"].map((id) => ({ id }));
const ids = (r: { id: string }[] | null) => r?.map((e) => e.id) ?? null;
const sel = (...s: string[]) => Object.fromEntries(s.map((i) => [i, true]));

describe("reorderElements", () => {
  it("front: moves selection to the end, preserving relative order", () => {
    expect(ids(reorderElements(els, sel("a", "c"), "front"))).toEqual(["b", "d", "a", "c"]);
  });
  it("back: moves selection to the start", () => {
    expect(ids(reorderElements(els, sel("b", "d"), "back"))).toEqual(["b", "d", "a", "c"]);
  });
  it("forward: swaps each selected element with its next unselected neighbor", () => {
    expect(ids(reorderElements(els, sel("a"), "forward"))).toEqual(["b", "a", "c", "d"]);
  });
  it("forward: a selected block moves as one", () => {
    expect(ids(reorderElements(els, sel("a", "b"), "forward"))).toEqual(["c", "a", "b", "d"]);
  });
  it("backward: swaps toward the start", () => {
    expect(ids(reorderElements(els, sel("c"), "backward"))).toEqual(["a", "c", "b", "d"]);
  });
  it("returns null when nothing changes (already at boundary)", () => {
    expect(reorderElements(els, sel("d"), "front")).toBeNull();
    expect(reorderElements(els, sel("a"), "backward")).toBeNull();
    expect(reorderElements(els, {}, "front")).toBeNull();
  });
});
