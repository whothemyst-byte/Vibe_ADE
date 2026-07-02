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
