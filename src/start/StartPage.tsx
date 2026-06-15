import { useEffect, useState } from "react";
import { loadIndex, saveIndex, pickFolder, deleteWall, loadThumbnailUrl } from "../store/persistence";
import type { WallMeta } from "../store/types";
import { relativeTime } from "./relativeTime";
import { CloseIcon, GridIcon, TeamsIcon } from "../wall/icons";
import { useEntitlements } from "../entitlements";
import { UpgradePill } from "../tasks/UpgradePill";

const basename = (p: string) => p.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "wall";

function WallCard({ meta, onOpen, onDelete }: { meta: WallMeta; onOpen: () => void; onDelete: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    loadThumbnailUrl(meta.id).then((u) => { url = u; setThumb(u); });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [meta.id]);

  return (
    <div className={`wall-card${meta.isCurrent ? " is-current" : ""}`} onClick={onOpen}>
      {meta.isCurrent && <span className="wall-badge">CURRENT</span>}
      <button
        className="wall-del"
        title="Delete"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        <CloseIcon />
      </button>
      <div className="wall-thumb">
        {thumb ? <img src={thumb} alt="" /> : <div className="wall-thumb-empty" />}
      </div>
      <div className="wall-card-name">{meta.name}</div>
      <div className="wall-card-meta">
        <span className="wall-card-path">{meta.path}</span>
        <span className="wall-card-time">{relativeTime(meta.updatedAt)}</span>
      </div>
    </div>
  );
}

export function StartPage({ onOpen, onTasks, onTeams }: { onOpen: (id: string) => void; onTasks: () => void; onTeams: () => void }) {
  const ent = useEntitlements();
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
    setWalls(next);
    await saveIndex(next);
    onOpen(id);
  };

  const remove = async (id: string) => {
    const next = walls.filter((w) => w.id !== id);
    setWalls(next);
    await saveIndex(next);
    await deleteWall(id);
  };

  return (
    <div className="start-page">
      <div className="start-head">
        <div className="start-headings">
          <h1 className="start-title">Walls</h1>
          <span className="start-sub">{walls.length} {walls.length === 1 ? "wall" : "walls"}</span>
        </div>
        <button className="start-tasks" onClick={onTasks}><GridIcon /> Taskboard</button>
        <button className="start-tasks" onClick={onTeams}>
          <TeamsIcon /> Teams{!ent.canUseTeams && <UpgradePill feature="Team collaboration" tier="Team" />}
        </button>
      </div>
      <div className="start-grid">
        {walls.map((w) => (
          <WallCard key={w.id} meta={w} onOpen={() => onOpen(w.id)} onDelete={() => remove(w.id)} />
        ))}
        <button className="wall-card new-canvas" onClick={newCanvas}>
          <span className="new-plus">+</span>
          <span>New canvas</span>
        </button>
      </div>
    </div>
  );
}
