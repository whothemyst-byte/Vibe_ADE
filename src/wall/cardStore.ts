import { create } from "zustand";

export type TerminalCard = {
  kind: "terminal";
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  presetId: string;
  cwd: string;
};

/** The wall's single browser; occupies a grid cell like any terminal. */
export type BrowserCard = {
  kind: "browser";
  id: string;
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** A read-only file preview; occupies a grid cell like a terminal. */
export type FileCard = {
  kind: "file";
  id: string;
  path: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** A live design surface backed by a *.design.json file; occupies a grid cell. */
export type DesignCard = {
  kind: "design";
  id: string;
  path: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Card = TerminalCard | BrowserCard | FileCard | DesignCard;

export function terminalsOf(cards: Card[]): TerminalCard[] {
  return cards.filter((c): c is TerminalCard => c.kind === "terminal");
}

type CardStore = {
  cards: Card[];
  /** World-space center of the managed grid; null until the first layout. */
  anchor: { x: number; y: number } | null;
  add: (c: Card) => void;
  update: (
    id: string,
    patch:
      | Partial<Omit<TerminalCard, "kind" | "id">>
      | Partial<Omit<BrowserCard, "kind" | "id">>
      | Partial<Omit<FileCard, "kind" | "id">>
      | Partial<Omit<DesignCard, "kind" | "id">>
  ) => void;
  remove: (id: string) => void;
  /** Reorders a card to `index` (grid order = array order). */
  moveToIndex: (id: string, index: number) => void;
};

export const useCardStore = create<CardStore>((set) => ({
  cards: [],
  anchor: null,
  add: (c) => set((s) => ({ cards: [...s.cards, c] })),
  update: (id, patch) =>
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? ({ ...c, ...patch } as Card) : c)),
    })),
  remove: (id) => set((s) => ({ cards: s.cards.filter((c) => c.id !== id) })),
  moveToIndex: (id, index) =>
    set((s) => {
      const from = s.cards.findIndex((c) => c.id === id);
      if (from === -1) return {};
      const next = [...s.cards];
      const [moved] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(index, next.length)), 0, moved);
      return { cards: next };
    }),
}));
