export type Preset = {
  id: string;
  label: string;
  icon: string;
  /** Command typed into the shell after spawn; undefined = plain shell. */
  command?: string;
};

export const DEFAULT_PRESETS: Preset[] = [
  { id: "plain", label: "Plain shell", icon: "▷" },
  { id: "claude", label: "Claude Code", icon: "✦", command: "claude" },
  { id: "codex", label: "Codex", icon: "◆", command: "codex" },
];

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
