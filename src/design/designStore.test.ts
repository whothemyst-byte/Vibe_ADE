import { describe, it, expect } from "vitest";
import {
  createDesignStore, EMPTY_SNAPSHOT, selectLayers, layersEqual,
  selectSelection, selectionEqual, selectSnapOn,
  type DesignSnapshot, type StoreElement,
} from "./designStore";

const el = (over: Partial<StoreElement> = {}): StoreElement => ({
  id: "a", type: "rectangle", version: 1, versionNonce: 1, updated: 1, opacity: 100,
  x: 10.4, y: 20.6, width: 100, height: 50, angle: 0,
  strokeColor: "#fff", backgroundColor: "transparent", strokeWidth: 1,
  ...over,
});

const snap = (over: Partial<DesignSnapshot> = {}): DesignSnapshot => ({
  ...EMPTY_SNAPSHOT, ...over,
});

describe("createDesignStore", () => {
  it("notifies subscribers on set and exposes the snapshot", () => {
    const store = createDesignStore();
    let fired = 0;
    store.subscribe(() => fired++);
    const s = snap({ zoom: 2 });
    store.set(s);
    expect(fired).toBe(1);
    expect(store.get()).toBe(s);
  });
  it("unsubscribe stops notifications", () => {
    const store = createDesignStore();
    let fired = 0;
    const un = store.subscribe(() => fired++);
    un();
    store.set(snap());
    expect(fired).toBe(0);
  });
});

describe("selectLayers", () => {
  it("reverses element order (top of stack first) and skips deleted", () => {
    const s = snap({
      elements: [el({ id: "a" }), el({ id: "b" }), el({ id: "c", isDeleted: true })],
    });
    expect(selectLayers(s).map((r) => r.id)).toEqual(["b", "a"]);
  });
  it("marks selection, lock, and hide state", () => {
    const s = snap({
      elements: [el({ id: "a", locked: true, customData: { vsHidden: true } })],
      selectedIds: { a: true },
    });
    const [row] = selectLayers(s);
    expect(row.selected).toBe(true);
    expect(row.locked).toBe(true);
    expect(row.hidden).toBe(true);
  });
  it("labels text elements with their content", () => {
    const s = snap({ elements: [el({ id: "t", type: "text", text: "Hi" })] });
    expect(selectLayers(s)[0].label).toBe('"Hi"');
  });
});

describe("layersEqual", () => {
  const s = snap({ elements: [el({ id: "a" }), el({ id: "b" })] });
  it("is true for equivalent rows (pure drag does not re-render layers)", () => {
    const moved = snap({ elements: [el({ id: "a", x: 500 }), el({ id: "b", x: 900 })] });
    expect(layersEqual(selectLayers(s), selectLayers(moved))).toBe(true);
  });
  it("is false when order changes", () => {
    const reordered = snap({ elements: [el({ id: "b" }), el({ id: "a" })] });
    expect(layersEqual(selectLayers(s), selectLayers(reordered))).toBe(false);
  });
  it("is false when selection changes", () => {
    const sel = snap({ elements: [el({ id: "a" }), el({ id: "b" })], selectedIds: { a: true } });
    expect(layersEqual(selectLayers(s), selectLayers(sel))).toBe(false);
  });
});

describe("selectSelection (multi)", () => {
  it("is null when nothing is selected", () => {
    expect(selectSelection(snap({ elements: [el()] }))).toBeNull();
  });
  it("mirrors the single-element values for a 1-selection", () => {
    const s = snap({ elements: [el({ id: "a" })], selectedIds: { a: true } });
    const m = selectSelection(s)!;
    expect(m.ids).toEqual(["a"]);
    expect(m.count).toBe(1);
    expect(m.x).toBe(10);
    expect(m.type).toBe("rectangle");
    expect(m.fontSize).toBeNull();
    expect(m.hasLinear).toBe(false);
    expect(m.sharedGroup).toBeNull();
  });
  it("reports uniform values and marks differing ones as mixed", () => {
    const s = snap({
      elements: [
        el({ id: "a", x: 0, opacity: 50 }),
        el({ id: "b", x: 40, opacity: 50 }),
      ],
      selectedIds: { a: true, b: true },
    });
    const m = selectSelection(s)!;
    expect(m.count).toBe(2);
    expect(m.x).toBe("mixed");
    expect(m.opacity).toBe(50);
    expect(m.width).toBe(100);
  });
  it("flags linear types and shared groups", () => {
    const s = snap({
      elements: [
        el({ id: "a", type: "arrow", groupIds: ["G"] }),
        el({ id: "b", groupIds: ["G"] }),
      ],
      selectedIds: { a: true, b: true },
    });
    const m = selectSelection(s)!;
    expect(m.hasLinear).toBe(true);
    expect(m.sharedGroup).toBe("G");
    expect(m.type).toBe("mixed");
  });
  it("fontSize: null without text, value when uniform, mixed when not", () => {
    const noText = snap({ elements: [el({ id: "a" })], selectedIds: { a: true } });
    expect(selectSelection(noText)!.fontSize).toBeNull();
    const uniform = snap({
      elements: [el({ id: "t", type: "text", fontSize: 24 }), el({ id: "u", type: "text", fontSize: 24 })],
      selectedIds: { t: true, u: true },
    });
    expect(selectSelection(uniform)!.fontSize).toBe(24);
    const mixed = snap({
      elements: [el({ id: "t", type: "text", fontSize: 24 }), el({ id: "u", type: "text", fontSize: 12 })],
      selectedIds: { t: true, u: true },
    });
    expect(selectSelection(mixed)!.fontSize).toBe("mixed");
  });
  it("selectionEqual compares by value, including ids", () => {
    const a = snap({ elements: [el({ id: "a" })], selectedIds: { a: true } });
    const b = snap({ elements: [el({ id: "a" })], selectedIds: { a: true } });
    const c = snap({ elements: [el({ id: "a", x: 500 })], selectedIds: { a: true } });
    expect(selectionEqual(selectSelection(a), selectSelection(b))).toBe(true);
    expect(selectionEqual(selectSelection(a), selectSelection(c))).toBe(false);
    expect(selectionEqual(null, null)).toBe(true);
    expect(selectionEqual(selectSelection(a), null)).toBe(false);
  });
  it("snapOn defaults to true in the empty snapshot", () => {
    expect(selectSnapOn(snap())).toBe(true);
  });
});
