/** Shared viewport helpers (zoom island + keyboard shortcuts). */
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export function fitAll(api: ExcalidrawImperativeAPI): void {
  api.scrollToContent(undefined, {
    fitToViewport: true, viewportZoomFactor: 0.9, animate: true,
  });
}

export function fitSelection(
  api: ExcalidrawImperativeAPI,
  selectedIds: Readonly<Record<string, boolean>>,
): void {
  const els = api.getSceneElements().filter((e) => selectedIds[e.id]);
  if (els.length) api.scrollToContent(els, {
    fitToViewport: true, viewportZoomFactor: 0.7, animate: true,
  });
}
