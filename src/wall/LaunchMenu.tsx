import { useState } from "react";
import type { Preset } from "./presets";
import { presetTierColor } from "./presetTier";
import { ChevronDownIcon, ChevronUpIcon, GlobeIcon, MusicIcon, PlusIcon } from "./icons";
import { useBlocksBrowser } from "./browserVisibility";

export function LaunchMenu({
  presets, onLaunch, onLaunchBrowser, onLaunchMusic,
}: { presets: Preset[]; onLaunch: (presetId: string) => void; onLaunchBrowser: () => void; onLaunchMusic: () => void }) {
  const [open, setOpen] = useState(false);
  useBlocksBrowser(open);
  return (
    <div className="launch">
      <button className="launch-main" onPointerDown={() => onLaunch("plain")}>
        <PlusIcon /> Terminal
      </button>
      <button className="launch-caret" onPointerDown={() => setOpen((o) => !o)} title="Launch…">
        {open ? <ChevronDownIcon /> : <ChevronUpIcon />}
      </button>
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
          <button
            className="launch-item"
            onPointerDown={() => { setOpen(false); onLaunchBrowser(); }}
          >
            <span className="launch-ic" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <GlobeIcon />
            </span>
            Browser
          </button>
          <button
            className="launch-item"
            onPointerDown={() => { setOpen(false); onLaunchMusic(); }}
          >
            <span className="launch-ic" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <MusicIcon />
            </span>
            Music
          </button>
        </div>
      )}
    </div>
  );
}
