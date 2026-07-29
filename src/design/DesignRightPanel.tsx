import { useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { degToRad } from "./designUtils";
import { hidePatch, unhidePatch, type Patch } from "./commitCore";
import { commitPatches, selectSmart, selectOnly, setSelectedGroup } from "./commit";
import {
  selectSelection, selectionEqual, selectLayerTree, layerTreeEqual, selectActiveType,
  type DesignStore, type MultiValue,
} from "./designStore";
import { flattenLayerTree, type LayerRow } from "./layerTree";
import { useDesignSelector } from "./useDesignSelector";
import { DesignSelectionActions } from "./DesignSelectionActions";
import { DesignFramePresets } from "./DesignFramePresets";
import { TOOL_ICONS, SelectIcon } from "../wall/icons";

function ShapeIcon({ type }: { type: string }) {
  const Icon = TOOL_ICONS[type as keyof typeof TOOL_ICONS];
  return <span className="design-layer-icon">{Icon ? <Icon /> : <SelectIcon />}</span>;
}

/** Points right when collapsed; CSS rotates it down when open. */
const Chevron = () => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 1L5.5 4L2.5 7" />
  </svg>
);

/** Number field that tracks live canvas values while idle but never fights
 *  in-progress typing. Enter/blur commits, Escape cancels. "mixed" renders
 *  as an empty field with a Mixed placeholder; committing applies to all. */
