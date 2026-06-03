/** A CSS token color identifying a preset's "tier" — used for the dot on terminals + launch menu. */
export function presetTierColor(presetId: string): string {
  switch (presetId) {
    case "plain": return "var(--text-faint)";
    case "claude": return "var(--accent)";
    case "codex": return "var(--info)";
    default: return "var(--text-muted)";
  }
}
