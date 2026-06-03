import { TOOLS, type ToolDef } from "./tools";

export function ToolsIsland({
  activeType, onSelect,
}: { activeType: string; onSelect: (tool: ToolDef) => void }) {
  return (
    <div className="tools-island" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((t) => (
        <button
          key={t.type}
          className={`tool-key${t.type === activeType ? " active" : ""}`}
          aria-pressed={t.type === activeType}
          title={`${t.label} · ${t.shortcut}`}
          onPointerDown={() => onSelect(t)}
        >
          <span className="tool-glyph" aria-hidden>{t.glyph}</span>
        </button>
      ))}
    </div>
  );
}
