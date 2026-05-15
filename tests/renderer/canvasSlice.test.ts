import { describe, it, expect } from 'vitest';
import { createCanvasSlice } from '../../src/renderer/src/state/slices/canvasSlice';
import type { WorkspaceStoreState } from '../../src/renderer/src/state/storeTypes';

function makeStore(initialWorkspace: any) {
  let state: any = {
    appState: { workspaces: [initialWorkspace], activeWorkspaceId: initialWorkspace.id }
  };
  const set = (fn: any) => {
    state = typeof fn === 'function' ? { ...state, ...fn(state) } : { ...state, ...fn };
  };
  const get = () => state as WorkspaceStoreState;
  const slice = createCanvasSlice(set as any, get as any, {} as any);
  return { slice, getState: () => state };
}

describe('canvasSlice.setCanvasOptions', () => {
  it('creates canvas state with options when missing', () => {
    const { slice, getState } = makeStore({ id: 'w1' });
    slice.setCanvasOptions('w1', { snapToGrid: true, background: 'dots' });
    const ws = getState().appState.workspaces[0];
    expect(ws.canvas.snapToGrid).toBe(true);
    expect(ws.canvas.background).toBe('dots');
    expect(ws.canvas.transform).toEqual({ x: 0, y: 0, scale: 1 });
    expect(ws.canvas.cards).toEqual({});
  });

  it('merges options without dropping existing canvas state', () => {
    const { slice, getState } = makeStore({
      id: 'w1',
      canvas: {
        transform: { x: 10, y: 20, scale: 1.5 },
        cards: { p1: { x: 0, y: 0, w: 320, h: 200 } },
        background: 'blank'
      }
    });
    slice.setCanvasOptions('w1', { snapToGrid: true });
    const ws = getState().appState.workspaces[0];
    expect(ws.canvas.snapToGrid).toBe(true);
    expect(ws.canvas.background).toBe('blank');
    expect(ws.canvas.transform).toEqual({ x: 10, y: 20, scale: 1.5 });
    expect(ws.canvas.cards.p1).toEqual({ x: 0, y: 0, w: 320, h: 200 });
  });

  it('updates only the targeted workspace', () => {
    const { slice, getState } = makeStore({ id: 'w1' });
    (getState() as any).appState.workspaces.push({ id: 'w2' });
    slice.setCanvasOptions('w2', { background: 'grid' });
    const [w1, w2] = getState().appState.workspaces;
    expect((w1 as any).canvas).toBeUndefined();
    expect((w2 as any).canvas.background).toBe('grid');
  });
});
