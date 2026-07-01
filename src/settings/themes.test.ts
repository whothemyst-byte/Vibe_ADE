import { describe, expect, it } from "vitest";
import {
  DEFAULT_TITLEBAR_BG,
  readableTextColor,
  resolveTitlebarColors,
  THEMES,
  isThemeActive,
} from "./themes";

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

describe("readableTextColor", () => {
  it("returns dark ink for light colors", () => {
    expect(readableTextColor("#f3ead8")).toBe("#20170a");
  });

  it("returns near-white for dark colors", () => {
    expect(readableTextColor("#12110f")).toBe("#fbf6ec");
  });
});

describe("resolveTitlebarColors", () => {
  it("uses the background's own color when it's a solid color", () => {
    const result = resolveTitlebarColors({ kind: "color", color: "#f3ead8" }, "#d79a3d");
    expect(result.bg).toBe("#f3ead8");
    expect(result.text).toBe("#20170a");
    expect(result.border).toBe("#d79a3d");
  });

  it("falls back to the default titlebar background for a null background", () => {
    expect(resolveTitlebarColors(null, "#d79a3d").bg).toBe(DEFAULT_TITLEBAR_BG);
  });

  it("falls back to the default titlebar background for image and video backgrounds", () => {
    expect(resolveTitlebarColors({ kind: "image", path: "x.png" }, "#d79a3d").bg).toBe(DEFAULT_TITLEBAR_BG);
    expect(resolveTitlebarColors({ kind: "video", path: "x.mp4" }, "#d79a3d").bg).toBe(DEFAULT_TITLEBAR_BG);
  });

  it("always uses the passed accent as the border color", () => {
    expect(resolveTitlebarColors(null, "#5d8fb3").border).toBe("#5d8fb3");
  });
});
