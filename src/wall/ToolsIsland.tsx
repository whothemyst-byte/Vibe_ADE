import { TOOLS, type ToolDef } from "./tools";
import { TOOL_ICONS } from "./icons";

export function ToolsIsland({
  activeType, onSelect,
}: {
  activeType: string;
  onSelect: (tool: ToolDef) => void;
}) {
  return (
    <div className="tools-island" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((t) => {
        const Icon = TOOL_ICONS[t.type];
        return (
          <button
            key={t.type}
            className={`tool-key${t.type === activeType ? " active" : ""}`}
            aria-pressed={t.type === activeType}
            title={`${t.label} · ${t.shortcut}`}
            onPointerDown={() => onSelect(t)}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
