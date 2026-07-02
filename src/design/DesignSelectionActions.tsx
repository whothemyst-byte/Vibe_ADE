import type { ReactElement } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { alignPatches, distributePatches, type AlignEl, type AlignMode, type DistributeAxis } from "./align";
import { groupPatches, ungroupPatches } from "./groups";
import type { ZOp } from "./zorder";
import { commitPatches, commitReorder, setSelectedGroup } from "./commit";
import { selectSelection, selectionEqual, type DesignStore } from "./designStore";
import { useDesignSelector } from "./useDesignSelector";

/* Minimal 12x12 stroke icons; Phase 4's polish pass may replace them. */
const I = (d: string) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d={d} />
  </svg>
);
const ICONS: Record<string, ReactElement> = {
  "left": I("M1.5 1v10 M4 3.5h6 M4 8.5h4"),
  "center-h": I("M6 1v10 M2 3.5h8 M3.5 8.5h5"),
  "right": I("M10.5 1v10 M2 3.5h6 M4 8.5h4"),
  "top": I("M1 1.5h10 M3.5 4v6 M8.5 4v4"),
  "center-v": I("M1 6h10 M3.5 2v8 M8.5 3.5v5"),
  "bottom": I("M1 10.5h10 M3.5 2v6 M8.5 4v4"),
  "dist-h": I("M1.5 1v10 M10.5 1v10 M4.5 4h3v4h-3z"),
  "dist-v": I("M1 1.5h10 M1 10.5h10 M4 4.5h4v3h-4z"),
  "front": I("M4 4h7v7H4z M1 8V1h7"),
  "forward": I("M6 10V2 M3 5l3-3 3 3"),
  "backward": I("M6 2v8 M3 7l3 3 3-3"),
  "back": I("M1 1h7v7H1z M4 4h7v7"),
  "group": I("M1 1h4v4H1z M7 7h4v4H7z M5 3h3v2 M3 5v3h2"),
  "ungroup": I("M1 1h4v4H1z M7 7h4v4H7z"),
};

function Btn({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button className="design-action-btn" title={title} onPointerDown={(e) => { e.preventDefault(); onClick(); }}>
      {ICONS[icon]}
    </button>
  );
}

export function DesignSelectionActions({ store, apiRef }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const sel = useDesignSelector(store, selectSelection, selectionEqual);
  if (!sel) return null;

  const els = () => store.get().elements as unknown as readonly AlignEl[];
  const ids = () => store.get().selectedIds;

  function align(mode: AlignMode) {
    const api = apiRef.current;
    if (!api) return;
    const p = alignPatches(els(), ids(), mode);
    if (Object.keys(p).length) commitPatches(api, p);
  }
  function distribute(axis: DistributeAxis) {
    const api = apiRef.current;
    if (!api) return;
    const p = distributePatches(els(), ids(), axis);
    if (Object.keys(p).length) commitPatches(api, p);
  }
  function group() {
    const api = apiRef.current;
    if (!api) return;
    const r = groupPatches(els(), ids());
    if (!r) return;
    commitPatches(api, r.patches);
    setSelectedGroup(api, r.groupId, Object.keys(r.patches));
  }
  function ungroup() {
    const api = apiRef.current;
    if (!api) return;
    const p = ungroupPatches(els(), ids());
    if (p) commitPatches(api, p);
  }
  const z = (op: ZOp) => { const api = apiRef.current; if (api) commitReorder(api, op); };

  return (
    <div className="design-actions">
      {sel.count >= 2 && (
        <div className="design-actions-row">
          <Btn icon="left" title="Align left" onClick={() => align("left")} />
          <Btn icon="center-h" title="Align horizontal centers" onClick={() => align("center-h")} />
          <Btn icon="right" title="Align right" onClick={() => align("right")} />
          <Btn icon="top" title="Align top" onClick={() => align("top")} />
          <Btn icon="center-v" title="Align vertical centers" onClick={() => align("center-v")} />
          <Btn icon="bottom" title="Align bottom" onClick={() => align("bottom")} />
          {sel.count >= 3 && (
            <>
              <span className="design-action-sep" />
              <Btn icon="dist-h" title="Distribute horizontal spacing" onClick={() => distribute("horizontal")} />
              <Btn icon="dist-v" title="Distribute vertical spacing" onClick={() => distribute("vertical")} />
            </>
          )}
        </div>
      )}
      <div className="design-actions-row">
        <Btn icon="back" title="Send to back" onClick={() => z("back")} />
        <Btn icon="backward" title="Send backward" onClick={() => z("backward")} />
        <Btn icon="forward" title="Bring forward" onClick={() => z("forward")} />
        <Btn icon="front" title="Bring to front" onClick={() => z("front")} />
        {(sel.count >= 2 || sel.sharedGroup) && <span className="design-action-sep" />}
        {sel.count >= 2 && <Btn icon="group" title="Group (Ctrl+G)" onClick={group} />}
        {sel.sharedGroup && <Btn icon="ungroup" title="Ungroup (Ctrl+Shift+G)" onClick={ungroup} />}
      </div>
    </div>
  );
}
