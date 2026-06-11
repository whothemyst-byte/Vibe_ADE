import { describe, expect, it } from "vitest";
import { DEFAULT_PRESETS, resolvePreset, findPresetByPhrase } from "./presets";

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

describe("findPresetByPhrase", () => {
  it("empty phrase means no preference: first preset", () => {
    expect(findPresetByPhrase(DEFAULT_PRESETS, "")?.id).toBe("plain");
    expect(findPresetByPhrase(DEFAULT_PRESETS, "  ")?.id).toBe("plain");
  });

  it("matches by id and by label, any casing", () => {
    expect(findPresetByPhrase(DEFAULT_PRESETS, "codex")?.id).toBe("codex");
    expect(findPresetByPhrase(DEFAULT_PRESETS, "Claude Code")?.id).toBe("claude");
    expect(findPresetByPhrase(DEFAULT_PRESETS, "CLAUDE")?.id).toBe("claude");
  });

  it("matches when the phrase has extra words around the label", () => {
    expect(findPresetByPhrase(DEFAULT_PRESETS, "a claude code terminal please")?.id).toBe("claude");
    expect(findPresetByPhrase(DEFAULT_PRESETS, "the codex preset")?.id).toBe("codex");
    expect(findPresetByPhrase(DEFAULT_PRESETS, "plain shell terminal")?.id).toBe("plain");
  });

  it("matches on a single shared word", () => {
    expect(findPresetByPhrase(DEFAULT_PRESETS, "claude")?.id).toBe("claude");
    expect(findPresetByPhrase(DEFAULT_PRESETS, "shell")?.id).toBe("plain");
  });

  it("returns undefined for no match (caller reports the error)", () => {
    expect(findPresetByPhrase(DEFAULT_PRESETS, "gemini")).toBeUndefined();
  });
});
