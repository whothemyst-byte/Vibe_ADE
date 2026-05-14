import type { StateCreator } from 'zustand';
import type { CanvasState, PaneId, WorkspaceId } from '@shared/types';
import type { WorkspaceStoreState } from '../storeTypes';

export interface CanvasSlice {
  setCanvasTransform: (wsId: WorkspaceId, transform: CanvasState['transform']) => void;
  setCanvasCard: (
    wsId: WorkspaceId,
    paneId: PaneId,
    rect: { x: number; y: number; w: number; h: number }
  ) => void;
  removeCanvasCard: (wsId: WorkspaceId, paneId: PaneId) => void;
}

const DEFAULT_TRANSFORM: CanvasState['transform'] = { x: 0, y: 0, scale: 1 };

export const createCanvasSlice: StateCreator<WorkspaceStoreState, [], [], CanvasSlice> = (set) => ({
  setCanvasTransform: (wsId, transform) =>
    set((state) => ({
      appState: {
        ...state.appState,
        workspaces: state.appState.workspaces.map((w) =>
          w.id !== wsId
            ? w
            : {
                ...w,
                canvas: { ...(w.canvas ?? { transform: DEFAULT_TRANSFORM, cards: {} }), transform }
              }
        )
      }
    })),
  setCanvasCard: (wsId, paneId, rect) =>
    set((state) => ({
      appState: {
        ...state.appState,
        workspaces: state.appState.workspaces.map((w) => {
          if (w.id !== wsId) return w;
          const canvas = w.canvas ?? { transform: DEFAULT_TRANSFORM, cards: {} };
          return {
            ...w,
            canvas: { ...canvas, cards: { ...canvas.cards, [paneId]: rect } }
          };
        })
      }
    })),
  removeCanvasCard: (wsId, paneId) =>
    set((state) => ({
      appState: {
        ...state.appState,
        workspaces: state.appState.workspaces.map((w) => {
          if (w.id !== wsId || !w.canvas) return w;
          const { [paneId]: _drop, ...rest } = w.canvas.cards;
          return { ...w, canvas: { ...w.canvas, cards: rest } };
        })
      }
    }))
});
