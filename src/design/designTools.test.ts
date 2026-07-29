import { describe, it, expect } from "vitest";
import { DESIGN_TOOLS, DESIGN_TOOL_GROUPS, type DesignToolDef } from "./designTools";
import { TOOLS } from "../wall/tools";

describe("DESIGN_TOOLS", () => {
  it("leads with select/hand and puts the frame tool right after", () => {
    expect(DESIGN_TOOL_GROUPS[0].map((t) => t.type)).toEqual(["selection", "hand"]);
    expect(DESIGN_TOOL_GROUPS[1].map((t) => t.type)).toEqual(["frame"]);
  });

  it("carries no flowchart-only shapes", () => {
    expect(DESIGN_TOOLS.map((t) => t.type)).not.toContain("diamond");
  });

  it("has a label and a single-key shortcut for every tool", () => {
    for (const t of DESIGN_TOOLS as DesignToolDef[]) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.shortcut).toMatch(/^[A-Z0-9]$/);
    }
  });

  it("has no duplicate types or shortcuts", () => {
    expect(new Set(DESIGN_TOOLS.map((t) => t.type)).size).toBe(DESIGN_TOOLS.length);
    expect(new Set(DESIGN_TOOLS.map((t) => t.shortcut)).size).toBe(DESIGN_TOOLS.length);
  });

  it("is its own list, independent of the wall's toolbar", () => {
    expect(DESIGN_TOOLS.map((t) => t.type)).not.toEqual(TOOLS.map((t) => t.type));
  });

  it("keeps the shortcut Excalidraw actually binds for each shared tool", () => {
    // Same underlying canvas, so a tool present in both must not claim a
    // different key on the design page.
    for (const t of DESIGN_TOOLS) {
      const wall = TOOLS.find((w) => w.type === t.type);
      if (wall) expect(t.shortcut).toBe(wall.shortcut);
    }
  });
});
