/** Rotating "Try …" suggestions for the hint pill, from live wall context. */
export function buildHints(agentNames: string[], presetLabels: string[]): string[] {
  const hints: string[] = [];
  const a = agentNames[0];
  if (a) {
    hints.push(
      `Try "ask ${a} to run the tests"`,
      `Try "tell ${a} to fix the failing build"`,
      `Try "ask ${a} what changed in this repo today"`
    );
  }
  for (const p of presetLabels.slice(0, 4)) {
    hints.push(`Try "open a ${p} terminal"`);
  }
  hints.push(`Try "apply the Ember theme"`, `Try "open the task board"`);
  return hints;
}
