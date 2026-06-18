import { useEffect, useState } from "react";
import { loadIndex, saveIndex, pickFolder, deleteWall, loadThumbnailUrl, openFolder, isDir } from "../store/persistence";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { WallMeta } from "../store/types";
import { relativeTime } from "./relativeTime";
import { CloseIcon, GridIcon, TeamsIcon, FolderIcon } from "../wall/icons";
import { useEntitlements } from "../entitlements";
import { UpgradePill } from "../tasks/UpgradePill";
import { spaceFromFolder } from "../store/spaceFromFolder";

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
        className="wall-folder"
        title="Open folder in Explorer"
        onClick={(e) => { e.stopPropagation(); void openFolder(meta.path); }}
      >
        <FolderIcon />
      </button>
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
  const [dragHover, setDragHover] = useState(false);
  useEffect(() => {
    loadIndex().then(setWalls).catch(() => setWalls([]));
  }, []);

  // Drop a folder anywhere on the start page to create a space from it. The
  // listener only exists while the start page is mounted, so drops on other
  // views are ignored.
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent(async (e) => {
      if (e.payload.type === "enter" || e.payload.type === "over") { setDragHover(true); return; }
      if (e.payload.type === "leave") { setDragHover(false); return; }
      if (e.payload.type === "drop") {
        setDragHover(false);
        const dirs: string[] = [];
        for (const p of e.payload.paths) if (await isDir(p)) dirs.push(p);
        if (dirs.length === 0) return;
        const created = dirs.map(spaceFromFolder);
        setWalls((prev) => {
          const next = [...prev.map((w) => ({ ...w, isCurrent: false })), ...created];
          void saveIndex(next);
          return next;
        });
        onOpen(created[created.length - 1].id);
      }
    });
    return () => { void unlisten.then((f) => f()); };
  }, [onOpen]);

  const newCanvas = async () => {
    const path = await pickFolder();
    if (!path) return;
    const meta = spaceFromFolder(path);
    const next = [...walls.map((w) => ({ ...w, isCurrent: false })), meta];
    setWalls(next);
    await saveIndex(next);
    onOpen(meta.id);
  };

  const remove = async (id: string) => {
    const next = walls.filter((w) => w.id !== id);
    setWalls(next);
    await saveIndex(next);
    await deleteWall(id);
  };

  return (
    <div className={`start-page${dragHover ? " drag-over" : ""}`}>
      <div className="start-head">
        <div className="start-headings">
          <h1 className="start-title">Spaces</h1>
          <span className="start-sub">{walls.length} {walls.length === 1 ? "space" : "spaces"}</span>
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
          <span>New space</span>
        </button>
      </div>
    </div>
  );
}
