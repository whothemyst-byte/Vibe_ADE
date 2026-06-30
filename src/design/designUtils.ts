export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

export function labelForElement(el: { type: string; text?: string }): string {
  if (el.type === "text") {
    const t = (el.text ?? "").trim();
    if (!t) return '"…"';
    const snippet = t.slice(0, 18);
    return `"${snippet}${t.length > 18 ? "…" : ""}"`;
  }
  return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}

export function patchElements(
  elements: readonly { id: string }[],
  id: string,
  patch: Record<string, unknown>
): unknown[] {
  return elements.map((el) => (el.id === id ? { ...el, ...patch } : el));
}
