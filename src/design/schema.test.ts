import { describe, it, expect } from "vitest";
import { parseDesign } from "./schema";

const valid = JSON.stringify({
  version: 1,
  frames: [
    { id: "login", name: "Login", x: 0, y: 0, w: 390, h: 844,
      root: { id: "r", type: "stack", direction: "y", children: [
        { id: "t1", type: "text", text: "Sign in" },
      ] } },
  ],
  components: {},
  tokens: {},
});

describe("parseDesign", () => {
  it("accepts a valid document", () => {
    const res = parseDesign(valid);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.doc.frames[0].id).toBe("login");
  });

  it("rejects malformed JSON with a message", () => {
    const res = parseDesign("{ not json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/JSON/i);
  });

  it("rejects an unsupported version", () => {
    const res = parseDesign(JSON.stringify({ version: 2, frames: [] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/version/i);
  });

  it("rejects a frame missing required fields", () => {
    const res = parseDesign(JSON.stringify({ version: 1, frames: [{ id: "x" }] }));
    expect(res.ok).toBe(false);
  });

  it("rejects an unknown node type", () => {
    const bad = JSON.stringify({ version: 1, frames: [
      { id: "f", name: "F", x: 0, y: 0, w: 10, h: 10,
        root: { id: "r", type: "blink" } }] });
    const res = parseDesign(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/type/i);
  });
});
