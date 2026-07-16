import { describe, it, expect } from "vitest";
import { buildHints } from "./hints";

describe("buildHints", () => {
  it("uses a live agent name in agent hints", () => {
    const hints = buildHints(["Max"], ["Claude Code"]);
    expect(hints.some((h) => h.includes("Max"))).toBe(true);
  });
  it("falls back to open-terminal hints when no agents exist", () => {
    const hints = buildHints([], ["Claude Code", "Codex"]);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some((h) => h.toLowerCase().includes("claude code"))).toBe(true);
    expect(hints.every((h) => !h.includes("undefined"))).toBe(true);
  });
  it("rotates in every agent preset it is given (Cursor, Gemini included)", () => {
    const hints = buildHints([], ["Claude Code", "Codex", "Cursor", "Gemini"]);
    expect(hints.some((h) => h.includes("Cursor"))).toBe(true);
    expect(hints.some((h) => h.includes("Gemini"))).toBe(true);
  });
  it("suggests the music player", () => {
    expect(buildHints([], []).some((h) => h.includes("play some music"))).toBe(true);
  });
  it("is deterministic for the same inputs", () => {
    expect(buildHints(["Max"], ["Codex"])).toEqual(buildHints(["Max"], ["Codex"]));
  });
});
