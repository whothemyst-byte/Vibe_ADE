import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { anchoredZoom, stepZoom } from "./zoom";
import { setViewport } from "./commit";
import { fitAll, fitSelection } from "./viewport";
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

  return (
    <div className="design-zoom-island">
      <button className="design-zoom-btn" onClick={() => applyZoom(stepZoom(zoom, -1))} title="Zoom out">–</button>
      <button className="design-zoom-pct" onClick={() => applyZoom(1)} title="Reset to 100%">
        {Math.round(zoom * 100)}%
      </button>
      <button className="design-zoom-btn" onClick={() => applyZoom(stepZoom(zoom, 1))} title="Zoom in">+</button>
      <span className="design-tool-sep" />
      <button className="design-zoom-btn wide" onClick={() => { const api = apiRef.current; if (api) fitAll(api); }} title="Zoom to fit everything (Shift+1)">Fit</button>
      <button className="design-zoom-btn wide" onClick={() => { const api = apiRef.current; if (api) fitSelection(api, store.get().selectedIds); }} title="Zoom to selection (Shift+2)">Sel</button>
    </div>
  );
}
