/** The UI Design page's own toolbar. Deliberately NOT the wall's `TOOLS`: the
 *  wall is a space/canvas for arranging live windows, this is a screen design
 *  surface. Only tools that mean something when drawing an interface belong
 *  here — flowchart shapes (diamond) do not. Pure — no React imports. */
import type { ToolType } from "@excalidraw/excalidraw/types";

export type DesignToolDef = {
  /** Exact Excalidraw tool name passed to setActiveTool. */
  type: Extract<
    ToolType,
    "selection" | "hand" | "frame" | "rectangle" | "ellipse" |
    "line" | "arrow" | "text" | "image" | "freedraw" | "eraser"
  >;
  label: string;
  /** Single-key Excalidraw shortcut, shown in the tooltip. */
  shortcut: string;
};

/** Rendered top-to-bottom, one visual group per inner array. Frames come first
 *  after the navigation tools because every UI design starts with an artboard. */
export const DESIGN_TOOL_GROUPS: DesignToolDef[][] = [
  [
    { type: "selection", label: "Select", shortcut: "V" },
    { type: "hand", label: "Hand", shortcut: "H" },
  ],
  [
    { type: "frame", label: "Frame", shortcut: "F" },
  ],
  [
    { type: "rectangle", label: "Rectangle", shortcut: "R" },
    { type: "ellipse", label: "Ellipse", shortcut: "O" },
    { type: "line", label: "Line", shortcut: "L" },
    { type: "arrow", label: "Arrow", shortcut: "A" },
  ],
  [
    { type: "text", label: "Text", shortcut: "T" },
    { type: "image", label: "Image", shortcut: "9" },
  ],
  [
    { type: "freedraw", label: "Draw", shortcut: "P" },
    { type: "eraser", label: "Eraser", shortcut: "E" },
  ],
];

export const DESIGN_TOOLS: DesignToolDef[] = DESIGN_TOOL_GROUPS.flat();