function NumInput({ label, value, onCommit, narrow }: {
  label: string;
  value: MultiValue<number>;
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
        placeholder={value === "mixed" ? "Mixed" : undefined}
        value={draft ?? (value === "mixed" ? "" : String(value))}
        onFocus={(e) => setDraft(e.target.value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          if (!cancelled.current) {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && (value === "mixed" || v !== value)) onCommit(v);
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

const colorValue = (v: MultiValue<string>): string =>
  v === "mixed" ? "#888888" : v === "transparent" ? "#000000" : v;

export function DesignRightPanel({ store, apiRef }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const sel = useDesignSelector(store, selectSelection, selectionEqual);
  const tree = useDesignSelector(store, selectLayerTree, layerTreeEqual);
  const activeType = useDesignSelector(store, selectActiveType);
  const [opDraft, setOpDraft] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const rows = flattenLayerTree(tree, collapsed);

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  /** A frame or group row selects everything under it; a leaf selects the way
   *  the canvas would, so clicking a grouped shape grabs its whole group. */
  function selectRow(row: LayerRow) {
    const api = apiRef.current;
    if (!api) return;
    if (row.kind === "group") setSelectedGroup(api, row.refId, row.memberIds);
    else if (row.type === "frame") selectOnly(api, row.refId);
    else selectSmart(api, row.refId);
  }

  /** One patch for every selected element -> one undo step. */
  function commitAll(patch: Patch, capture: "immediately" | "eventually" = "immediately") {
    const api = apiRef.current;
    if (!api || !sel) return;
    commitPatches(api, Object.fromEntries(sel.ids.map((id) => [id, patch])), capture);
  }

  /** One patch across a whole layer row (a frame or group covers its members)
   *  so hiding or locking a parent is a single undo step. */
  function commitMany(ids: readonly string[], patch: Patch) {
    const api = apiRef.current;
    if (api) commitPatches(api, Object.fromEntries(ids.map((id) => [id, patch])));
  }

  function toggleHidden(row: LayerRow) {
    const api = apiRef.current;
    if (!api) return;
    const byId = new Map(store.get().elements.map((e) => [e.id, e]));
    const patches: Record<string, Patch> = {};
    for (const id of row.memberIds) {
      const el = byId.get(id);
      // The row's own flag decides, so a partly-hidden group hides as a whole.
      if (el) patches[id] = row.hidden ? unhidePatch(el) : hidePatch(el);
    }
    if (Object.keys(patches).length) commitPatches(api, patches);
  }

  return (
    <div className="design-right">
      {/* ── Properties ── */}
      <div className="design-props">
        {activeType === "frame" ? (
          <DesignFramePresets store={store} apiRef={apiRef} />
        ) : sel ? (
          <>
            <DesignSelectionActions store={store} apiRef={apiRef} />

            <span className="design-section-label">
              {sel.count > 1 ? `Transform · ${sel.count} selected` : "Transform"}
            </span>
            <div className="design-prop-section">
              <div className="design-prop-row">
                <NumInput label="X" value={sel.x} onCommit={(v) => commitAll({ x: v })} />
                <NumInput label="Y" value={sel.y} onCommit={(v) => commitAll({ y: v })} />
              </div>
              {!sel.hasLinear && (
                <div className="design-prop-row">
                  <NumInput label="W" value={sel.width} onCommit={(v) => commitAll({ width: v })} />
                  <NumInput label="H" value={sel.height} onCommit={(v) => commitAll({ height: v })} />
                </div>
              )}
              <NumInput label="°" value={sel.angleDeg} onCommit={(v) => commitAll({ angle: degToRad(v) })} />
            </div>

            <span className="design-section-label">Appearance</span>
            <div className="design-prop-section">
              <div className="design-prop-row">
                <span className="design-prop-label">Fi</span>
                <div className="design-color-swatch">
                  <input
                    type="color"
                    value={colorValue(sel.backgroundColor)}
                    onChange={(e) => commitAll({ backgroundColor: e.target.value }, "eventually")}
                    onBlur={(e) => commitAll({ backgroundColor: e.target.value })}
                  />
                </div>
                <span className="design-prop-label">St</span>
                <div className="design-color-swatch">
                  <input
                    type="color"
                    value={colorValue(sel.strokeColor)}
                    onChange={(e) => commitAll({ strokeColor: e.target.value }, "eventually")}
                    onBlur={(e) => commitAll({ strokeColor: e.target.value })}
                  />
                </div>
                <NumInput label="" value={sel.strokeWidth} narrow onCommit={(v) => commitAll({ strokeWidth: v })} />
              </div>
              <div className="design-prop-row">
                <span className="design-prop-label">Op</span>
                <input
                  type="range"
                  min={0} max={100}
                  style={{ flex: 1 }}
                  value={opDraft ?? (sel.opacity === "mixed" ? 100 : sel.opacity)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setOpDraft(v);
                    commitAll({ opacity: v }, "eventually"); // live preview, no undo spam
                  }}
                  onPointerUp={() => {
                    if (opDraft !== null) commitAll({ opacity: opDraft }); // one undo step
                    setOpDraft(null);
                  }}
                />
                <span className="design-prop-opacity">
                  {opDraft ?? (sel.opacity === "mixed" ? "–" : sel.opacity)}%
                </span>
              </div>
            </div>

            {sel.fontSize !== null && (
              <>
                <span className="design-section-label">Text</span>
                <div className="design-prop-section">
                  <NumInput label="Sz" value={sel.fontSize} onCommit={(v) => commitAll({ fontSize: v })} />
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
          {rows.map((row) => (
            <div
              key={row.key}
              className={`design-layer-row${row.selected ? " ds-selected" : ""}`}
              style={{ paddingLeft: 10 + row.depth * 13 }}
              onClick={() => selectRow(row)}
            >
              {row.hasChildren ? (
                <button
                  className={`design-layer-twisty${collapsed.has(row.key) ? "" : " open"}`}
                  title={collapsed.has(row.key) ? "Expand" : "Collapse"}
                  onPointerDown={(e) => { e.stopPropagation(); toggleCollapsed(row.key); }}
                >
                  <Chevron />
                </button>
              ) : (
                <span className="design-layer-twisty-gap" />
              )}
              <ShapeIcon type={row.type} />
              <span className={`design-layer-name${row.kind === "group" || row.type === "frame" ? " parent" : ""}`}>
                {row.label}
              </span>
              <div className="design-layer-actions">
                <button
                  className="design-layer-btn"
                  title={row.hidden ? "Show" : "Hide"}
                  onPointerDown={(e) => { e.stopPropagation(); toggleHidden(row); }}
                >
                  {row.hidden ? "○" : "●"}
                </button>
                <button
                  className="design-layer-btn"
                  title={row.hidden ? "Unhide to change lock" : row.locked ? "Unlock" : "Lock"}
                  disabled={row.hidden}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!row.hidden) commitMany(row.memberIds, { locked: !row.locked });
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
