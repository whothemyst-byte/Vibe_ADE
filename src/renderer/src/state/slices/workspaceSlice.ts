import type { WorkspaceState } from '@shared/types';
import { normalizeSubscriptionState } from '@shared/subscription';
import { collectPaneIds } from '@renderer/services/layoutEngine';
import { getPresetIdForPaneCount } from '@renderer/services/layoutPresets';
import { useToastStore } from '@renderer/hooks/useToast';
import {
  activeWorkspace,
  deriveUiMaps,
  normalizeWorkspacePanes,
  resolveEnvironmentSaveDirectory
} from '../helpers/workspace';
import { normalizeTasks } from '../helpers/tasks';
import { markDirty, type StoreGet, type StoreSet, type WorkspaceStoreState } from '../storeTypes';

type WorkspaceSlice = Pick<
  WorkspaceStoreState,
  | 'initialize'
  | 'createWorkspace'
  | 'cloneWorkspace'
  | 'renameWorkspace'
  | 'deleteWorkspace'
  | 'requestCloseWorkspace'
  | 'cancelCloseWorkspace'
  | 'confirmCloseWorkspace'
  | 'setActiveWorkspace'
  | 'importEnvironmentFromFile'
  | 'saveActiveWorkspace'
  | 'saveAsActiveWorkspace'
>;

