import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import {
  appendBrowserTabToPane,
  moveBrowserTabInPane,
  moveBrowserTabToEnd,
  normalizeBrowserPaneState,
  removeBrowserTabFromPane,
  setActiveBrowserTab as setActiveBrowserTabState,
  syncBrowserPaneFromActiveTab
} from '@shared/browserPane';
import {
  appendBrowserPaneToWorkspace,
  appendPaneToWorkspace,
  collectPaneIds,
  movePaneInOrder,
  removePaneFromWorkspace,
  syncPaneOrder as syncPaneOrderList
} from '@renderer/services/layoutEngine';
import { getPresetById, getPresetIdForPaneCount } from '@renderer/services/layoutPresets';
import { useToastStore } from '@renderer/hooks/useToast';
import type { PaneId, WorkspaceState } from '@shared/types';
import { activeWorkspace, normalizeWorkspacePanes } from '../helpers/workspace';
import { markDirty, type StoreGet, type StoreSet, type WorkspaceStoreState } from '../storeTypes';

const DEFAULT_CANVAS_TRANSFORM = { x: 0, y: 0, scale: 1 };
const DEFAULT_CARD_SIZE = { w: 560, h: 360 };
const CARD_OFFSET_STEP = 32;
const CARD_OFFSET_ORIGIN = 48;

function seedCanvasCardsForNewPanes(
  prev: WorkspaceState,
  next: WorkspaceState,
  nextPaneIds: PaneId[]
): WorkspaceState {
  if (next.mode !== 'canvas') {
    return next;
  }
  const prevPaneIds = new Set(collectPaneIds(prev.layout));
  const newPaneIds = nextPaneIds.filter((id) => !prevPaneIds.has(id));
  if (newPaneIds.length === 0) {
    return next;
  }
  const existingCards = next.canvas?.cards ?? {};
  const baseCount = Object.keys(existingCards).length;
  const addedCards = Object.fromEntries(
    newPaneIds.map((paneId, index) => {
      const offset = CARD_OFFSET_ORIGIN + (baseCount + index) * CARD_OFFSET_STEP;
      return [paneId, { x: offset, y: offset, ...DEFAULT_CARD_SIZE }];
    })
  );
  return {
    ...next,
    canvas: {
      transform: next.canvas?.transform ?? DEFAULT_CANVAS_TRANSFORM,
      snapToGrid: next.canvas?.snapToGrid,
      background: next.canvas?.background,
      cards: { ...existingCards, ...addedCards }
    }
  };
}

function dropCanvasCard(ws: WorkspaceState, paneId: PaneId): WorkspaceState {
  if (!ws.canvas || !(paneId in ws.canvas.cards)) {
    return ws;
  }
  const { [paneId]: _drop, ...rest } = ws.canvas.cards;
  return { ...ws, canvas: { ...ws.canvas, cards: rest } };
}

type PaneSlice = Pick<
  WorkspaceStoreState,
  | 'setActivePane'
  | 'addPaneToLayout'
  | 'addBrowserPaneToLayout'
  | 'removePaneFromLayout'
  | 'addBrowserTabToLayout'
  | 'setActiveBrowserTab'
  | 'closeBrowserTab'
  | 'moveBrowserTabToLayout'
  | 'moveBrowserTabToLayoutEnd'
  | 'reorderPanes'
  | 'movePaneToIndex'
  | 'syncPaneOrder'
  | 'updateBrowserPane'
  | 'setLayoutPreset'
  | 'appendCommandBlock'
  | 'toggleCommandBlock'
>;

