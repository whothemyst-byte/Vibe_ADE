import { describe, it, expect } from "vitest";
import { TOOLS, type ToolDef } from "./tools";
import { TOOL_ICONS } from "./icons";

describe("TOOLS", () => {
  it("lists the drawing tools in island order", () => {
    expect(TOOLS.map((t) => t.type)).toEqual([
      "selection", "hand", "rectangle", "diamond", "ellipse",
      "arrow", "line", "freedraw", "text", "image", "eraser", "frame",
    ]);
  });

  it("gives every tool a label, a single-key shortcut, and an icon", () => {
    for (const t of TOOLS as ToolDef[]) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.shortcut).toMatch(/^[a-z0-9]$/i);
      expect(TOOL_ICONS[t.type]).toBeTypeOf("function");
    }
  });

  it("has no duplicate types or shortcuts", () => {
    expect(new Set(TOOLS.map((t) => t.type)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map((t) => t.shortcut.toLowerCase())).size).toBe(TOOLS.length);
  });
});
