import { describe, it, expect } from "vitest";
import { buildLayerTree, flattenLayerTree, layerTreeEqual, type LayerEl } from "./layerTree";

const el = (over: Partial<LayerEl> & { id: string }): LayerEl => ({
  type: "rectangle", version: 1, versionNonce: 1, updated: 1, opacity: 100, ...over,
});
const frame = (id: string, over: Partial<LayerEl> = {}): LayerEl =>
  el({ id, type: "frame", name: id, ...over });

const keys = (nodes: ReturnType<typeof buildLayerTree>) => nodes.map((n) => n.key);

describe("buildLayerTree", () => {
  it("nests a frame's children under it", () => {
    const tree = buildLayerTree(
      [frame("f1"), el({ id: "a", frameId: "f1" }), el({ id: "b", frameId: "f1" })],
      {},
    );
    expect(keys(tree)).toEqual(["f1"]);
    expect(keys(tree[0].children)).toEqual(["b", "a"]);
  });

  it("lists topmost first at every level", () => {
    const tree = buildLayerTree([el({ id: "low" }), el({ id: "high" })], {});
    expect(keys(tree)).toEqual(["high", "low"]);
  });

  it("keeps unframed elements at the top level", () => {
    const tree = buildLayerTree([frame("f1"), el({ id: "loose" })], {});
    expect(keys(tree)).toEqual(["loose", "f1"]);
  });

  it("labels a frame by its name, not its type", () => {
    const tree = buildLayerTree([frame("f1", { name: "iPhone 16 Pro" })], {});
    expect(tree[0].label).toBe("iPhone 16 Pro");
  });

  it("falls back to 'Frame' for an unnamed frame", () => {
    const tree = buildLayerTree([frame("f1", { name: null })], {});
    expect(tree[0].label).toBe("Frame");
  });

  it("keeps an element whose frame no longer exists at the top level", () => {
    const tree = buildLayerTree([el({ id: "orphan", frameId: "gone" })], {});
    expect(keys(tree)).toEqual(["orphan"]);
  });

  it("drops deleted elements", () => {
    const tree = buildLayerTree([el({ id: "a" }), el({ id: "b", isDeleted: true })], {});
    expect(keys(tree)).toEqual(["a"]);
  });

  it("nests a group as its own row", () => {
    const tree = buildLayerTree(
      [el({ id: "a", groupIds: ["g1"] }), el({ id: "b", groupIds: ["g1"] })],
      {},
    );
    expect(keys(tree)).toEqual(["group:g1"]);
    expect(keys(tree[0].children)).toEqual(["b", "a"]);
    expect(tree[0].memberIds.sort()).toEqual(["a", "b"]);
  });

  it("nests groups within groups, outermost first", () => {
    const tree = buildLayerTree(
      [el({ id: "a", groupIds: ["inner", "outer"] }), el({ id: "b", groupIds: ["outer"] })],
      {},
    );
    expect(keys(tree)).toEqual(["group:outer"]);
    expect(keys(tree[0].children)).toEqual(["b", "group:inner"]);
    expect(keys(tree[0].children[1].children)).toEqual(["a"]);
  });

  it("groups elements inside a frame under that frame", () => {
    const tree = buildLayerTree(
      [
        frame("f1"),
        el({ id: "a", frameId: "f1", groupIds: ["g1"] }),
        el({ id: "b", frameId: "f1", groupIds: ["g1"] }),
      ],
      {},
    );
    expect(keys(tree)).toEqual(["f1"]);
    expect(keys(tree[0].children)).toEqual(["group:g1"]);
    expect(keys(tree[0].children[0].children)).toEqual(["b", "a"]);
  });

  it("reunites group members that are not contiguous in z-order", () => {
    const tree = buildLayerTree(
      [el({ id: "a", groupIds: ["g1"] }), el({ id: "mid" }), el({ id: "b", groupIds: ["g1"] })],
      {},
    );
    expect(keys(tree)).toEqual(["group:g1", "mid"]);
    expect(keys(tree[0].children)).toEqual(["b", "a"]);
  });

  it("marks a group selected only when every member is", () => {
    const els = [el({ id: "a", groupIds: ["g1"] }), el({ id: "b", groupIds: ["g1"] })];
    expect(buildLayerTree(els, { a: true, b: true })[0].selected).toBe(true);
    expect(buildLayerTree(els, { a: true })[0].selected).toBe(false);
  });

  it("marks a group hidden only when every member is", () => {
    const hide = { customData: { vsHidden: true }, opacity: 0 };
    const both = [el({ id: "a", groupIds: ["g1"], ...hide }), el({ id: "b", groupIds: ["g1"], ...hide })];
    expect(buildLayerTree(both, {})[0].hidden).toBe(true);
    const one = [el({ id: "a", groupIds: ["g1"], ...hide }), el({ id: "b", groupIds: ["g1"] })];
    expect(buildLayerTree(one, {})[0].hidden).toBe(false);
  });

  it("puts the frame's own id first in memberIds so its row selects the frame", () => {
    const tree = buildLayerTree([frame("f1"), el({ id: "a", frameId: "f1" })], {});
    expect(tree[0].memberIds[0]).toBe("f1");
  });
});

describe("flattenLayerTree", () => {
  const tree = () => buildLayerTree(
    [frame("f1"), el({ id: "a", frameId: "f1" }), el({ id: "b", frameId: "f1" })],
    {},
  );

  it("indents children by depth", () => {
    const rows = flattenLayerTree(tree(), new Set());
    expect(rows.map((r) => [r.key, r.depth])).toEqual([["f1", 0], ["b", 1], ["a", 1]]);
  });

  it("hides the contents of a collapsed row", () => {
    const rows = flattenLayerTree(tree(), new Set(["f1"]));
    expect(rows.map((r) => r.key)).toEqual(["f1"]);
  });

  it("flags which rows can expand", () => {
    const rows = flattenLayerTree(tree(), new Set());
    expect(rows[0].hasChildren).toBe(true);
    expect(rows[1].hasChildren).toBe(false);
  });
});

describe("layerTreeEqual", () => {
  const build = (selected: Record<string, boolean> = {}) =>
    buildLayerTree([frame("f1"), el({ id: "a", frameId: "f1" })], selected);

  it("is true for two identical trees", () => {
    expect(layerTreeEqual(build(), build())).toBe(true);
  });

  it("notices a selection change deep in the tree", () => {
    expect(layerTreeEqual(build(), build({ a: true }))).toBe(false);
  });

  it("notices a structural change", () => {
    expect(layerTreeEqual(build(), buildLayerTree([frame("f1")], {}))).toBe(false);
  });
});
