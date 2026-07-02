/** Single mutation path for all panel-originated edits: version-correct
 *  (commitCore) and captured into undo history. Viewport moves and external
 *  (agent) reloads deliberately bypass undo. */
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { applyPatches, type El, type Patch } from "./commitCore";

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
): void {
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
