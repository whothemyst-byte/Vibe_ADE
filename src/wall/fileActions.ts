import { useCardStore, type FileCard } from "./cardStore";
import { PENDING_RECT } from "./gridLayout";
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
    ...PENDING_RECT,
  });
}

export function closeFile(): void {
  if (fileCard()) removeCardWithFade(FILE_ID);
}
