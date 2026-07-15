/** A CSS token color identifying a preset's "tier" — used for the dot on terminals + launch menu. */
export function presetTierColor(presetId: string): string {
  switch (presetId) {
    case "plain": return "var(--text-faint)";
    case "claude": return "var(--accent)";
    case "codex": return "var(--info)";
    case "cursor": return "var(--ok)";
    case "gemini": return "#8a68c9"; // token set has no purple; codex owns --info
    default: return "var(--text-muted)";
  }
}
