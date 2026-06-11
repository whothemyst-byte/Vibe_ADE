import { create } from "zustand";

export type TerminalState = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  presetId: string;
  cwd: string;
};

type TerminalStore = {
  terminals: TerminalState[];
  /** World-space center of the managed grid; null until the first layout. */
  anchor: { x: number; y: number } | null;
  add: (t: TerminalState) => void;
  update: (id: string, patch: Partial<TerminalState>) => void;
  remove: (id: string) => void;
  /** Reorders a terminal to `index` (grid order = array order). */
  moveToIndex: (id: string, index: number) => void;
};

export const useTerminalStore = create<TerminalStore>((set) => ({
  terminals: [],
  anchor: null,
  add: (t) => set((s) => ({ terminals: [...s.terminals, t] })),
  update: (id, patch) =>
    set((s) => ({
      terminals: s.terminals.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  remove: (id) => set((s) => ({ terminals: s.terminals.filter((t) => t.id !== id) })),
  moveToIndex: (id, index) =>
    set((s) => {
      const from = s.terminals.findIndex((t) => t.id === id);
      if (from === -1) return {};
      const next = [...s.terminals];
      const [moved] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(index, next.length)), 0, moved);
      return { terminals: next };
    }),
}));
