import { useEffect, useState } from "react";
import { loadIndex, saveIndex, pickFolder } from "../store/persistence";
import type { WallMeta } from "../store/types";

const basename = (p: string) => p.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "wall";

export function StartPage({ onOpen }: { onOpen: (id: string) => void }) {
  const [walls, setWalls] = useState<WallMeta[]>([]);
  useEffect(() => {
    loadIndex().then(setWalls).catch(() => setWalls([]));
  }, []);

  const newCanvas = async () => {
    const path = await pickFolder();
    if (!path) return;
    const id = crypto.randomUUID();
    const meta: WallMeta = { id, name: basename(path), path, updatedAt: Date.now(), isCurrent: true };
    const next = [...walls.map((w) => ({ ...w, isCurrent: false })), meta];
    await saveIndex(next);
    onOpen(id);
  };

  return (
    <div className="start-page">
      <h1 className="start-title">Walls</h1>
      <div className="start-grid">
        {walls.map((w) => (
          <button key={w.id} className="wall-card" onClick={() => onOpen(w.id)}>
            <div className="wall-card-name">{w.name}</div>
            <div className="wall-card-path">{w.path}</div>
          </button>
        ))}
        <button className="wall-card new-canvas" onClick={newCanvas}>+ New canvas</button>
      </div>
    </div>
  );
}
