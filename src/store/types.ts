export type WallMeta = {
  id: string;
  name: string;
  path: string;
  updatedAt: number;
  isCurrent: boolean;
};

export type SavedTerminal = {
  id: string; x: number; y: number; w: number; h: number; presetId: string; cwd: string;
};

export type Background =
  | { kind: "color"; color: string }
  | { kind: "image"; path: string }
  | { kind: "video"; path: string };

export type WallScene = {
  elements: unknown[];
  appState: { scrollX: number; scrollY: number; zoom: { value: number } };
};

export type WallDoc = {
  scene: WallScene;
  terminals: SavedTerminal[];
  background: Background;
};

export const DEFAULT_BACKGROUND: Background = { kind: "color", color: "#0b0e14" };
