import { useEffect, useState } from "react";
import { loadIndex } from "../store/persistence";
import type { WallMeta } from "../store/types";
import { BackIcon, ChevronDownIcon, GearIcon, GridIcon, TeamsIcon, FolderIcon, DesignIcon } from "./icons";
import { useBlocksBrowser } from "./browserVisibility";

export function Toolbar({
  wallId, onBack, onSwitch, onGear, onExplorer, onDesign, onTasks, onTeams,
}: { wallId: string; onBack: () => void; onSwitch: (id: string) => void; onGear: () => void; onExplorer: () => void; onDesign: () => void; onTasks: () => void; onTeams: () => void }) {
  const [walls, setWalls] = useState<WallMeta[]>([]);
  const [open, setOpen] = useState(false);
  useBlocksBrowser(open);
  useEffect(() => { loadIndex().then(setWalls).catch(() => setWalls([])); }, [wallId]);
  const current = walls.find((w) => w.id === wallId);

  return (
    <div className="cnvs-toolbar">
      <button className="cnvs-btn" onClick={onBack} title="All spaces"><BackIcon /></button>
      <button className="cnvs-name" onClick={() => setOpen((o) => !o)}>
        {current?.name ?? "Space"} <span className="cnvs-caret"><ChevronDownIcon /></span>
      </button>
      <span className="cnvs-sep" />
      <button className="cnvs-btn" onClick={onGear} title="Background"><GearIcon /></button>
      <button
        className="cnvs-btn"
        onClick={onExplorer}
        title="File explorer"
      ><FolderIcon /></button>
      <button className="cnvs-btn" onClick={onDesign} title="UI design"><DesignIcon /></button>
      <button className="cnvs-btn" onClick={onTasks} title="Taskboard"><GridIcon /></button>
      <button className="cnvs-btn" onClick={onTeams} title="Teams"><TeamsIcon /></button>
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
