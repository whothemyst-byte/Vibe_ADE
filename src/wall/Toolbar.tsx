import { useEffect, useState } from "react";
import { loadIndex } from "../store/persistence";
import type { WallMeta } from "../store/types";

export function Toolbar({
  wallId, onBack, onSwitch, onGear,
}: { wallId: string; onBack: () => void; onSwitch: (id: string) => void; onGear: () => void }) {
  const [walls, setWalls] = useState<WallMeta[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { loadIndex().then(setWalls).catch(() => setWalls([])); }, [wallId]);
  const current = walls.find((w) => w.id === wallId);

  return (
    <div className="cnvs-toolbar">
      <button className="cnvs-btn" onClick={onBack} title="All walls">←</button>
      <button className="cnvs-name" onClick={() => setOpen((o) => !o)}>
        {current?.name ?? "Wall"} <span className="cnvs-caret">▾</span>
      </button>
      <span className="cnvs-sep" />
      <button className="cnvs-btn" onClick={onGear} title="Background">⚙</button>
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
