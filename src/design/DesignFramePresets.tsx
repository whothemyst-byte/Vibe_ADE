import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { commitInsertFrame } from "./commit";
import { FRAME_PRESET_GROUPS, framePlacement, nextFrameName, type FramePreset } from "./framePresets";
import type { DesignStore } from "./designStore";

/** Shown in place of the inspector while the frame tool is active, the way
 *  Figma swaps its right rail for a device list. Picking one drops that
 *  artboard in; dragging on the canvas still makes a custom-sized frame. */
export function DesignFramePresets({ store, apiRef }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
}) {
  function insert(preset: FramePreset) {
    const api = apiRef.current;
    if (!api) return;
    const s = store.get();
    const frames = s.elements.filter((e) => e.type === "frame" && e.isDeleted !== true);
    const at = framePlacement(frames, preset, {
      zoom: s.zoom, scrollX: s.scrollX, scrollY: s.scrollY, width: s.width, height: s.height,
    });
    const names = frames
      .map((f) => (f as { name?: unknown }).name)
      .filter((n): n is string => typeof n === "string");
    commitInsertFrame(api, {
      ...at,
      width: preset.width,
      height: preset.height,
      name: nextFrameName(names, preset.label),
    });
  }

  return (
    <div className="design-frame-presets">
      <span className="design-section-label">Frame</span>
      <p className="design-frame-hint">Pick a screen size, or drag on the canvas for a custom one.</p>
      {FRAME_PRESET_GROUPS.map((group) => (
        <div key={group.label} className="design-frame-group">
          <span className="design-frame-group-label">{group.label}</span>
          {group.presets.map((p) => (
            <button
              key={p.id}
              className="design-frame-preset"
              onPointerDown={(e) => { e.preventDefault(); insert(p); }}
            >
              <span className="design-frame-preset-name">{p.label}</span>
              <span className="design-frame-preset-size">{p.width} × {p.height}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