export function createPaneSlice(set: StoreSet, get: StoreGet): PaneSlice {
  return {
    setActivePane: async (paneId) => {
      const current = activeWorkspace(get().appState);
      if (!current) {
        return;
      }
      if (current.activePaneId === paneId) {
        return;
      }
      const next = { ...current, activePaneId: paneId };
      set((state) => ({
        appState: {
          ...state.appState,
          workspaces: state.appState.workspaces.map((w) => (w.id === next.id ? next : w))
        }
      }));
    },
    addPaneToLayout: async () => {
      const current = activeWorkspace(get().appState);
      if (!current) {
        return;
      }
      const normalizedSub = normalizeSubscriptionState(get().appState.subscription);
      if (normalizedSub !== get().appState.subscription) {
        set((state) => ({
          appState: { ...state.appState, subscription: normalizedSub }
        }));
        void window.vibeAde.workspace.updateSubscription(normalizedSub);
      }
      const plan = SUBSCRIPTION_PLANS[normalizedSub.tier];
      const maxPanes = plan.limits.maxPanesPerWorkspace;
      const currentPanes = collectPaneIds(current.layout).length;
      if (maxPanes !== null && currentPanes >= maxPanes) {
        useToastStore.getState().addToast('info', `Spark plan supports up to ${maxPanes} panes per workspace. Upgrade to add more.`);
        return;
      }
      const next = appendPaneToWorkspace(current);
      if (next === current) {
        return;
      }
      const paneIds = collectPaneIds(next.layout);
      const withCanvas = seedCanvasCardsForNewPanes(current, next, paneIds);

      set((state) => ({
        appState: {
          ...state.appState,
          workspaces: state.appState.workspaces.map((w) => (w.id === withCanvas.id ? normalizeWorkspacePanes(withCanvas) : w))
        },
        ui: {
          ...markDirty(state, withCanvas.id),
          layoutPresetByWorkspace: {
            ...state.ui.layoutPresetByWorkspace,
            [withCanvas.id]: getPresetIdForPaneCount(paneIds.length)
          },
          paneOrderByWorkspace: {
            ...state.ui.paneOrderByWorkspace,
            [withCanvas.id]: syncPaneOrderList(state.ui.paneOrderByWorkspace[withCanvas.id] ?? [], paneIds)
          }
        }
      }));
    },
    addBrowserPaneToLayout: async (targetPaneId, url = 'about:blank') => {
      const current = activeWorkspace(get().appState);
      if (!current) {
        return;
      }
      const normalizedSub = normalizeSubscriptionState(get().appState.subscription);
      if (normalizedSub !== get().appState.subscription) {
        set((state) => ({
          appState: { ...state.appState, subscription: normalizedSub }
        }));
        void window.vibeAde.workspace.updateSubscription(normalizedSub);
      }
      const plan = SUBSCRIPTION_PLANS[normalizedSub.tier];
      const maxPanes = plan.limits.maxPanesPerWorkspace;
      const currentPanes = collectPaneIds(current.layout).length;
      if (maxPanes !== null && currentPanes >= maxPanes) {
        useToastStore.getState().addToast('info', `Spark plan supports up to ${maxPanes} panes per workspace. Upgrade to add more.`);
        return;
      }
      const existingBrowserPane = Object.values(current.browserPanes).find((pane) => pane.sourcePaneId === (targetPaneId ?? current.activePaneId));
      if (existingBrowserPane) {
        useToastStore.getState().addToast('info', 'A browser window is already open for that terminal.');
        return;
      }
      const next = appendBrowserPaneToWorkspace(current, targetPaneId ?? current.activePaneId, url);
      if (next === current) {
        return;
      }
      const paneIds = collectPaneIds(next.layout);
      const withCanvas = seedCanvasCardsForNewPanes(current, next, paneIds);

      set((state) => ({
        appState: {
          ...state.appState,
          workspaces: state.appState.workspaces.map((w) => (w.id === withCanvas.id ? normalizeWorkspacePanes(withCanvas) : w))
        },
        ui: {
          ...markDirty(state, withCanvas.id),
          layoutPresetByWorkspace: {
            ...state.ui.layoutPresetByWorkspace,
            [withCanvas.id]: getPresetIdForPaneCount(paneIds.length)
          },
          paneOrderByWorkspace: {
            ...state.ui.paneOrderByWorkspace,
            [withCanvas.id]: syncPaneOrderList(state.ui.paneOrderByWorkspace[withCanvas.id] ?? [], paneIds)
          }
        }
      }));
    },
    addBrowserTabToLayout: (workspaceId, paneId, input) => {
      set((state) => {
        const workspace = state.appState.workspaces.find((item) => item.id === workspaceId);
        if (!workspace || workspace.paneTypes[paneId] !== 'browser') {
          return state;
        }
        const currentPane = workspace.browserPanes[paneId] ?? normalizeBrowserPaneState(undefined);
        const nextBrowserPane = appendBrowserTabToPane(currentPane, input);
        const nextWorkspace = normalizeWorkspacePanes({
          ...workspace,
          browserPanes: {
            ...workspace.browserPanes,
            [paneId]: nextBrowserPane
          }
        });
        return {
          appState: {
            ...state.appState,
            workspaces: state.appState.workspaces.map((item) => (item.id === workspaceId ? nextWorkspace : item))
          },
          ui: markDirty(state, workspaceId)
        };
      });
    },
    setActiveBrowserTab: (workspaceId, paneId, tabId) => {
      set((state) => {
        const workspace = state.appState.workspaces.find((item) => item.id === workspaceId);
        if (!workspace || workspace.paneTypes[paneId] !== 'browser') {
          return state;
        }
        const currentPane = workspace.browserPanes[paneId] ?? normalizeBrowserPaneState(undefined);
        const nextBrowserPane = setActiveBrowserTabState(currentPane, tabId);
        if (nextBrowserPane === currentPane) {
          return state;
        }
        const nextWorkspace = normalizeWorkspacePanes({
          ...workspace,
          browserPanes: {
            ...workspace.browserPanes,
            [paneId]: nextBrowserPane
          }
        });
        return {
          appState: {
            ...state.appState,
            workspaces: state.appState.workspaces.map((item) => (item.id === workspaceId ? nextWorkspace : item))
          },
          ui: markDirty(state, workspaceId)
        };
      });
    },
    closeBrowserTab: (workspaceId, paneId, tabId) => {
      set((state) => {
        const workspace = state.appState.workspaces.find((item) => item.id === workspaceId);
        if (!workspace || workspace.paneTypes[paneId] !== 'browser') {
          return state;
        }
        const currentPane = workspace.browserPanes[paneId] ?? normalizeBrowserPaneState(undefined);
        const nextBrowserPane = removeBrowserTabFromPane(currentPane, tabId);
        if (nextBrowserPane === currentPane) {
          return state;
        }
        const nextWorkspace = normalizeWorkspacePanes({
          ...workspace,
          browserPanes: {
            ...workspace.browserPanes,
            [paneId]: nextBrowserPane
          }
        });
        return {
          appState: {
            ...state.appState,
            workspaces: state.appState.workspaces.map((item) => (item.id === workspaceId ? nextWorkspace : item))
          },
          ui: markDirty(state, workspaceId)
        };
      });
    },
    moveBrowserTabToLayout: (workspaceId, paneId, sourceTabId, targetTabId) => {
      set((state) => {
        const workspace = state.appState.workspaces.find((item) => item.id === workspaceId);
        if (!workspace || workspace.paneTypes[paneId] !== 'browser') {
          return state;
        }
        const currentPane = workspace.browserPanes[paneId] ?? normalizeBrowserPaneState(undefined);
        const nextBrowserPane = moveBrowserTabInPane(currentPane, sourceTabId, targetTabId);
        if (nextBrowserPane === currentPane) {
          return state;
        }
        const nextWorkspace = normalizeWorkspacePanes({
          ...workspace,
          browserPanes: {
            ...workspace.browserPanes,
            [paneId]: nextBrowserPane
          }
        });
        return {
          appState: {
            ...state.appState,
            workspaces: state.appState.workspaces.map((item) => (item.id === workspaceId ? nextWorkspace : item))
          },
          ui: markDirty(state, workspaceId)
        };
      });
    },
    moveBrowserTabToLayoutEnd: (workspaceId, paneId, sourceTabId) => {
      set((state) => {
        const workspace = state.appState.workspaces.find((item) => item.id === workspaceId);
        if (!workspace || workspace.paneTypes[paneId] !== 'browser') {
          return state;
        }
        const currentPane = workspace.browserPanes[paneId] ?? normalizeBrowserPaneState(undefined);
        const nextBrowserPane = moveBrowserTabToEnd(currentPane, sourceTabId);
        if (nextBrowserPane === currentPane) {
          return state;
        }
        const nextWorkspace = normalizeWorkspacePanes({
          ...workspace,
          browserPanes: {
            ...workspace.browserPanes,
            [paneId]: nextBrowserPane
          }
        });
        return {
          appState: {
            ...state.appState,
            workspaces: state.appState.workspaces.map((item) => (item.id === workspaceId ? nextWorkspace : item))
          },
          ui: markDirty(state, workspaceId)
        };
      });
    },
    removePaneFromLayout: async (paneId) => {
      const current = activeWorkspace(get().appState);
      if (!current) {
        return false;
      }
      const removed = removePaneFromWorkspace(current, paneId);
      if (removed === current) {
        return false;
      }
      const next = dropCanvasCard(removed, paneId);
      const paneIds = collectPaneIds(next.layout);

      set((state) => ({
        appState: {
          ...state.appState,
          workspaces: state.appState.workspaces.map((w) => (w.id === next.id ? normalizeWorkspacePanes(next) : w))
        },
        ui: {
          ...markDirty(state, next.id),
          layoutPresetByWorkspace: {
            ...state.ui.layoutPresetByWorkspace,
            [next.id]: getPresetIdForPaneCount(paneIds.length)
          },
          paneOrderByWorkspace: {
            ...state.ui.paneOrderByWorkspace,
            [next.id]: syncPaneOrderList(state.ui.paneOrderByWorkspace[next.id] ?? [], paneIds)
          }
        }
      }));
      return true;
    },
    reorderPanes: (sourcePaneId, targetPaneId) => {
      const workspaceId = get().appState.activeWorkspaceId;
      if (!workspaceId) {
        return;
      }
      set((state) => {
        const currentOrder = state.ui.paneOrderByWorkspace[workspaceId] ?? [];
        return {
          ui: {
            ...markDirty(state, workspaceId),
            paneOrderByWorkspace: {
              ...state.ui.paneOrderByWorkspace,
              [workspaceId]: movePaneInOrder(currentOrder, sourcePaneId, targetPaneId)
            }
          }
        };
      });
    },
    movePaneToIndex: (paneId, toIndex) => {
      const workspaceId = get().appState.activeWorkspaceId;
      if (!workspaceId) {
        return;
      }

      set((state) => {
        const currentOrder = state.ui.paneOrderByWorkspace[workspaceId] ?? [];
        const currentIndex = currentOrder.indexOf(paneId);
        if (currentIndex < 0) {
          return state;
        }

        const next = [...currentOrder];
        next.splice(currentIndex, 1);
        const safeIndex = Math.max(0, Math.min(next.length, Math.floor(toIndex)));
        next.splice(safeIndex, 0, paneId);

        return {
          ui: {
            ...markDirty(state, workspaceId),
            paneOrderByWorkspace: {
              ...state.ui.paneOrderByWorkspace,
              [workspaceId]: next
            }
          }
        };
      });
    },
    syncPaneOrder: (workspaceId, paneIds) => {
      set((state) => {
        const current = state.ui.paneOrderByWorkspace[workspaceId] ?? [];
        return {
          ui: {
            ...state.ui,
            paneOrderByWorkspace: {
              ...state.ui.paneOrderByWorkspace,
              [workspaceId]: syncPaneOrderList(current, paneIds)
            }
          }
        };
      });
    },
    updateBrowserPane: (workspaceId, paneId, patch) => {
      set((state) => {
        const workspace = state.appState.workspaces.find((item) => item.id === workspaceId);
        if (!workspace) {
          return state;
        }
        const currentPane = workspace.browserPanes[paneId] ?? normalizeBrowserPaneState(undefined);
        const nextBrowserPane = syncBrowserPaneFromActiveTab(currentPane, patch);
        const nextWorkspace = normalizeWorkspacePanes({
          ...workspace,
          browserPanes: {
            ...workspace.browserPanes,
            [paneId]: nextBrowserPane
          }
        });
        return {
          appState: {
            ...state.appState,
            workspaces: state.appState.workspaces.map((item) => (item.id === workspaceId ? nextWorkspace : item))
          },
          ui: markDirty(state, workspaceId)
        };
      });
    },
    setLayoutPreset: async (presetId) => {
      const workspaceId = get().appState.activeWorkspaceId;
      if (!workspaceId) {
        return;
      }

      const desiredCount = getPresetById(presetId).slots;
      const current = activeWorkspace(get().appState);
      if (!current) {
        return;
      }

      let next = current;
      const currentPaneIds = collectPaneIds(current.layout);
      const order = get().ui.paneOrderByWorkspace[workspaceId] ?? currentPaneIds;
      const extras = order.filter((paneId) => currentPaneIds.includes(paneId)).slice(desiredCount);
      const removedPaneIds = [...extras];

      if (extras.length > 0) {
        for (const paneId of extras) {
          next = removePaneFromWorkspace(next, paneId);
        }
      } else if (currentPaneIds.length < desiredCount) {
        while (collectPaneIds(next.layout).length < desiredCount) {
          next = appendPaneToWorkspace(next);
        }
      }

      const nextPaneIds = collectPaneIds(next.layout);
      set((state) => ({
        appState: {
          ...state.appState,
          workspaces: state.appState.workspaces.map((w) => (w.id === next.id ? normalizeWorkspacePanes(next) : w))
        },
        ui: {
          ...markDirty(state, next.id),
          layoutPresetByWorkspace: {
            ...state.ui.layoutPresetByWorkspace,
            [next.id]: presetId
          },
          paneOrderByWorkspace: {
            ...state.ui.paneOrderByWorkspace,
            [next.id]: syncPaneOrderList(state.ui.paneOrderByWorkspace[next.id] ?? [], nextPaneIds)
          }
        }
      }));

      if (removedPaneIds.length > 0) {
        void Promise.all(
          removedPaneIds.map((paneId) =>
            window.vibeAde.terminal.stopSession(paneId).catch((error) => {
              console.error(`Failed to stop terminal session for pane ${paneId}:`, error);
            })
          )
        );
      }
    },
    appendCommandBlock: async (paneId, block) => {
      const current = activeWorkspace(get().appState);
      if (!current) {
        return;
      }
      const next = {
        ...current,
        commandBlocks: {
          ...current.commandBlocks,
          [paneId]: [{ ...block, collapsed: true }, ...(current.commandBlocks[paneId] ?? [])]
        }
      };
      set((state) => ({
        appState: {
          ...state.appState,
          workspaces: state.appState.workspaces.map((w) => (w.id === next.id ? next : w))
        },
        ui: markDirty(state, next.id)
      }));
    },
    toggleCommandBlock: async (paneId, blockId) => {
      const current = activeWorkspace(get().appState);
      if (!current) {
        return;
      }
      const updated = (current.commandBlocks[paneId] ?? []).map((block) =>
        block.id === blockId ? { ...block, collapsed: !block.collapsed } : block
      );

      const next = {
        ...current,
        commandBlocks: {
          ...current.commandBlocks,
          [paneId]: updated
        }
      };

      set((state) => ({
        appState: {
          ...state.appState,
          workspaces: state.appState.workspaces.map((w) => (w.id === next.id ? next : w))
        },
        ui: markDirty(state, next.id)
      }));
    }
  };
}
