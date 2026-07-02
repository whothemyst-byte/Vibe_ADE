import { describe, it, expect } from "vitest";
import {
  createDesignStore, EMPTY_SNAPSHOT, selectLayers, layersEqual,
  selectInspector, inspectorEqual, type DesignSnapshot, type StoreElement,
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

describe("selectInspector", () => {
  it("is null when nothing is selected", () => {
    expect(selectInspector(snap({ elements: [el()] }))).toBeNull();
  });
  it("exposes the first selected element's editable fields, rounded position", () => {
    const s = snap({
      elements: [el({ id: "a", angle: Math.PI })],
      selectedIds: { a: true },
    });
    const i = selectInspector(s)!;
    expect(i.id).toBe("a");
    expect(i.x).toBe(10);       // rounded for display stability
    expect(i.y).toBe(21);
    expect(i.angleDeg).toBe(180);
    expect(i.fontSize).toBeNull();
  });
  it("exposes fontSize for text elements", () => {
    const s = snap({
      elements: [el({ id: "t", type: "text", fontSize: 24 })],
      selectedIds: { t: true },
    });
    expect(selectInspector(s)!.fontSize).toBe(24);
  });
  it("inspectorEqual: equal for same values, different after a move", () => {
    const a = snap({ elements: [el({ id: "a" })], selectedIds: { a: true } });
    const b = snap({ elements: [el({ id: "a" })], selectedIds: { a: true } });
    const c = snap({ elements: [el({ id: "a", x: 999 })], selectedIds: { a: true } });
    expect(inspectorEqual(selectInspector(a), selectInspector(b))).toBe(true);
    expect(inspectorEqual(selectInspector(a), selectInspector(c))).toBe(false);
    expect(inspectorEqual(null, null)).toBe(true);
    expect(inspectorEqual(selectInspector(a), null)).toBe(false);
  });
});
