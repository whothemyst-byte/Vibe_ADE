import { describe, it, expect } from "vitest";
import { groupPatches, sharedOuterGroup, ungroupPatches, type GroupEl } from "./groups";

const all = (ids: string[]) => Object.fromEntries(ids.map((i) => [i, true]));
const el = (id: string, groupIds?: string[]): GroupEl => ({ id, groupIds });

describe("groupPatches", () => {
  it("appends a shared outermost group id to every selected element", () => {
    const r = groupPatches([el("a"), el("b"), el("z")], all(["a", "b"]), "G");
    expect(r).not.toBeNull();
    expect(r!.groupId).toBe("G");
    expect(r!.patches.a).toEqual({ groupIds: ["G"] });
    expect(r!.patches.b).toEqual({ groupIds: ["G"] });
    expect(r!.patches.z).toBeUndefined();
  });
  it("nests existing groups (old ids kept innermost, new id outermost)", () => {
    const r = groupPatches([el("a", ["g1"]), el("b", ["g2"])], all(["a", "b"]), "G");
    expect(r!.patches.a).toEqual({ groupIds: ["g1", "G"] });
    expect(r!.patches.b).toEqual({ groupIds: ["g2", "G"] });
  });
  it("returns null for fewer than 2 selected", () => {
    expect(groupPatches([el("a")], all(["a"]))).toBeNull();
  });
  it("generates a group id when none is given", () => {
    const r = groupPatches([el("a"), el("b")], all(["a", "b"]));
    expect(r!.groupId.length).toBeGreaterThan(4);
  });
});

describe("sharedOuterGroup", () => {
  it("finds the common outermost group", () => {
    const els = [el("a", ["x", "G"]), el("b", ["G"])];
    expect(sharedOuterGroup(els, all(["a", "b"]))).toBe("G");
  });
  it("is null when any selected element is ungrouped or differs", () => {
    expect(sharedOuterGroup([el("a", ["G"]), el("b")], all(["a", "b"]))).toBeNull();
    expect(sharedOuterGroup([el("a", ["G"]), el("b", ["H"])], all(["a", "b"]))).toBeNull();
    expect(sharedOuterGroup([el("a", ["G"])], {})).toBeNull();
  });
});

describe("ungroupPatches", () => {
  it("removes only the shared outermost id", () => {
    const els = [el("a", ["inner", "G"]), el("b", ["G"])];
    const p = ungroupPatches(els, all(["a", "b"]));
    expect(p!.a).toEqual({ groupIds: ["inner"] });
    expect(p!.b).toEqual({ groupIds: [] });
  });
  it("is null when there is no shared group", () => {
    expect(ungroupPatches([el("a"), el("b")], all(["a", "b"]))).toBeNull();
  });
});
