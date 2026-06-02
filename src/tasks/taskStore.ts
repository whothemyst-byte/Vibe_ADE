import { create } from "zustand";

export type TaskStatus = "backlog" | "in-progress" | "done";

export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  wallId?: string;
  createdAt: number;
  updatedAt: number;
};

type TaskStore = {
  tasks: Task[];
  setAll: (tasks: Task[]) => void;
  add: (title: string) => void;
  update: (id: string, patch: Partial<Omit<Task, "id" | "createdAt">>) => void;
  remove: (id: string) => void;
};

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  setAll: (tasks) => set({ tasks }),
  add: (title) =>
    set((s) => ({
      tasks: [
        ...s.tasks,
        {
          id: crypto.randomUUID(),
          title,
          description: "",
          status: "backlog",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    })),
  update: (id, patch) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)),
    })),
  remove: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
}));
