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
