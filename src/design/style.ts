import type { CSSProperties } from "react";
import type { DesignNode, Tokens } from "./schema";

const FALLBACK_PRIMARY = "#d79a3d"; // Quansynd amber

export function styleFor(node: DesignNode, tokens: Tokens): CSSProperties {
  const s: CSSProperties = {};
  if (node.type === "stack" || node.type === "row") {
    s.display = "flex";
    s.flexDirection = node.type === "row" || node.direction === "x" ? "row" : "column";
    if (node.gap !== undefined) s.gap = node.gap;
    if (node.padding !== undefined) s.padding = node.padding;
    if (node.align) s.alignItems = node.align;
    if (node.justify) s.justifyContent = node.justify;
  }
  if (node.type === "button" && node.variant === "primary") {
    s.background = tokens.colors?.primary ?? FALLBACK_PRIMARY;
    s.color = "#1a1714";
    s.borderRadius = 8;
    s.padding = node.padding ?? 12;
  }
  if (node.type === "input") {
    s.border = "1px solid #4a423a";
    s.borderRadius = 8;
    s.padding = node.padding ?? 10;
    s.background = "#1a1714";
    s.color = "#e8e2d8";
  }
  if (node.type === "rect") {
    s.background = node.style ? tokens.colors?.[node.style] ?? node.style : "#2a2520";
  }
  if (node.w !== undefined) s.width = node.w;
  if (node.h !== undefined) s.height = node.h;
  return s;
}
