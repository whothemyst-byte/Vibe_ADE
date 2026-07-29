/** Single mutation path for all panel-originated edits: version-correct
 *  (commitCore) and captured into undo history. Viewport moves and external
 *  (agent) reloads deliberately bypass undo. */
import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { AppState, BinaryFileData, ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { applyPatches, bumpElement, type El, type Patch } from "./commitCore";
import { reorderElements, type ZOp } from "./zorder";

export function commitPatches(
  api: ExcalidrawImperativeAPI,
  patches: Record<string, Patch>,
  capture: "immediately" | "eventually" = "immediately",
): void {
  const els = api.getSceneElements() as unknown as readonly El[];
  api.updateScene({
    elements: applyPatches(els, patches) as unknown as ExcalidrawElement[],
    captureUpdate: capture === "immediately"
      ? CaptureUpdateAction.IMMEDIATELY
      : CaptureUpdateAction.EVENTUALLY,
  });
}

export function selectOnly(api: ExcalidrawImperativeAPI, id: string): void {
  api.updateScene({
    appState: { selectedElementIds: { [id]: true } as AppState["selectedElementIds"] },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  });
}

export function applyExternalScene(
  api: ExcalidrawImperativeAPI,
  elements: ExcalidrawElement[],
  viewBackgroundColor: string,
  files: BinaryFileData[] = [],
): void {
  // Files first: an image element renders blank until its payload is registered.
  if (files.length) api.addFiles(files);
  api.updateScene({
    elements,
    appState: { viewBackgroundColor },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}

export function setViewport(
  api: ExcalidrawImperativeAPI,
  v: { zoom: number; scrollX: number; scrollY: number },
): void {
  api.updateScene({
    appState: { zoom: { value: v.zoom as NormalizedZoomValue }, scrollX: v.scrollX, scrollY: v.scrollY },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}

/** Reorder the scene array (z-order). Moved elements are bumped so the
 *  change is never reconciled away. One undo step. */
export function commitReorder(api: ExcalidrawImperativeAPI, op: ZOp): void {
  const els = api.getSceneElements() as unknown as readonly El[];
  const sel = api.getAppState().selectedElementIds as Record<string, boolean>;
  const next = reorderElements(els, sel, op);
  if (!next) return;
  const oldIndex = new Map(els.map((e, i) => [e.id, i]));
  const bumped = next.map((e, i) => (oldIndex.get(e.id) === i ? e : bumpElement(e)));
  api.updateScene({
    elements: bumped as unknown as ExcalidrawElement[],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/** After grouping, select the new group like Excalidraw would. */
export function setSelectedGroup(
  api: ExcalidrawImperativeAPI,
  groupId: string,
  memberIds: string[],
): void {
  api.updateScene({
    appState: {
      selectedGroupIds: { [groupId]: true },
      selectedElementIds: Object.fromEntries(memberIds.map((id) => [id, true])) as AppState["selectedElementIds"],
    },
    captureUpdate: CaptureUpdateAction.EVENTUALLY,
  });
}

export function setSnapMode(api: ExcalidrawImperativeAPI, on: boolean): void {
  api.updateScene({
    appState: { objectsSnapModeEnabled: on },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}

/** Drop a device artboard into the scene, select it, and bring it into view.
 *  One undo step. Returns to the selection tool the way Figma does, so the
 *  next click edits the new frame instead of drawing another one. */
export function commitInsertFrame(
  api: ExcalidrawImperativeAPI,
  frame: { x: number; y: number; width: number; height: number; name: string },
): void {
  const created = convertToExcalidrawElements([{ type: "frame", children: [], ...frame }]);
  const els = api.getSceneElements();
  api.updateScene({
    elements: [...els, ...created] as unknown as ExcalidrawElement[],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  const id = created[0]?.id;
  if (id) selectOnly(api, id);
  api.setActiveTool({ type: "selection" });
  // The frame lands beside the existing ones, which is usually off-screen.
  api.scrollToContent(created as unknown as ExcalidrawElement[], {
    fitToViewport: true, viewportZoomFactor: 0.8, animate: true,
  });
}

/** Select from the layers list the way the canvas would: a grouped element
 *  selects its whole outermost group. */
export function selectSmart(api: ExcalidrawImperativeAPI, id: string): void {
  const els = api.getSceneElements();
  const outerOf = (e: unknown): string | null => {
    const g = (e as { groupIds?: readonly string[] }).groupIds;
    return g?.length ? g[g.length - 1] : null;
  };
  const target = els.find((e) => e.id === id);
  const outer = target ? outerOf(target) : null;
  if (!outer) { selectOnly(api, id); return; }
  const memberIds = els.filter((e) => outerOf(e) === outer).map((e) => e.id);
  setSelectedGroup(api, outer, memberIds);
}
