import type { WallMeta } from "./types";

const basename = (p: string) => p.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "wall";

/** Build the WallMeta for a new space rooted at a folder path. Pure (no Tauri). */
export function spaceFromFolder(path: string): WallMeta {
  return { id: crypto.randomUUID(), name: basename(path), path, updatedAt: Date.now(), isCurrent: true };
}
