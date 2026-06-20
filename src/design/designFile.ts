import { loadIndex, readTextFile, writeDesignFile } from "../store/persistence";
import { emptySceneJson } from "./normalize";

/** One UI per space: a single well-known file under the space's project folder. */
export const DESIGN_REL = "designs/ui.design.json";

/** Absolute path of a space folder's UI design file. */
export function designPath(spaceFolder: string): string {
  const base = spaceFolder.replace(/[/\\]+$/, "");
  return `${base}/${DESIGN_REL}`;
}

/** Resolve the design file path for a space id; null if the space is unknown. */
export async function resolveDesignPath(wallId: string): Promise<string | null> {
  const index = await loadIndex();
  const folder = index.find((w) => w.id === wallId)?.path;
  return folder ? designPath(folder) : null;
}

/** Ensure the file (and its parent `designs/` dir) exists before watching it.
 *  writeDesignFile creates parent directories. */
export async function ensureDesignFile(path: string): Promise<void> {
  const exists = await readTextFile(path).then(() => true).catch(() => false);
  if (!exists) await writeDesignFile(path, emptySceneJson());
}

/** The text inserted into a terminal to point an agent at the design file.
 *  Submitted as a non-final paste so the user can review before sending. */
export function formatReference(path: string): string {
  return `@${path} `;
}
