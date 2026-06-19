import { useCardStore, type DesignCard } from "../wall/cardStore";
import { CELL } from "../wall/gridLayout";
import { removeCardWithFade } from "../wall/removeCard";

export const DESIGN_ID = "wall-design";

export function designCard(): DesignCard | undefined {
  return useCardStore.getState().cards.find((c): c is DesignCard => c.kind === "design");
}

/** Opens the design card (grid re-flows) or re-points the existing one at `path`. */
export function openDesign(path: string, name: string): void {
  if (designCard()) {
    useCardStore.getState().update(DESIGN_ID, { path, name });
    return;
  }
  useCardStore.getState().add({
    kind: "design",
    id: DESIGN_ID,
    path,
    name,
    x: 0,
    y: 0,
    w: CELL.w,
    h: CELL.h, // placeholder; the grid layout positions it
  });
}

export function closeDesign(): void {
  if (designCard()) removeCardWithFade(DESIGN_ID);
}
