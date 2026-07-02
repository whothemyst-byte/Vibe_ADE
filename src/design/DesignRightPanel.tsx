import { useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { degToRad } from "./designUtils";
import { hidePatch, unhidePatch, isHidden, type Patch } from "./commitCore";
import { commitPatches, selectOnly } from "./commit";
import {
  selectInspector, inspectorEqual, selectLayers, layersEqual, type DesignStore,
} from "./designStore";
import { useDesignSelector } from "./useDesignSelector";
import { TOOL_ICONS, SelectIcon } from "../wall/icons";

function ShapeIcon({ type }: { type: string }) {
  const Icon = TOOL_ICONS[type as keyof typeof TOOL_ICONS];
  return <span className="design-layer-icon">{Icon ? <Icon /> : <SelectIcon />}</span>;
}

/** Number field that tracks live canvas values while idle but never fights
 *  in-progress typing. Enter/blur commits, Escape cancels. */
function NumInput({ label, value, onCommit, narrow }: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  narrow?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  return (
    <div className="design-prop-row">
      <span className="design-prop-label">{label}</span>
      <input
        type="number"
        className={`design-prop-input${narrow ? " narrow" : ""}`}
        value={draft ?? String(value)}
        onFocus={(e) => setDraft(e.target.value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          if (!cancelled.current) {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v !== value) onCommit(v);
          }
          cancelled.current = false;
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { cancelled.current = true; (e.target as HTMLInputElement).blur(); }
        }}
      />
    </div>
  );
}

/** Width/height patches don't rescale linear elements' points, so W/H
 *  inputs are hidden for them (canvas-resize still works). */
const NO_WH_TYPES = new Set(["line", "arrow", "freedraw"]);

export function DesignRightPanel({ store, apiRef }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const insp = useDesignSelector(store, selectInspector, inspectorEqual);
  const layers = useDesignSelector(store, selectLayers, layersEqual);
  const [opDraft, setOpDraft] = useState<number | null>(null);

  function commit(id: string, patch: Patch, capture: "immediately" | "eventually" = "immediately") {
    const api = apiRef.current;
    if (api) commitPatches(api, { [id]: patch }, capture);
  }

  function toggleHidden(id: string) {
    const api = apiRef.current;
    const el = store.get().elements.find((e) => e.id === id);
    if (!api || !el) return;
    commitPatches(api, { [id]: isHidden(el) ? unhidePatch(el) : hidePatch(el) });
  }

  return (
    <div className="design-right">
      {/* ── Properties ── */}
      <div className="design-props">
        {insp ? (
          <>
            <span className="design-section-label">Transform</span>
            <div className="design-prop-section">
              <div className="design-prop-row">
                <NumInput label="X" value={insp.x} onCommit={(v) => commit(insp.id, { x: v })} />
                <NumInput label="Y" value={insp.y} onCommit={(v) => commit(insp.id, { y: v })} />
              </div>
              {!NO_WH_TYPES.has(insp.type) && (
                <div className="design-prop-row">
                  <NumInput label="W" value={insp.width} onCommit={(v) => commit(insp.id, { width: v })} />
                  <NumInput label="H" value={insp.height} onCommit={(v) => commit(insp.id, { height: v })} />
                </div>
              )}
              <NumInput label="°" value={insp.angleDeg} onCommit={(v) => commit(insp.id, { angle: degToRad(v) })} />
            </div>

            <span className="design-section-label">Appearance</span>
            <div className="design-prop-section">
              <div className="design-prop-row">
                <span className="design-prop-label">Fi</span>
                <div className="design-color-swatch">
                  <input
                    type="color"
                    value={insp.backgroundColor === "transparent" ? "#000000" : insp.backgroundColor}
                    onChange={(e) => commit(insp.id, { backgroundColor: e.target.value }, "eventually")}
                    onBlur={(e) => commit(insp.id, { backgroundColor: e.target.value })}
                  />
                </div>
                <span className="design-prop-label">St</span>
                <div className="design-color-swatch">
                  <input
                    type="color"
                    value={insp.strokeColor}
                    onChange={(e) => commit(insp.id, { strokeColor: e.target.value }, "eventually")}
                    onBlur={(e) => commit(insp.id, { strokeColor: e.target.value })}
                  />
                </div>
                <NumInput label="" value={insp.strokeWidth} narrow onCommit={(v) => commit(insp.id, { strokeWidth: v })} />
              </div>
              <div className="design-prop-row">
                <span className="design-prop-label">Op</span>
                <input
                  type="range"
                  min={0} max={100}
                  style={{ flex: 1 }}
                  value={opDraft ?? insp.opacity}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setOpDraft(v);
                    commit(insp.id, { opacity: v }, "eventually"); // live preview, no undo spam
                  }}
                  onPointerUp={() => {
                    if (opDraft !== null) commit(insp.id, { opacity: opDraft }); // one undo step
                    setOpDraft(null);
                  }}
                />
                <span className="design-prop-opacity">{opDraft ?? insp.opacity}%</span>
              </div>
            </div>

            {insp.fontSize !== null && (
              <>
                <span className="design-section-label">Text</span>
                <div className="design-prop-section">
                  <NumInput label="Sz" value={insp.fontSize} onCommit={(v) => commit(insp.id, { fontSize: v })} />
                </div>
              </>
            )}
          </>
        ) : (
          <div className="design-props-empty">Select a shape to inspect it</div>
        )}
      </div>

      {/* ── Layers ── */}
      <div className="design-layers">
        <div className="design-layers-head">Layers</div>
        <div className="design-layers-list">
          {layers.map((row) => (
            <div
              key={row.id}
              className={`design-layer-row${row.selected ? " ds-selected" : ""}`}
              onClick={() => { const api = apiRef.current; if (api) selectOnly(api, row.id); }}
            >
              <ShapeIcon type={row.type} />
              <span className="design-layer-name">{row.label}</span>
              <div className="design-layer-actions">
                <button
                  className="design-layer-btn"
                  title={row.hidden ? "Show" : "Hide"}
                  onPointerDown={(e) => { e.stopPropagation(); toggleHidden(row.id); }}
                >
                  {row.hidden ? "○" : "●"}
                </button>
                <button
                  className="design-layer-btn"
                  title={row.hidden ? "Unhide to change lock" : row.locked ? "Unlock" : "Lock"}
                  disabled={row.hidden}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!row.hidden) commit(row.id, { locked: !row.locked });
                  }}
                >
                  {row.locked ? "🔒" : "🔓"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
