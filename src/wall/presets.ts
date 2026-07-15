export type Preset = {
  id: string;
  label: string;
  icon: string;
  /** Command typed into the shell after spawn; undefined = plain shell. */
  command?: string;
};

/** Claude Code starts with the vibectl guide appended to its system prompt, so
    agents know the canvas channel (vibectl send / state / …) without anyone
    having to mention it in a message. PowerShell syntax: the default shell is
    powershell.exe, and VIBE_AGENT_GUIDE is injected into every Vibe Space PTY. */
const CLAUDE_COMMAND = 'claude --append-system-prompt-file "$env:VIBE_AGENT_GUIDE"';

export const DEFAULT_PRESETS: Preset[] = [
  { id: "plain", label: "Plain shell", icon: "▷" },
  { id: "claude", label: "Claude Code", icon: "✦", command: CLAUDE_COMMAND },
  { id: "codex", label: "Codex", icon: "◆", command: "codex" },
  // Cursor CLI installs BOTH `agent` and `cursor-agent` shims; use the
  // unambiguous one — bare `agent` collides with other vendors' CLIs
  // (Grok's agent.exe won PATH resolution on the dev machine).
  { id: "cursor", label: "Cursor", icon: "▸", command: "cursor-agent" },
  { id: "gemini", label: "Gemini", icon: "◈", command: "gemini" },
];

/** Heal presets persisted before the vibectl-aware launch command: a claude
    preset still running bare `claude` was never customized, so it picks up the
    new default. Anything else (user edits included) is returned by identity,
    letting the caller detect "changed" via `!==`. */
export function upgradeLegacyPresets(presets: Preset[]): Preset[] {
  return presets.map((p) =>
    p.id === "claude" && p.command === "claude" ? { ...p, command: CLAUDE_COMMAND } : p
  );
}

/** Appends default presets missing from a stored list — new app versions ship
    new agents, and a presets.json saved before then must still surface them.
    Returns the input by identity when nothing is missing, letting the caller
    detect "changed" via `!==` / length. Deliberate deletions of a default come
    back once per new default (accepted tradeoff; user edits are untouched). */
export function mergeNewDefaults(presets: Preset[]): Preset[] {
  const have = new Set(presets.map((p) => p.id));
  const missing = DEFAULT_PRESETS.filter((d) => !have.has(d.id));
  return missing.length ? [...presets, ...missing] : presets;
}

/** Resolve a preset by id, falling back to the first preset (plain) if not found. */
export function resolvePreset(presets: Preset[], id: string): Preset {
  return presets.find((p) => p.id === id) ?? presets[0] ?? DEFAULT_PRESETS[0];
}

/** The command typed into a fresh terminal's shell: an explicit per-card
    command (e.g. vibectl terminal --run) wins over the preset's. */
export function spawnCommand(card: { command?: string }, preset: Preset): string | undefined {
  return card.command ?? preset.command;
}

/**
 * Loose natural-language preset lookup ("a claude code terminal please").
 * Empty phrase = no preference = first preset. No match = undefined, so the
 * caller can report an error instead of silently opening the wrong preset.
 */
export function findPresetByPhrase(presets: Preset[], phrase: string): Preset | undefined {
  const p = phrase.trim().toLowerCase();
  if (!p) return presets[0];
  const exact = presets.find((x) => x.id.toLowerCase() === p || x.label.toLowerCase() === p);
  if (exact) return exact;
  const contains = presets.find(
    (x) => p.includes(x.label.toLowerCase()) || x.label.toLowerCase().includes(p)
  );
  if (contains) return contains;
  const words = new Set(p.split(/\s+/));
  return presets.find(
    (x) => x.label.toLowerCase().split(/\s+/).some((w) => words.has(w)) || words.has(x.id.toLowerCase())
  );
}
