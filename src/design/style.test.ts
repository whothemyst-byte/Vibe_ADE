import { describe, it, expect } from "vitest";
import { styleFor } from "./style";
import type { Tokens } from "./schema";

const tokens: Tokens = { colors: { primary: "#d79a3d" } };

describe("styleFor", () => {
  it("maps a y-stack to a column flexbox with gap/padding", () => {
    const s = styleFor(
      { id: "a", type: "stack", direction: "y", gap: 16, padding: 24 }, tokens);
    expect(s.display).toBe("flex");
    expect(s.flexDirection).toBe("column");
    expect(s.gap).toBe(16);
    expect(s.padding).toBe(24);
  });

  it("maps a row to a row flexbox", () => {
    const s = styleFor({ id: "a", type: "row" }, tokens);
    expect(s.flexDirection).toBe("row");
  });

  it("resolves a primary button variant to the brand color background", () => {
    const s = styleFor({ id: "b", type: "button", variant: "primary" }, tokens);
    expect(s.background).toBe("#d79a3d");
  });

  it("applies explicit width/height when present", () => {
    const s = styleFor({ id: "r", type: "rect", w: 40, h: 8 }, tokens);
    expect(s.width).toBe(40);
    expect(s.height).toBe(8);
  });
});
