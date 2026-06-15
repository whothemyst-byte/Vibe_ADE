import { create } from "zustand";

export type TaskStatus = "backlog" | "in-progress" | "in-review" | "done";
export type Priority = "p0" | "p1" | "p2" | "p3";

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  wallId?: string;
  createdAt: number;
  updatedAt: number;
  order?: number;
  priority?: Priority;
  dueAt?: number;
  labels?: string[];
};

type TaskStore = {
  tasks: Task[];
  setAll: (tasks: Task[]) => void;
  add: (title: string) => void;
  update: (id: string, patch: Partial<Omit<Task, "id" | "createdAt">>) => void;
  remove: (id: string) => void;
  reorder: (id: string, status: TaskStatus, index: number) => void;
};

/** Assigns a stable sequential `order` per column (existing order wins, then createdAt). */
export function normalizeTasks(tasks: Task[]): Task[] {
  const byStatus = new Map<TaskStatus, Task[]>();
  for (const t of tasks) {
    const list = byStatus.get(t.status) ?? [];
    list.push(t);
    byStatus.set(t.status, list);
  }
  const out: Task[] = [];
  for (const list of byStatus.values()) {
    list
      .slice()
      .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.createdAt - b.createdAt)
      .forEach((t, i) => out.push({ ...t, order: i }));
  }
  return out;
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  setAll: (tasks) => set({ tasks }),
  add: (title) =>
    set((s) => {
      const maxOrder = s.tasks
        .filter((t) => t.status === "backlog")
        .reduce((m, t) => Math.max(m, t.order ?? 0), -1);
      return {
        tasks: [
          ...s.tasks,
          {
            id: crypto.randomUUID(),
            title,
            description: "",
            status: "backlog",
            order: maxOrder + 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      };
    }),
  update: (id, patch) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)),
    })),
  remove: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  reorder: (id, status, index) =>
    set((s) => {
      const moving = s.tasks.find((t) => t.id === id);
      if (!moving) return {};
      const col = s.tasks
        .filter((t) => t.status === status && t.id !== id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const clamped = Math.max(0, Math.min(index, col.length));
      col.splice(clamped, 0, { ...moving, status });
      const orderById = new Map(col.map((t, i) => [t.id, i]));
      return {
        tasks: s.tasks.map((t) => {
          if (t.id === id) return { ...t, status, order: orderById.get(id)!, updatedAt: Date.now() };
          if (orderById.has(t.id)) return { ...t, order: orderById.get(t.id)! };
          return t;
        }),
      };
    }),
}));
