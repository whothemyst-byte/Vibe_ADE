import { describe, it, expect } from "vitest";
import { serializeDesign } from "./serialize";
import { parseDesign, type DesignDoc } from "./schema";

const doc: DesignDoc = {
  version: 1,
  frames: [{ id: "f", name: "F", x: 0, y: 0, w: 10, h: 20,
    root: { id: "r", type: "stack", direction: "y", children: [] } }],
  components: {},
  tokens: { colors: { primary: "#d79a3d" } },
};

describe("serializeDesign", () => {
  it("emits pretty JSON ending in a newline", () => {
    const out = serializeDesign(doc);
    expect(out.endsWith("\n")).toBe(true);
    expect(out).toContain('  "version": 1');
  });

  it("orders top-level keys version, frames, components, tokens", () => {
    const out = serializeDesign(doc);
    const order = ["version", "frames", "components", "tokens"]
      .map((k) => out.indexOf(`"${k}"`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("round-trips: parse(serialize(doc)) deep-equals doc", () => {
    const res = parseDesign(serializeDesign(doc));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.doc).toEqual(doc);
  });

  it("is idempotent: serialize(parse(serialize(doc))) is stable", () => {
    const once = serializeDesign(doc);
    const res = parseDesign(once);
    expect(res.ok).toBe(true);
    if (res.ok) expect(serializeDesign(res.doc)).toBe(once);
  });
});
