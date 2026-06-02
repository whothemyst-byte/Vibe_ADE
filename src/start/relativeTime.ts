/** Human "x ago" label from an epoch-ms timestamp. `now` is injectable for tests. */
export function relativeTime(updatedAt: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - updatedAt);
  const m = 60_000, h = 60 * m, d = 24 * h;
  if (diff < m) return "just now";
  if (diff < h) return `${Math.floor(diff / m)}m ago`;
  if (diff < d) return `${Math.floor(diff / h)}h ago`;
  return `${Math.floor(diff / d)}d ago`;
}
