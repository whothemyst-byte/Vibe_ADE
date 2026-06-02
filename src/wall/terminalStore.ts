import { create } from "zustand";

export type TerminalState = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  presetId: string;
  cwd: string;
  started: boolean;
};

type TerminalStore = {
  terminals: TerminalState[];
  add: (t: TerminalState) => void;
  update: (id: string, patch: Partial<TerminalState>) => void;
  remove: (id: string) => void;
};

export const useTerminalStore = create<TerminalStore>((set) => ({
  terminals: [],
  add: (t) => set((s) => ({ terminals: [...s.terminals, t] })),
  update: (id, patch) =>
    set((s) => ({
      terminals: s.terminals.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  remove: (id) => set((s) => ({ terminals: s.terminals.filter((t) => t.id !== id) })),
}));
