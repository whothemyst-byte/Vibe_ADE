import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useTaskStore, normalizeTasks, type Task, type TaskStatus, type Priority } from "./taskStore";
import { loadTasks, saveTasks, loadIndex, loadWall } from "../store/persistence";
import type { Background, WallMeta } from "../store/types";
import { WallBackground } from "../wall/WallBackground";
import { accentForBackground, applyAccent, applyChromeInk, DEFAULT_ACCENT } from "../settings/themes";
import { BackIcon, GridIcon, MoreIcon, PlusIcon } from "../wall/icons";
import { useVibeCommand } from "../vibe/commands";
import { useVibeContext } from "../vibe/context";
import { useEntitlements } from "../entitlements";
import { UpgradePill } from "./UpgradePill";

const COLUMNS: { key: TaskStatus; label: string; color: string }[] = [
  { key: "backlog", label: "Backlog", color: "var(--text-muted)" },
  { key: "in-progress", label: "In progress", color: "var(--accent)" },
  { key: "in-review", label: "In review", color: "var(--info)" },
  { key: "done", label: "Done", color: "var(--ok)" },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "p0", label: "P0" },
  { value: "p1", label: "P1" },
  { value: "p2", label: "P2" },
  { value: "p3", label: "P3" },
];

function dueToInput(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inputToDue(value: string): number | undefined {
  if (!value) return undefined;
  const ms = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

// Memoized: update() replaces only the edited task's object, so typing in one
// card re-renders just that card instead of every card on the board.
const TaskCard = memo(function TaskCard({
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
    <div className="tb-card" data-id={task.id}>
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
      <div className="tb-card-meta">
        <select
          className={`tb-prio${task.priority ? ` ${task.priority}` : ""}`}
          value={task.priority ?? ""}
          onChange={(e) =>
            update(task.id, { priority: (e.target.value || undefined) as Priority | undefined })
          }
          title="Priority"
        >
          <option value="">Priority</option>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <input
          className="tb-due"
          type="date"
          value={dueToInput(task.dueAt)}
          onChange={(e) => update(task.id, { dueAt: inputToDue(e.target.value) })}
          title="Due date"
        />
      </div>
      <div className="tb-card-labels">
        {(task.labels ?? []).map((label) => (
          <button
            key={label}
            className="tb-label"
            title="Remove label"
            onClick={() =>
              update(task.id, { labels: (task.labels ?? []).filter((l) => l !== label) })
            }
          >
            {label} ×
          </button>
        ))}
        <input
          className="tb-label-add"
          placeholder="+ label"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const value = e.currentTarget.value.trim();
            if (!value) return;
            const existing = task.labels ?? [];
            if (!existing.includes(value)) update(task.id, { labels: [...existing, value] });
            e.currentTarget.value = "";
          }}
        />
      </div>
      <div className="tb-card-link">
        {linkedWall && (
          <button className="tb-chip" onClick={() => onOpenWall(linkedWall.id)} title="Open space">
            <GridIcon /> {linkedWall.name}
          </button>
        )}
        <select
          className="tb-link-select"
          value={task.wallId ?? ""}
          onChange={(e) => update(task.id, { wallId: e.target.value || undefined })}
        >
          <option value="">{linkedWall ? "Change space…" : "Link space…"}</option>
          {walls.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
});

export function TaskBoard({
  onBack, onOpenWall, fromWallId,
}: { onBack: () => void; onOpenWall: (id: string) => void; fromWallId?: string }) {
  const tasks = useTaskStore((s) => s.tasks);
  const ent = useEntitlements();
  const [walls, setWalls] = useState<WallMeta[]>([]);
  const [background, setBackground] = useState<Background | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);
  const saveTimer = useRef<number | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    (async () => {
      const [t, idx] = await Promise.all([loadTasks(), loadIndex()]);
      useTaskStore.getState().setAll(normalizeTasks(t));
      setWalls(idx);
      ready.current = true;
      // Theme the board like the space it was opened from (or the current space).
      const themeWallId = fromWallId ?? idx.find((w) => w.isCurrent)?.id;
      const doc = themeWallId ? await loadWall(themeWallId) : null;
      if (doc?.background) {
        setBackground(doc.background);
        applyAccent(accentForBackground(doc.background));
        applyChromeInk(doc.background);
      }
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

  // Hand the accent/ink back to the app defaults when leaving (same as WallView).
  useEffect(() => () => { applyAccent(DEFAULT_ACCENT); applyChromeInk(null); }, []);

  useVibeContext("tasks", () => {
    const all = useTaskStore.getState().tasks;
    return COLUMNS.map((c) => {
      const titles = all.filter((t) => t.status === c.key).map((t) => t.title || "untitled");
      return `${c.label}: ${titles.join(", ") || "(empty)"}`;
    }).join(" | ");
  });

  useVibeCommand({
    name: "create_task",
    description: "Create a new task in the backlog column.",
    parameters: {
      type: "object",
      properties: { title: { type: "string", description: "Task title" } },
      required: ["title"],
    },
    run: (args) => {
      const title = String(args.title ?? "").trim();
      if (!title) return "Error: the task needs a title.";
      useTaskStore.getState().add(title);
      return `Created task "${title}" in the backlog.`;
    },
  });

  useVibeCommand({
    name: "move_task",
    description:
      "Move a task to another column. Columns: backlog, in progress, in review, done.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title (fuzzy matched)" },
        column: { type: "string", description: "Target column" },
      },
      required: ["title", "column"],
    },
    run: (args) => {
      const aliases: Record<string, TaskStatus> = {
        "backlog": "backlog", "todo": "backlog",
        "in progress": "in-progress", "in-progress": "in-progress", "doing": "in-progress",
        "in review": "in-review", "in-review": "in-review", "review": "in-review",
        "done": "done", "finished": "done", "complete": "done",
      };
      const status = aliases[String(args.column ?? "").toLowerCase().trim()];
      if (!status) return `Error: "${args.column}" is not a column. Use backlog, in progress, in review, or done.`;
      const wanted = String(args.title ?? "").toLowerCase();
      const { tasks: all, update } = useTaskStore.getState();
      const task = all.find((t) => t.title.toLowerCase().includes(wanted));
      if (!task) return `Error: no task matches "${args.title}".`;
      update(task.id, { status });
      return `Moved "${task.title}" to ${status.replace("-", " ")}.`;
    },
  });

  // Stable reference so it never breaks TaskCard's memo.
  const clearDragOver = useCallback(() => setDragOver(null), []);

  const onDrop = (status: TaskStatus) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const body = e.currentTarget.querySelector(".tb-col-body");
    const cards = body
      ? Array.from(body.querySelectorAll<HTMLElement>(".tb-card")).filter((c) => c.dataset.id !== id)
      : [];
    let index = cards.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (index === -1) index = cards.length;
    useTaskStore.getState().reorder(id, status, index);
  };

  return (
    <div className={`taskboard${background ? " themed" : ""}`}>
      {background && <WallBackground background={background} />}
      <div className="cnvs-toolbar tb-toolbar">
        <button className="cnvs-btn" onClick={onBack} title="Back"><BackIcon /></button>
        <span className="cnvs-name tb-name"><GridIcon /> Taskboard</span>
        <span className="tb-total">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</span>
        <span className="cnvs-sep" />
        <div className="tb-menu-wrap" ref={menuRef}>
          <button
            className="cnvs-btn"
            onClick={() => setMenuOpen((o) => !o)}
            title="More"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreIcon />
          </button>
          {menuOpen && (
            <div className="cnvs-menu tb-menu" role="menu">
              <button
                className={`cnvs-menu-item tb-menu-item${ent.canImportExternal ? "" : " tb-locked"}`}
                disabled={!ent.canImportExternal}
                role="menuitem"
                title={
                  ent.canImportExternal
                    ? "Import from Jira, Linear, Trello… (ships with the connectors update)"
                    : "Importing from external tools is a Pro feature"
                }
                onClick={() => {
                  setMenuOpen(false);
                  if (ent.canImportExternal) alert("External imports ship with the connectors update.");
                }}
              >
                <span>Import…</span>
                {!ent.canImportExternal && <UpgradePill feature="External import" />}
              </button>
              <button
                className={`cnvs-menu-item tb-menu-item${ent.canUseSavedViews ? "" : " tb-locked"}`}
                disabled={!ent.canUseSavedViews}
                role="menuitem"
                title={
                  ent.canUseSavedViews
                    ? "Saved views & filters (ships with the Pro task update)"
                    : "Saved views are a Pro feature"
                }
                onClick={() => {
                  setMenuOpen(false);
                  if (ent.canUseSavedViews) alert("Saved views ship with the Pro task update.");
                }}
              >
                <span>Saved views</span>
                {!ent.canUseSavedViews && <UpgradePill feature="Saved views" />}
              </button>
            </div>
          )}
        </div>
      </div>
      <button className="tb-launch" onClick={() => useTaskStore.getState().add("New task")} title="New task">
        <PlusIcon /> Task
      </button>
      <div className="tb-columns">
        {COLUMNS.map((col) => {
          const items = tasks
            .filter((t) => t.status === col.key)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          return (
            <div
              key={col.key}
              className={`tb-col${dragOver === col.key ? " drag-over" : ""}`}
              style={{ "--col": col.color } as CSSProperties}
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
                      onDragEndClear={clearDragOver}
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
