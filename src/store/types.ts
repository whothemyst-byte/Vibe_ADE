export type WallMeta = {
  id: string;
  name: string;
  path: string;
  updatedAt: number;
  isCurrent: boolean;
  /** Set when this local space is linked to a shared org project. */
  sharedOrgSpaceId?: string;
  /** The org_space.version this local copy is based on (for last-write-wins). */
  cloudVersion?: number;
};

export type SavedTerminal = {
  id: string; x: number; y: number; w: number; h: number; presetId: string; cwd: string;
  name?: string;
  /** Boot-recipe command. Replayed only via the Boot recipe UI/voice — never on wall load. */
  run?: string;
};

export type Background =
  | { kind: "color"; color: string }
  | { kind: "image"; path?: string; url?: string }
  | { kind: "video"; path?: string; url?: string };

export type WallScene = {
  elements: unknown[];
  appState: { scrollX: number; scrollY: number; zoom: { value: number } };
};

export type SavedBrowser = { url: string; gridIndex: number };

export type SavedMusic = { stationId: string; url: string; gridIndex: number };

export type WallDoc = {
  scene: WallScene;
  terminals: SavedTerminal[];
  background: Background;
  /** World-space center of the managed terminal grid. */
  gridAnchor?: { x: number; y: number };
  /** The wall's single browser card, if open when last saved. */
  browser?: SavedBrowser;
  /** The wall's music card, if open when last saved. Restores paused. */
  music?: SavedMusic;
};

export const DEFAULT_BACKGROUND: Background = { kind: "color", color: "#12110f" };
