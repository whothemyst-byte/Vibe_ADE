import { useState } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { labelForElement, radToDeg, degToRad } from "./designUtils";
import { applyPatches } from "./commitCore";
import { TOOL_ICONS, SelectIcon } from "../wall/icons";

function ShapeIcon({ type }: { type: string }) {
  const Icon = TOOL_ICONS[type as keyof typeof TOOL_ICONS];
  return <span className="design-layer-icon">{Icon ? <Icon /> : <SelectIcon />}</span>;
}

function NumInput({
  label,
  value,
  onCommit,
  elId,
  field,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  elId: string;
  field: string;
}) {
  return (
    <div className="design-prop-row">
      <span className="design-prop-label">{label}</span>
      <input
        type="number"
        className="design-prop-input"
        key={`${elId}-${field}`}
        defaultValue={Math.round(value)}
        onBlur={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onCommit(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}

export function DesignRightPanel({
  elements,
  selectedIds,
  apiRef,
}: {
  elements: readonly ExcalidrawElement[];
  selectedIds: Record<string, boolean>;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const [hiddenPrevOpacity, setHiddenPrevOpacity] = useState<Record<string, number>>({});

  const target = elements.find((e) => selectedIds[e.id]) ?? null;

  function commit(id: string, patch: Record<string, unknown>) {
    const api = apiRef.current;
    if (!api) return;
    const updated = applyPatches(
      elements as unknown as import("./commitCore").El[],
      { [id]: patch },
    ) as unknown as ExcalidrawElement[];
    api.updateScene({ elements: updated });
  }

  const layers = [...elements].reverse();

  return (
    <div className="design-right">
      {/* ── Properties ── */}
      <div className="design-props">
        {target ? (
          <>
            <span className="design-section-label">Transform</span>
            <div className="design-prop-section">
              <div className="design-prop-row">
                <NumInput label="X" value={target.x} elId={target.id} field="x" onCommit={(v) => commit(target.id, { x: v })} />
                <NumInput label="Y" value={target.y} elId={target.id} field="y" onCommit={(v) => commit(target.id, { y: v })} />
              </div>
              <div className="design-prop-row">
                <NumInput label="W" value={target.width} elId={target.id} field="w" onCommit={(v) => commit(target.id, { width: v })} />
                <NumInput label="H" value={target.height} elId={target.id} field="h" onCommit={(v) => commit(target.id, { height: v })} />
              </div>
              <NumInput label="°" value={radToDeg(target.angle)} elId={target.id} field="rot" onCommit={(v) => commit(target.id, { angle: degToRad(v) })} />
            </div>

            <span className="design-section-label">Appearance</span>
            <div className="design-prop-section">
              <div className="design-prop-row">
                <span className="design-prop-label">Fi</span>
                <div className="design-color-swatch">
                  <input
                    type="color"
                    value={target.backgroundColor === "transparent" ? "#000000" : (target.backgroundColor ?? "#000000")}
                    onChange={(e) => commit(target.id, { backgroundColor: e.target.value })}
                  />
                </div>
                <span className="design-prop-label">St</span>
                <div className="design-color-swatch">
                  <input
                    type="color"
                    value={target.strokeColor}
                    onChange={(e) => commit(target.id, { strokeColor: e.target.value })}
                  />
                </div>
                <input
                  type="number"
                  className="design-prop-input narrow"
                  key={`${target.id}-sw`}
                  defaultValue={target.strokeWidth}
                  onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) commit(target.id, { strokeWidth: v }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
              </div>
              <div className="design-prop-row">
                <span className="design-prop-label">Op</span>
                <input
                  type="range"
                  min={0} max={100}
                  style={{ flex: 1 }}
                  value={target.opacity}
                  onChange={(e) => commit(target.id, { opacity: parseInt(e.target.value) })}
                />
                <span className="design-prop-opacity">{target.opacity}%</span>
              </div>
            </div>

            {target.type === "text" && (
              <>
                <span className="design-section-label">Text</span>
                <div className="design-prop-section">
                  <div className="design-prop-row">
                    <span className="design-prop-label">Sz</span>
                    <input
                      type="number"
                      className="design-prop-input"
                      key={`${target.id}-fs`}
                      defaultValue={(target as unknown as { fontSize: number }).fontSize ?? 16}
                      onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) commit(target.id, { fontSize: v }); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                  </div>
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
          {layers.map((el) => {
            const isSelected = !!selectedIds[el.id];
            const isHidden = el.opacity === 0;
            const isLocked = el.locked ?? false;
            const label = labelForElement(el as { type: string; text?: string });
            return (
              <div
                key={el.id}
                className={`design-layer-row${isSelected ? " ds-selected" : ""}`}
                onClick={() =>
                  apiRef.current?.updateScene({
                    appState: { selectedElementIds: { [el.id]: true } } as never,
                  })
                }
              >
                <ShapeIcon type={el.type} />
                <span className="design-layer-name">{label}</span>
                <div className="design-layer-actions">
                  <button
                    className="design-layer-btn"
                    title={isHidden ? "Show" : "Hide"}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (isHidden) {
                        const prev = hiddenPrevOpacity[el.id] ?? 100;
                        setHiddenPrevOpacity((m) => { const n = { ...m }; delete n[el.id]; return n; });
                        commit(el.id, { opacity: prev });
                      } else {
                        setHiddenPrevOpacity((m) => ({ ...m, [el.id]: el.opacity }));
                        commit(el.id, { opacity: 0 });
                      }
                    }}
                  >
                    {isHidden ? "○" : "●"}
                  </button>
                  <button
                    className="design-layer-btn"
                    title={isLocked ? "Unlock" : "Lock"}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      commit(el.id, { locked: !isLocked });
                    }}
                  >
                    {isLocked ? "🔒" : "🔓"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
