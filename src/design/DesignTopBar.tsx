import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { BackIcon } from "../wall/icons";
import { setSnapMode } from "./commit";
import { selectSnapOn, selectZoom, type DesignStore } from "./designStore";
import { useDesignSelector } from "./useDesignSelector";

const SnapIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d="M3 1v5a3.5 3.5 0 0 0 7 0V1 M3 1h2.5 M7.5 1H10 M3 4h2.5 M7.5 4H10" />
  </svg>
);

export function DesignTopBar({ store, apiRef, onBack, onReference }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
  onBack: () => void;
  onReference: () => void;
}) {
  const zoom = useDesignSelector(store, selectZoom);
  const snapOn = useDesignSelector(store, selectSnapOn);
  return (
    <div className="design-topbar">
      <button className="cnvs-btn" onClick={onBack} title="Back to wall">
        <BackIcon />
      </button>
      <span className="design-title">UI Design</span>
      <span className="design-spacer" />
      <button
        className={`cnvs-btn design-snap${snapOn ? " active" : ""}`}
        onClick={() => { const api = apiRef.current; if (api) setSnapMode(api, !snapOn); }}
        title={snapOn ? "Snapping on — click to disable" : "Snapping off — click to enable"}
      >
        <SnapIcon />
      </button>
      <span className="design-zoom-readout">{Math.round(zoom * 100)}%</span>
      <button
        className="cnvs-btn design-ref"
        onClick={onReference}
        title="Reference this UI in the focused terminal"
      >
        @ Reference in terminal
      </button>
    </div>
  );
}
