import { useEffect, useState } from "react";
import { loadIndex } from "../store/persistence";
import type { WallMeta } from "../store/types";
import { BackIcon, ChevronDownIcon, GearIcon, GridIcon } from "./icons";
import { useBlocksBrowser } from "./browserVisibility";

export function Toolbar({
  wallId, onBack, onSwitch, onGear, onTasks,
}: { wallId: string; onBack: () => void; onSwitch: (id: string) => void; onGear: () => void; onTasks: () => void }) {
  const [walls, setWalls] = useState<WallMeta[]>([]);
  const [open, setOpen] = useState(false);
  useBlocksBrowser(open);
  useEffect(() => { loadIndex().then(setWalls).catch(() => setWalls([])); }, [wallId]);
  const current = walls.find((w) => w.id === wallId);

  return (
    <div className="cnvs-toolbar">
      <button className="cnvs-btn" onClick={onBack} title="All walls"><BackIcon /></button>
      <button className="cnvs-name" onClick={() => setOpen((o) => !o)}>
        {current?.name ?? "Wall"} <span className="cnvs-caret"><ChevronDownIcon /></span>
      </button>
      <span className="cnvs-sep" />
      <button className="cnvs-btn" onClick={onGear} title="Background"><GearIcon /></button>
      <button className="cnvs-btn" onClick={onTasks} title="Taskboard"><GridIcon /></button>
      {open && (
        <div className="cnvs-menu" onMouseLeave={() => setOpen(false)}>
          {walls.map((w) => (
            <button
              key={w.id}
              className={`cnvs-menu-item${w.id === wallId ? " active" : ""}`}
              onClick={() => { setOpen(false); if (w.id !== wallId) onSwitch(w.id); }}
            >
              {w.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
