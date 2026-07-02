import { describe, it, expect } from "vitest";
import { applyPatches, bumpElement, hidePatch, isHidden, unhidePatch, type El } from "./commitCore";

const el = (over: Partial<El> = {}): El => ({
  id: "a", version: 3, versionNonce: 42, updated: 1, opacity: 80, ...over,
});

describe("bumpElement", () => {
  it("increments version and refreshes updated", () => {
    const b = bumpElement(el());
    expect(b.version).toBe(4);
    expect(b.updated).toBeGreaterThan(1);
    expect(typeof b.versionNonce).toBe("number");
  });
  it("does not mutate the input", () => {
    const a = el();
    bumpElement(a);
    expect(a.version).toBe(3);
  });
});

describe("applyPatches", () => {
  const els = [el({ id: "a", x: 0 }), el({ id: "b", x: 5 })];
  it("applies the patch and bumps only the target", () => {
    const out = applyPatches(els, { a: { x: 99 } });
    expect(out[0].x).toBe(99);
    expect(out[0].version).toBe(4);
    expect(out[1]).toBe(els[1]); // identity preserved -> Excalidraw treats as unchanged
  });
  it("applies multiple patches in one pass", () => {
    const out = applyPatches(els, { a: { x: 1 }, b: { x: 2 } });
    expect(out[0].x).toBe(1);
    expect(out[1].x).toBe(2);
    expect(out[1].version).toBe(4);
  });
  it("ignores ids not in the scene", () => {
    const out = applyPatches(els, { zz: { x: 1 } });
    expect(out[0]).toBe(els[0]);
    expect(out[1]).toBe(els[1]);
  });
});

describe("hide/unhide", () => {
  it("hidePatch makes the element invisible and unclickable, remembering prior state", () => {
    const p = hidePatch(el({ opacity: 80, locked: false }));
    expect(p.opacity).toBe(0);
    expect(p.locked).toBe(true);
    expect((p.customData as Record<string, unknown>).vsHidden).toBe(true);
    expect((p.customData as Record<string, unknown>).prevOpacity).toBe(80);
    expect((p.customData as Record<string, unknown>).prevLocked).toBe(false);
  });
  it("round-trips: unhide restores opacity and locked exactly", () => {
    const hidden = { ...el({ opacity: 80, locked: true }), ...hidePatch(el({ opacity: 80, locked: true })) } as El;
    expect(isHidden(hidden)).toBe(true);
    const p = unhidePatch(hidden);
    expect(p.opacity).toBe(80);
    expect(p.locked).toBe(true);
    expect((p.customData as Record<string, unknown>).vsHidden).toBeUndefined();
    expect((p.customData as Record<string, unknown>).prevOpacity).toBeUndefined();
  });
  it("unhide falls back to sane defaults when customData was stripped", () => {
    const p = unhidePatch(el({ opacity: 0, locked: true, customData: { vsHidden: true } }));
    expect(p.opacity).toBe(100);
    expect(p.locked).toBe(false);
  });
  it("isHidden is false for normal elements, even at opacity 0", () => {
    expect(isHidden(el())).toBe(false);
    expect(isHidden(el({ opacity: 0 }))).toBe(false);
  });
  it("hidePatch preserves unrelated customData keys", () => {
    const p = hidePatch(el({ customData: { name: "Hero" } }));
    expect((p.customData as Record<string, unknown>).name).toBe("Hero");
  });
});
