import { terminalsOf, type Card } from "./cardStore";

export type RecipeEntry = { id: string; name: string; cmd: string };

/** Terminals with a non-empty boot-recipe command, in grid order. */
export function recipeEntries(cards: Card[]): RecipeEntry[] {
  return terminalsOf(cards)
    .filter((t) => (t.run ?? "").trim() !== "")
    .map((t) => ({ id: t.id, name: t.name, cmd: (t.run ?? "").trim() }));
}

/** Runs every entry through `send`; entries whose terminal has no live session land in `failed`. */
export function runRecipe(
  entries: RecipeEntry[],
  send: (id: string, cmd: string) => boolean
): { ran: RecipeEntry[]; failed: RecipeEntry[] } {
  const ran: RecipeEntry[] = [];
  const failed: RecipeEntry[] = [];
  for (const e of entries) (send(e.id, e.cmd) ? ran : failed).push(e);
  return { ran, failed };
}

/** One-line summary for the popover footer and Vibe's spoken reply. */
export function summarizeRun(r: { ran: RecipeEntry[]; failed: RecipeEntry[] }): string {
  if (!r.ran.length && !r.failed.length) return "This space has no boot recipe.";
  const parts: string[] = [];
  if (r.ran.length) {
    const n = r.ran.length === 1 ? "1 command" : `${r.ran.length} commands`;
    parts.push(`Ran ${n}: ${r.ran.map((e) => `${e.cmd} in ${e.name}`).join(", ")}.`);
  }
  if (r.failed.length) {
    parts.push(`Could not reach ${r.failed.map((e) => e.name).join(", ")} (no live session).`);
  }
  return parts.join(" ");
}
