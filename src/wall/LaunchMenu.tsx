import { useState } from "react";
import type { Preset } from "./presets";
import { presetTierColor } from "./presetTier";

export function LaunchMenu({
  presets, onLaunch,
}: { presets: Preset[]; onLaunch: (presetId: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="launch">
      <button className="launch-main" onPointerDown={() => onLaunch("plain")}>+ Terminal</button>
      <button className="launch-caret" onPointerDown={() => setOpen((o) => !o)} title="Launch…">▴</button>
      {open && (
        <div className="launch-menu" onMouseLeave={() => setOpen(false)}>
          {presets.map((p) => (
            <button
              key={p.id}
              className="launch-item"
              onPointerDown={() => { setOpen(false); onLaunch(p.id); }}
            >
              <span className="launch-ic" style={{ background: presetTierColor(p.id), color: "transparent" }} />
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
