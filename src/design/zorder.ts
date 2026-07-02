/** Z-order moves over the scene array (index 0 = bottom). Pure. */

export type ZOp = "front" | "back" | "forward" | "backward";

export function reorderElements<T extends { id: string }>(
  els: readonly T[],
  selectedIds: Readonly<Record<string, boolean>>,
  op: ZOp,
): T[] | null {
  const isSel = (e: T) => selectedIds[e.id] === true;
  let next: T[];
  if (op === "front") {
    next = [...els.filter((e) => !isSel(e)), ...els.filter(isSel)];
  } else if (op === "back") {
    next = [...els.filter(isSel), ...els.filter((e) => !isSel(e))];
  } else {
    next = [...els];
    if (op === "forward") {
      for (let i = next.length - 2; i >= 0; i--) {
        if (isSel(next[i]) && !isSel(next[i + 1])) {
          [next[i], next[i + 1]] = [next[i + 1], next[i]];
        }
      }
    } else {
      for (let i = 1; i < next.length; i++) {
        if (isSel(next[i]) && !isSel(next[i - 1])) {
          [next[i], next[i - 1]] = [next[i - 1], next[i]];
        }
      }
    }
  }
  const changed = next.some((e, i) => e !== els[i]);
  return changed ? next : null;
}