export function createWorkspaceSlice(set: StoreSet, get: StoreGet): WorkspaceSlice {
  return {
    initialize: async () => {
      try {
        const state = await window.vibeAde.workspace.list();
        const updateStatus = await window.vibeAde.update.getStatus();
        const subscription = normalizeSubscriptionState(state.subscription);
        const normalizedWorkspaces = state.workspaces.map((workspace) => {
          const { paneAgents, selectedModel, ...rest } = workspace as WorkspaceState & {
            paneAgents?: unknown;
            selectedModel?: unknown;
          };
          return normalizeWorkspacePanes({
            ...rest,
            tasks: normalizeTasks(workspace.tasks)
          });
        });
        const maps = deriveUiMaps(state.workspaces);
        const hasAnyData = state.workspaces.length > 0;
        set((store) => {
          const nextActiveView = state.activeWorkspaceId ? store.ui.activeView : store.ui.activeView;
          return {
            appState: {
              ...state,
              workspaces: normalizedWorkspaces,
              subscription
            },
            loading: false,
            ui: {
              ...store.ui,
              startPageOpen: store.ui.startPageOpen && !hasAnyData,
              activeView: nextActiveView,
              ...maps,
              updateStatus
            }
          };
        });
        if (subscription !== state.subscription) {
          void window.vibeAde.workspace.updateSubscription(subscription);
        }
        window.vibeAde.onUpdateStatus((status) => {
          set((current) => ({
            ui: {
              ...current.ui,
              updateStatus: status
            }
          }));
          if (status.state === 'error') {
            useToastStore.getState().addToast('error', status.error ?? 'Update failed');
          }
        });
      } catch (error) {
        console.error('Failed to initialize workspace:', error);
        useToastStore.getState().addToast('error', 'Failed to load workspaces');
        set({ loading: false });
      }
    },
    createWorkspace: async (input) => {
      try {
        const created = normalizeWorkspacePanes(await window.vibeAde.workspace.create(input));
        const paneIds = collectPaneIds(created.layout);
        set((state) => ({
          appState: {
            ...state.appState,
            activeWorkspaceId: created.id,
            workspaces: [...state.appState.workspaces, created]
          },
          ui: {
            ...state.ui,
            startPageOpen: false,
            startPageMode: 'home',
            createFlowOpen: false,
            createFlowMode: 'choose',
            activeView: 'workspace',
            layoutPresetByWorkspace: {
              ...state.ui.layoutPresetByWorkspace,
              [created.id]: input.layoutPresetId ?? getPresetIdForPaneCount(paneIds.length)
            },
            paneOrderByWorkspace: {
              ...state.ui.paneOrderByWorkspace,
              [created.id]: paneIds
            },
            unsavedByWorkspace: {
              ...state.ui.unsavedByWorkspace,
              [created.id]: true
            }
          }
        }));
        useToastStore.getState().addToast('success', `Environment "${created.name}" created`);
      } catch (error) {
        console.error('Failed to create workspace:', error);
        useToastStore.getState().addToast('error', error instanceof Error ? error.message : 'Failed to create environment');
        throw error;
      }
    },
    cloneWorkspace: async (workspaceId, newName) => {
      const cloned = normalizeWorkspacePanes(await window.vibeAde.workspace.clone(workspaceId, newName));
      const paneIds = collectPaneIds(cloned.layout);
      set((state) => ({
        appState: {
          ...state.appState,
          activeWorkspaceId: cloned.id,
          workspaces: [...state.appState.workspaces, cloned]
        },
        ui: {
          ...state.ui,
          startPageOpen: false,
          startPageMode: 'home',
          activeView: 'workspace',
          layoutPresetByWorkspace: {
            ...state.ui.layoutPresetByWorkspace,
            [cloned.id]: getPresetIdForPaneCount(paneIds.length)
          },
          paneOrderByWorkspace: {
            ...state.ui.paneOrderByWorkspace,
            [cloned.id]: paneIds
          },
          unsavedByWorkspace: {
            ...state.ui.unsavedByWorkspace,
            [cloned.id]: true
          }
        }
      }));
    },
    renameWorkspace: async (workspaceId, name) => {
      set((state) => ({
        appState: {
          ...state.appState,
          workspaces: state.appState.workspaces.map((workspace) =>
            workspace.id === workspaceId ? { ...workspace, name } : workspace
          )
        },
        ui: markDirty(state, workspaceId)
      }));
    },
    deleteWorkspace: async (workspaceId) => {
      try {
        await window.vibeAde.workspace.remove(workspaceId);
        set((state) => {
          const workspaces = state.appState.workspaces.filter((workspace) => workspace.id !== workspaceId);
          const layoutPresetByWorkspace = { ...state.ui.layoutPresetByWorkspace };
          const paneOrderByWorkspace = { ...state.ui.paneOrderByWorkspace };
          const unsavedByWorkspace = { ...state.ui.unsavedByWorkspace };
          delete layoutPresetByWorkspace[workspaceId];
          delete paneOrderByWorkspace[workspaceId];
          delete unsavedByWorkspace[workspaceId];

          return {
            appState: {
              ...state.appState,
              activeWorkspaceId: workspaces[0]?.id ?? null,
              workspaces
            },
            ui: {
              ...state.ui,
              startPageOpen: workspaces.length === 0 ? true : state.ui.startPageOpen,
              startPageMode: workspaces.length === 0 ? 'home' : state.ui.startPageMode,
              activeView: workspaces.length === 0 ? 'workspace' : state.ui.activeView,
              taskBoardTabOpen: workspaces.length === 0 ? false : state.ui.taskBoardTabOpen,
              layoutPresetByWorkspace,
              paneOrderByWorkspace,
              unsavedByWorkspace,
              pendingCloseWorkspaceId: null
            }
          };
        });
      } catch (error) {
        console.error('Failed to delete workspace:', error);
        useToastStore.getState().addToast('error', error instanceof Error ? error.message : 'Failed to delete environment');
        throw error;
      }
    },
    requestCloseWorkspace: async (workspaceId) => {
      const state = get();
      const dirty = state.ui.unsavedByWorkspace[workspaceId] ?? false;
      if (dirty) {
        set((current) => ({
          ui: {
            ...current.ui,
            pendingCloseWorkspaceId: workspaceId
          }
        }));
        return;
      }
      await get().deleteWorkspace(workspaceId);
    },
    cancelCloseWorkspace: () => {
      set((state) => ({
        ui: {
          ...state.ui,
          pendingCloseWorkspaceId: null
        }
      }));
    },
    confirmCloseWorkspace: async (mode) => {
      const workspaceId = get().ui.pendingCloseWorkspaceId;
      if (!workspaceId) {
        return;
      }

      if (mode === 'save') {
        const workspace = get().appState.workspaces.find((item) => item.id === workspaceId);
        if (workspace) {
          await window.vibeAde.workspace.save(workspace);
          set((state) => ({
            ui: {
              ...state.ui,
              unsavedByWorkspace: {
                ...state.ui.unsavedByWorkspace,
                [workspaceId]: false
              }
            }
          }));
        }
      }

      await get().deleteWorkspace(workspaceId);
    },
    setActiveWorkspace: async (workspaceId) => {
      await window.vibeAde.workspace.setActive(workspaceId);
      set((state) => ({
        appState: {
          ...state.appState,
          activeWorkspaceId: workspaceId
        },
        ui: {
          ...state.ui,
          activeView: 'workspace',
          startPageOpen: false,
          startPageMode: 'home'
        }
      }));
    },
    importEnvironmentFromFile: async (filePath) => {
      const state = await window.vibeAde.workspace.importFromFile(filePath);
      const normalizedWorkspaces = state.workspaces.map((workspace) => {
        const { paneAgents, selectedModel, ...rest } = workspace as WorkspaceState & {
          paneAgents?: unknown;
          selectedModel?: unknown;
        };
        return normalizeWorkspacePanes({
          ...rest,
          tasks: normalizeTasks(workspace.tasks)
        });
      });
      const maps = deriveUiMaps(normalizedWorkspaces);

      set((store) => ({
        appState: {
          ...state,
          workspaces: normalizedWorkspaces
        },
        ui: {
          ...store.ui,
          startPageOpen: false,
          startPageMode: 'home',
          activeView: 'workspace',
          ...maps
        }
      }));

      useToastStore.getState().addToast('success', 'Environment opened');
    },
    saveActiveWorkspace: async () => {
      const workspace = activeWorkspace(get().appState);
      if (!workspace) {
        return;
      }
      try {
        const directory = await resolveEnvironmentSaveDirectory();
        if (!directory) {
          useToastStore.getState().addToast('info', 'Save cancelled (no location selected)');
          return;
        }

        await window.vibeAde.workspace.save(workspace);
        await window.vibeAde.workspace.exportToDirectory(workspace, directory);

        set((state) => ({
          ui: {
            ...state.ui,
            unsavedByWorkspace: {
              ...state.ui.unsavedByWorkspace,
              [workspace.id]: false
            }
          }
        }));
        useToastStore.getState().addToast('success', 'Environment saved');
      } catch (error) {
        console.error('Failed to save workspace:', error);
        useToastStore.getState().addToast('error', 'Failed to save environment');
        throw error;
      }
    },
    saveAsActiveWorkspace: async () => {
      const workspace = activeWorkspace(get().appState);
      if (!workspace) {
        return;
      }

      const nextName = window.prompt('Save As - Environment Name', `${workspace.name} Copy`);
      if (!nextName?.trim()) {
        return;
      }

      const nextRoot = await window.vibeAde.system.selectDirectory();
      if (!nextRoot) {
        return;
      }

      const nextWorkspace: WorkspaceState = {
        ...workspace,
        name: nextName.trim(),
        rootDir: nextRoot
      };

      const directory = await resolveEnvironmentSaveDirectory();
      if (!directory) {
        useToastStore.getState().addToast('info', 'Save cancelled (no location selected)');
        return;
      }

      await window.vibeAde.workspace.save(nextWorkspace);
      await window.vibeAde.workspace.exportToDirectory(nextWorkspace, directory);

      set((state) => ({
        appState: {
          ...state.appState,
          workspaces: state.appState.workspaces.map((item) => (item.id === nextWorkspace.id ? nextWorkspace : item))
        },
        ui: {
          ...state.ui,
          unsavedByWorkspace: {
            ...state.ui.unsavedByWorkspace,
            [nextWorkspace.id]: false
          }
        }
      }));
    }
  };
}
