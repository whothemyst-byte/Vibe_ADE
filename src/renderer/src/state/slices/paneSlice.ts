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
import { activeWorkspace, normalizeWorkspacePanes } from '../helpers/workspace';
import { markDirty, type StoreGet, type StoreSet, type WorkspaceStoreState } from '../storeTypes';

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
      const next = removePaneFromWorkspace(current, paneId);
      if (next === current) {
        return false;
      }
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
