// Stubbed for Task 1 (tldraw removed). Full implementation in Task 2.
export interface TerminalShapeProps {
  w: number;
  h: number;
  presetId: string;
  label: string;
  cwd: string;
  started: boolean;
}

export type TerminalShape = {
  id: string;
  type: "terminal";
  x: number;
  y: number;
  props: TerminalShapeProps;
};
