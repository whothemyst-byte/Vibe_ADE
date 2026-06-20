import { useCardStore, type FileCard } from "./cardStore";
import { CELL } from "./gridLayout";
import { removeCardWithFade } from "./removeCard";

export const FILE_ID = "wall-file";

export function fileCard(): FileCard | undefined {
  return useCardStore.getState().cards.find((c): c is FileCard => c.kind === "file");
}

/** Opens the file viewer card (the grid re-flows) or points the existing one at `path`. */
export function openFile(path: string, name: string): void {
  if (fileCard()) {
    useCardStore.getState().update(FILE_ID, { path, name });
    return;
  }
  useCardStore.getState().add({
    kind: "file",
    id: FILE_ID,
    path,
    name,
    x: 0,
    y: 0,
    w: CELL.w,
    h: CELL.h, // placeholder; the grid layout positions it
  });
}

export function closeFile(): void {
  if (fileCard()) removeCardWithFade(FILE_ID);
}
