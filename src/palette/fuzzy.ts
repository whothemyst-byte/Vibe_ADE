/**
 * Case-insensitive subsequence scorer. Returns null when `query` is not a
 * subsequence of `text`; otherwise a score where word-boundary hits (+3) and
 * consecutive runs (+2) rank above scattered hits (+1). Empty query = 0 so it
 * matches everything without favoring anyone.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  let score = 0;
  let from = 0;
  let prevHit = -2;
  for (const ch of q) {
    const idx = t.indexOf(ch, from);
    if (idx === -1) return null;
    const atWordStart = idx === 0 || t[idx - 1] === " ";
    score += atWordStart ? 3 : idx === prevHit + 1 ? 2 : 1;
    prevHit = idx;
    from = idx + 1;
  }
  return score;
}

/** Best of the label and keyword scores; keyword hits are docked one point so
 *  an equal label hit always outranks them. */
export function scoreCandidate(
  query: string,
  label: string,
  keywords: string[]
): number | null {
  let best = fuzzyScore(query, label);
  for (const k of keywords) {
    const s = fuzzyScore(query, k);
    if (s === null) continue;
    const docked = s - 1;
    if (best === null || docked > best) best = docked;
  }
  return best;
}

/** Filters and sorts by score (desc), ties broken by original registry order. */
export function rankActions<T extends { label: string; keywords: string[] }>(
  query: string,
  actions: T[]
): T[] {
  if (!query.trim()) return actions;
  return actions
    .map((a, i) => ({ a, i, s: scoreCandidate(query, a.label, a.keywords) }))
    .filter((x): x is { a: T; i: number; s: number } => x.s !== null)
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map((x) => x.a);
}
