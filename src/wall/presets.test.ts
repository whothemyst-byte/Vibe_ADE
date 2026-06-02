import { describe, expect, it } from "vitest";
import { DEFAULT_PRESETS, resolvePreset } from "./presets";

describe("presets", () => {
  it("ships plain + claude + codex defaults; plain has no command", () => {
    expect(DEFAULT_PRESETS.map((p) => p.id)).toEqual(["plain", "claude", "codex"]);
    expect(DEFAULT_PRESETS[0].command).toBeUndefined();
    expect(DEFAULT_PRESETS[1].command).toBe("claude");
  });

  it("resolves a preset by id", () => {
    expect(resolvePreset(DEFAULT_PRESETS, "claude")?.label).toBe("Claude Code");
  });

  it("falls back to the plain preset for an unknown id", () => {
    expect(resolvePreset(DEFAULT_PRESETS, "nope").id).toBe("plain");
  });
});
