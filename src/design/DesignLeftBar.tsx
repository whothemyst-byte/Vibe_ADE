import { Fragment } from "react";
import { TOOLS } from "../wall/tools";
import { TOOL_ICONS } from "../wall/icons";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { selectActiveType, type DesignStore } from "./designStore";
import { useDesignSelector } from "./useDesignSelector";

const GROUPS: Array<Array<typeof TOOLS[number]["type"]>> = [
  ["selection", "hand"],
  ["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw", "text", "image", "eraser"],
  ["frame"],
];

export function DesignLeftBar({ store, apiRef }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  const activeType = useDesignSelector(store, selectActiveType);
  return (
    <div className="design-leftbar" role="toolbar" aria-label="Drawing tools">
      {GROUPS.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <span className="design-tool-sep" />}
          {group.map((type) => {
            const tool = TOOLS.find((t) => t.type === type)!;
            const Icon = TOOL_ICONS[type];
            return (
              <button
                key={type}
                className={`tool-key${type === activeType ? " active" : ""}`}
                title={`${tool.label} · ${tool.shortcut}`}
                onPointerDown={() =>
                  apiRef.current?.setActiveTool(
                    { type } as Parameters<ExcalidrawImperativeAPI["setActiveTool"]>[0]
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
