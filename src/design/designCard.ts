import { useCardStore, type DesignCard } from "../wall/cardStore";
import { CELL } from "../wall/gridLayout";
import { removeCardWithFade } from "../wall/removeCard";
import { pickFolder, readTextFile, writeDesignFile } from "../store/persistence";
import { serializeDesign } from "./serialize";
import type { DesignDoc } from "./schema";

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

const STARTER: DesignDoc = {
  version: 1,
  frames: [{ id: "screen", name: "Screen", x: 24, y: 24, w: 390, h: 844,
    root: { id: "root", type: "stack", direction: "y", gap: 16, padding: 24, children: [
      { id: "t1", type: "text", text: "Sign in" },
      { id: "e1", type: "input", placeholder: "email" },
      { id: "b1", type: "button", text: "Continue", variant: "primary" },
    ] } }],
  components: {},
  tokens: { colors: { primary: "#d79a3d" } },
};

/** Pick a project folder, then open (seeding if missing) designs/sketch.design.json. */
export async function openDesignFromPicker(): Promise<void> {
  const dir = await pickFolder();
  if (!dir) return;
  const path = `${dir}/designs/sketch.design.json`;
  const exists = await readTextFile(path).then(() => true).catch(() => false);
  if (!exists) await writeDesignFile(path, serializeDesign(STARTER));
  openDesign(path, "sketch");
}
