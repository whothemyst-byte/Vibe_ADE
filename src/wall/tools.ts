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
};

/** The island renders each tool's stroke icon from TOOL_ICONS (see icons.tsx). */
export const TOOLS: ToolDef[] = [
  { type: "selection", label: "Select",    shortcut: "V" },
  { type: "hand",      label: "Hand",      shortcut: "H" },
  { type: "rectangle", label: "Rectangle", shortcut: "R" },
  { type: "diamond",   label: "Diamond",   shortcut: "D" },
  { type: "ellipse",   label: "Ellipse",   shortcut: "O" },
  { type: "arrow",     label: "Arrow",     shortcut: "A" },
  { type: "line",      label: "Line",      shortcut: "L" },
  { type: "freedraw",  label: "Draw",      shortcut: "P" },
  { type: "text",      label: "Text",      shortcut: "T" },
  { type: "image",     label: "Image",     shortcut: "9" },
  { type: "eraser",    label: "Eraser",    shortcut: "E" },
  { type: "frame",     label: "Frame",     shortcut: "F" },
];
