export type WallMeta = {
  id: string;
  name: string;
  path: string;
  updatedAt: number;
  isCurrent: boolean;
};

export type SavedTerminal = {
  id: string; x: number; y: number; w: number; h: number; presetId: string; cwd: string;
  name?: string;
};

export type Background =
  | { kind: "color"; color: string }
  | { kind: "image"; path: string }
  | { kind: "video"; path: string };

export type WallScene = {
  elements: unknown[];
  appState: { scrollX: number; scrollY: number; zoom: { value: number } };
};

export type SavedBrowser = { url: string; gridIndex: number };

export type WallDoc = {
  scene: WallScene;
  terminals: SavedTerminal[];
  background: Background;
  /** World-space center of the managed terminal grid. */
  gridAnchor?: { x: number; y: number };
  /** The wall's single browser card, if open when last saved. */
  browser?: SavedBrowser;
};

export const DEFAULT_BACKGROUND: Background = { kind: "color", color: "#12110f" };
