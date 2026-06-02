import { useEffect, useRef, useState, type DragEvent } from "react";
import { useTaskStore, type Task, type TaskStatus } from "./taskStore";
import { loadTasks, saveTasks, loadIndex } from "../store/persistence";
import type { WallMeta } from "../store/types";

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "in-progress", label: "In progress" },
  { key: "done", label: "Done" },
];

function TaskCard({
  task, walls, onOpenWall,
}: { task: Task; walls: WallMeta[]; onOpenWall: (id: string) => void }) {
  const update = useTaskStore((s) => s.update);
  const remove = useTaskStore((s) => s.remove);
  const linkedWall = walls.find((w) => w.id === task.wallId);
  return (
    <div className="tb-card">
      <div className="tb-card-top">
        <span
          className="tb-grip"
          draggable
          onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
          title="Drag to move"
        >⠿</span>
        <input
          className="tb-card-title"
          value={task.title}
          onChange={(e) => update(task.id, { title: e.target.value })}
        />
        <button className="tb-card-del" onClick={() => remove(task.id)} title="Delete">×</button>
      </div>
      <textarea
        className="tb-card-desc"
        value={task.description}
        placeholder="Notes…"
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
    const id = e.dataTransfer.getData("text/plain");
    if (id) useTaskStore.getState().update(id, { status });
  };

  return (
    <div className="taskboard">
      <div className="tb-bar">
        <button className="cnvs-btn" onClick={onBack} title="Back">←</button>
        <span className="tb-title">Taskboard</span>
        <button className="tb-add" onClick={() => useTaskStore.getState().add("New task")}>+ Task</button>
      </div>
      <div className="tb-columns">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <div
              key={col.key}
              className="tb-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop(col.key)}
            >
              <div className="tb-col-head">
                {col.label} <span className="tb-count">{items.length}</span>
              </div>
              <div className="tb-col-body">
                {items.map((t) => (
                  <TaskCard key={t.id} task={t} walls={walls} onOpenWall={onOpenWall} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
