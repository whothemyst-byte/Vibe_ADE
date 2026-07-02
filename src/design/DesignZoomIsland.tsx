import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { anchoredZoom, stepZoom } from "./zoom";
import { setViewport } from "./commit";
import { selectZoom, type DesignStore } from "./designStore";
import { useDesignSelector } from "./useDesignSelector";

export function DesignZoomIsland({ store, apiRef }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const zoom = useDesignSelector(store, selectZoom);

  function applyZoom(next: number) {
    const api = apiRef.current;
    if (!api) return;
    const s = store.get();
    setViewport(api, anchoredZoom(
      { zoom: s.zoom, scrollX: s.scrollX, scrollY: s.scrollY, width: s.width, height: s.height },
      next,
    ));
  }

  function fitAll() {
    apiRef.current?.scrollToContent(undefined, {
      fitToViewport: true, viewportZoomFactor: 0.9, animate: true,
    });
  }

  function fitSelection() {
    const api = apiRef.current;
    if (!api) return;
    const sel = store.get().selectedIds;
    const els = api.getSceneElements().filter((e) => sel[e.id]);
    if (els.length) api.scrollToContent(els, {
      fitToViewport: true, viewportZoomFactor: 0.7, animate: true,
    });
  }

  return (
    <div className="design-zoom-island">
      <button className="design-zoom-btn" onClick={() => applyZoom(stepZoom(zoom, -1))} title="Zoom out">–</button>
      <button className="design-zoom-pct" onClick={() => applyZoom(1)} title="Reset to 100%">
        {Math.round(zoom * 100)}%
      </button>
      <button className="design-zoom-btn" onClick={() => applyZoom(stepZoom(zoom, 1))} title="Zoom in">+</button>
      <span className="design-tool-sep" />
      <button className="design-zoom-btn wide" onClick={fitAll} title="Zoom to fit everything">Fit</button>
      <button className="design-zoom-btn wide" onClick={fitSelection} title="Zoom to selection">Sel</button>
    </div>
  );
}
