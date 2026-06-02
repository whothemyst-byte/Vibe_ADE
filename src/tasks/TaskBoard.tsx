import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useTaskStore, type Task, type TaskStatus } from "./taskStore";
import { loadTasks, saveTasks, loadIndex } from "../store/persistence";
import type { WallMeta } from "../store/types";

const COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: "backlog", label: "Backlog", color: "#64748b" },
  { key: "in-progress", label: "In progress", color: "#3b82f6" },
  { key: "in-review", label: "In review", color: "#f59e0b" },
  { key: "done", label: "Done", color: "#22c55e" },
];

function TaskCard({
  task, walls, onOpenWall, onDragEndClear,
}: {
  task: Task;
  walls: WallMeta[];
  onOpenWall: (id: string) => void;
  onDragEndClear: () => void;
}) {
  const update = useTaskStore((s) => s.update);
  const remove = useTaskStore((s) => s.remove);
  const linkedWall = walls.find((w) => w.id === task.wallId);
  return (
    <div className="tb-card">
      <div className="tb-card-top">
        <span
          className="tb-grip"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", task.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={onDragEndClear}
          title="Drag to move"
        >
          ⠿
        </span>
        <input
          className="tb-card-title"
          value={task.title}
          placeholder="Untitled"
          onChange={(e) => update(task.id, { title: e.target.value })}
        />
        <button className="tb-card-del" onClick={() => remove(task.id)} title="Delete">×</button>
      </div>
      <textarea
        className="tb-card-desc"
        value={task.description}
        placeholder="Add notes…"
        onChange={(e) => update(task.id, { description: e.target.value })}
      />
      <div className="tb-card-link">
        {linkedWall && (
          <button className="tb-chip" onClick={() => onOpenWall(linkedWall.id)} title="Open wall">
            ▦ {linkedWall.name}
          </button>
        )}
        <select
          className="tb-link-select"
          value={task.wallId ?? ""}
          onChange={(e) => update(task.id, { wallId: e.target.value || undefined })}
        >
          <option value="">{linkedWall ? "Change wall…" : "Link wall…"}</option>
          {walls.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function TaskBoard({
  onBack, onOpenWall,
}: { onBack: () => void; onOpenWall: (id: string) => void }) {
  const tasks = useTaskStore((s) => s.tasks);
  const [walls, setWalls] = useState<WallMeta[]>([]);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const saveTimer = useRef<number | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    (async () => {
      const [t, idx] = await Promise.all([loadTasks(), loadIndex()]);
      useTaskStore.getState().setAll(t);
      setWalls(idx);
      ready.current = true;
    })();
    const unsub = useTaskStore.subscribe(() => {
      if (!ready.current) return; // don't save during the initial load
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void saveTasks(useTaskStore.getState().tasks);
      }, 500);
    });
    return () => { unsub(); if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, []);

  const onDrop = (status: TaskStatus) => (e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) useTaskStore.getState().update(id, { status });
  };

  return (
    <div className="taskboard">
      <div className="tb-bar">
        <button className="cnvs-btn" onClick={onBack} title="Back">←</button>
        <span className="tb-title">▦ Taskboard</span>
        <span className="tb-total">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</span>
        <button className="tb-add" onClick={() => useTaskStore.getState().add("New task")}>+ Task</button>
      </div>
      <div className="tb-columns">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <div
              key={col.key}
              className={`tb-col${dragOver === col.key ? " drag-over" : ""}`}
              style={{ "--accent": col.color } as CSSProperties}
              onDragOver={(e) => { e.preventDefault(); if (dragOver !== col.key) setDragOver(col.key); }}
              onDrop={onDrop(col.key)}
            >
              <div className="tb-col-head">
                <span className="tb-dot" />
                <span className="tb-col-label">{col.label}</span>
                <span className="tb-count">{items.length}</span>
              </div>
              <div className="tb-col-body">
                {items.length === 0 ? (
                  <div className="tb-empty">Drop tasks here</div>
                ) : (
                  items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      walls={walls}
                      onOpenWall={onOpenWall}
                      onDragEndClear={() => setDragOver(null)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
