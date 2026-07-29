import { Fragment } from "react";
import { TOOL_ICONS } from "../wall/icons";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { DESIGN_TOOL_GROUPS } from "./designTools";
import { selectActiveType, type DesignStore } from "./designStore";
import { useDesignSelector } from "./useDesignSelector";

export function DesignLeftBar({ store, apiRef }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const activeType = useDesignSelector(store, selectActiveType);
  return (
    <div className="design-leftbar" role="toolbar" aria-label="UI design tools">
      {DESIGN_TOOL_GROUPS.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <span className="design-tool-sep" />}
          {group.map((tool) => {
            const Icon = TOOL_ICONS[tool.type];
            return (
              <button
                key={tool.type}
                className={`tool-key${tool.type === activeType ? " active" : ""}`}
                aria-pressed={tool.type === activeType}
                title={`${tool.label} · ${tool.shortcut}`}
                onPointerDown={() =>
                  apiRef.current?.setActiveTool(
                    { type: tool.type } as Parameters<ExcalidrawImperativeAPI["setActiveTool"]>[0]
                  )
                }
              >
                <Icon />
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
