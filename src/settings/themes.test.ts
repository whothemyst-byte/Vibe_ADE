import { describe, expect, it } from "vitest";
import { readableTextColor, THEMES, SCENE_THEMES, isThemeActive, accentForBackground, DEFAULT_ACCENT } from "./themes";

describe("THEMES", () => {
  it("ships unique ids across appearance and video themes", () => {
    expect(THEMES.length).toBeGreaterThan(0);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
  });

  it("every theme has a name, tagline, and background", () => {
    for (const t of THEMES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.tagline.length).toBeGreaterThan(0);
      expect(["color", "image", "video"]).toContain(t.background.kind);
    }
  });
});

describe("SCENE_THEMES", () => {
  it("has 8 scenes with unique ids and bundled urls", () => {
    expect(SCENE_THEMES).toHaveLength(8);
    expect(new Set(SCENE_THEMES.map((t) => t.id)).size).toBe(8);
    for (const t of SCENE_THEMES) {
      expect(t.background.kind).toBe("image");
      expect("url" in t.background && t.background.url).toMatch(/^\/themes\/scenes\/[a-z-]+\.png$/);
      expect(t.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("drives the accent through accentForBackground", () => {
    const meadow = SCENE_THEMES.find((t) => t.id === "meadow-night")!;
    expect(accentForBackground(meadow.background)).toBe(meadow.accent);
    expect(accentForBackground(meadow.background)).not.toBe(DEFAULT_ACCENT);
  });
});

describe("isThemeActive", () => {
  it("matches color backgrounds case-insensitively", () => {
    const dark = THEMES[0];
    expect(isThemeActive({ kind: "color", color: "#12110F" }, dark)).toBe(true);
    expect(isThemeActive({ kind: "color", color: "#000000" }, dark)).toBe(false);
  });

  it("matches video backgrounds by url", () => {
    const room = THEMES.find((t) => t.id === "room")!;
    expect(isThemeActive({ kind: "video", url: "/themes/room.mp4" }, room)).toBe(true);
    expect(isThemeActive({ kind: "video", url: "/themes/other.mp4" }, room)).toBe(false);
  });

  it("never matches image backgrounds against a color theme", () => {
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
