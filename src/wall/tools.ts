import type { ToolType } from "@excalidraw/excalidraw/types";

export type ToolDef = {
  /** Exact Excalidraw tool name passed to setActiveTool. */
  type: Extract<
    ToolType,
    "selection" | "hand" | "rectangle" | "diamond" | "ellipse" |
    "arrow" | "line" | "freedraw" | "text" | "image" | "eraser" | "frame"
  >;
  label: string;
  /** Single-key Excalidraw shortcut, shown in the tooltip. */
  shortcut: string;
  /** Glyph rendered on the key (swap for an icon set later if desired). */
  glyph: string;
};

export const TOOLS: ToolDef[] = [
  { type: "selection", label: "Select",    shortcut: "V", glyph: "⌖" },
  { type: "hand",      label: "Hand",      shortcut: "H", glyph: "✋" },
  { type: "rectangle", label: "Rectangle", shortcut: "R", glyph: "▭" },
  { type: "diamond",   label: "Diamond",   shortcut: "D", glyph: "◇" },
  { type: "ellipse",   label: "Ellipse",   shortcut: "O", glyph: "○" },
  { type: "arrow",     label: "Arrow",     shortcut: "A", glyph: "↗" },
  { type: "line",      label: "Line",      shortcut: "L", glyph: "╱" },
  { type: "freedraw",  label: "Draw",      shortcut: "P", glyph: "✎" },
  { type: "text",      label: "Text",      shortcut: "T", glyph: "T" },
  { type: "image",     label: "Image",     shortcut: "9", glyph: "▣" },
  { type: "eraser",    label: "Eraser",    shortcut: "E", glyph: "⌫" },
  { type: "frame",     label: "Frame",     shortcut: "F", glyph: "⊡" },
];
