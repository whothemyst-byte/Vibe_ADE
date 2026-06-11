import { describe, expect, it } from "vitest";
import { THEMES, isThemeActive } from "./themes";

describe("THEMES", () => {
  it("ships six themes with unique ids", () => {
    expect(THEMES).toHaveLength(6);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(6);
  });

  it("every theme has a name, tagline, color background, and palette", () => {
    for (const t of THEMES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.tagline.length).toBeGreaterThan(0);
      expect(t.background.kind).toBe("color");
      expect(t.palette.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("isThemeActive", () => {
  it("matches color backgrounds case-insensitively", () => {
    const ember = THEMES[0];
    expect(isThemeActive({ kind: "color", color: "#12110F" }, ember)).toBe(true);
    expect(isThemeActive({ kind: "color", color: "#000000" }, ember)).toBe(false);
  });

  it("never matches image or video backgrounds", () => {
    expect(isThemeActive({ kind: "image", path: "x.png" }, THEMES[0])).toBe(false);
  });
});
