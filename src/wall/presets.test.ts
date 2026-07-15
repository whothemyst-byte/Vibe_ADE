import { describe, expect, it } from "vitest";
import { DEFAULT_PRESETS, resolvePreset, findPresetByPhrase, mergeNewDefaults, spawnCommand, upgradeLegacyPresets } from "./presets";

const CLAUDE_COMMAND = 'claude --append-system-prompt-file "$env:VIBE_AGENT_GUIDE"';

describe("presets", () => {
  it("ships plain + claude + codex + cursor + gemini defaults; plain has no command", () => {
    expect(DEFAULT_PRESETS.map((p) => p.id)).toEqual(["plain", "claude", "codex", "cursor", "gemini"]);
    expect(DEFAULT_PRESETS[0].command).toBeUndefined();
  });

  it("cursor and gemini launch their CLIs", () => {
    expect(DEFAULT_PRESETS.find((p) => p.id === "cursor")?.command).toBe("agent");
    expect(DEFAULT_PRESETS.find((p) => p.id === "gemini")?.command).toBe("gemini");
  });

  it("claude launches with the vibectl guide appended to its system prompt", () => {
    expect(DEFAULT_PRESETS[1].command).toBe(CLAUDE_COMMAND);
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
    expect(findPresetByPhrase(DEFAULT_PRESETS, "aider")).toBeUndefined();
  });
});

describe("upgradeLegacyPresets", () => {
  it("upgrades a stored claude preset still on the bare command", () => {
    const stored = [
      { id: "plain", label: "Plain shell", icon: "▷" },
      { id: "claude", label: "Claude Code", icon: "✦", command: "claude" },
    ];
    const up = upgradeLegacyPresets(stored);
    expect(up[1].command).toBe(CLAUDE_COMMAND);
    expect(up[0]).toBe(stored[0]); // untouched entries keep identity (= no re-save)
  });

  it("leaves a user-customized claude command alone", () => {
    const stored = [{ id: "claude", label: "Claude Code", icon: "✦", command: "claude --model opus" }];
    expect(upgradeLegacyPresets(stored)).toEqual(stored);
    expect(upgradeLegacyPresets(stored)[0]).toBe(stored[0]);
  });

  it("is a no-op on already-current presets", () => {
    const up = upgradeLegacyPresets(DEFAULT_PRESETS);
    expect(up).toEqual(DEFAULT_PRESETS);
    expect(up.every((p, i) => p === DEFAULT_PRESETS[i])).toBe(true);
  });
});

describe("mergeNewDefaults", () => {
  it("appends defaults missing from a stored list, after the user's entries", () => {
    const stored = [
      { id: "plain", label: "Plain shell", icon: "▷" },
      { id: "claude", label: "Claude Code", icon: "✦", command: "claude --model opus" },
    ];
    const merged = mergeNewDefaults(stored);
    expect(merged.map((p) => p.id)).toEqual(["plain", "claude", "codex", "cursor", "gemini"]);
    expect(merged[1]).toBe(stored[1]); // user edits untouched
  });

  it("returns the same array by identity when nothing is missing (= no re-save)", () => {
    expect(mergeNewDefaults(DEFAULT_PRESETS)).toBe(DEFAULT_PRESETS);
  });
});

describe("spawnCommand", () => {
  const claude = DEFAULT_PRESETS.find((p) => p.id === "claude")!;
  const plain = DEFAULT_PRESETS.find((p) => p.id === "plain")!;

  it("uses the preset's command by default", () => {
    expect(spawnCommand({}, claude)).toBe(CLAUDE_COMMAND);
    expect(spawnCommand({}, plain)).toBeUndefined();
  });

  it("a per-card command overrides the preset", () => {
    expect(spawnCommand({ command: "npm run dev" }, plain)).toBe("npm run dev");
    expect(spawnCommand({ command: "npm run dev" }, claude)).toBe("npm run dev");
  });
});
