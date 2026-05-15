import { v4 as uuidv4 } from 'uuid';
import { activeWorkspace } from '../helpers/workspace';
import { type StoreGet, type StoreSet, type WorkspaceStoreState } from '../storeTypes';

type UiSlice = Pick<
  WorkspaceStoreState,
  | 'openStartPage'
  | 'closeStartPage'
  | 'openCreateFlow'
  | 'closeCreateFlow'
  | 'openEnvironmentOverlay'
  | 'closeEnvironmentOverlay'
  | 'openSettings'
  | 'closeSettings'
  | 'setSettingsTab'
  | 'setSidebarCollapsed'
  | 'toggleSidebarCollapsed'
  | 'requestTerminalFind'
>;

export function createUiSlice(set: StoreSet, get: StoreGet): UiSlice {
  return {
    openStartPage: (mode = 'home') => {
      set((state) => ({
        ui: {
          ...state.ui,
          startPageOpen: true,
          startPageMode: mode
        }
      }));
    },
    closeStartPage: () => {
      set((state) => ({
        ui: {
          ...state.ui,
          startPageOpen: false
        }
      }));
    },
    openCreateFlow: (mode = 'workspace') => {
      set((state) => ({
        ui: {
          ...state.ui,
          createFlowOpen: true,
          createFlowMode: mode,
          startPageOpen: state.appState.workspaces.length === 0 ? state.ui.startPageOpen : false,
          openEnvironmentOpen: false
        }
      }));
    },
    closeCreateFlow: () => {
      set((state) => {
        const hasOpenWorkspace = Boolean(state.appState.activeWorkspaceId);
        const hasOpenSwarm = state.ui.activeView === 'swarm' && Boolean(state.ui.activeSwarmId);
        const hasOpenTaskBoard = state.ui.activeView === 'task-board';
        const shouldGoHome = !(hasOpenWorkspace || hasOpenSwarm || hasOpenTaskBoard);

        return {
          ui: {
            ...state.ui,
            createFlowOpen: false,
            createFlowMode: null,
            ...(shouldGoHome ? { startPageOpen: true, startPageMode: 'home' } : {})
          }
        };
      });
    },
    openEnvironmentOverlay: () => {
      set((state) => ({
        ui: {
          ...state.ui,
          openEnvironmentOpen: true,
          startPageOpen: state.appState.workspaces.length === 0 ? state.ui.startPageOpen : false,
          createFlowOpen: false,
          createFlowMode: null
        }
      }));
    },
    closeEnvironmentOverlay: () => {
      set((state) => {
        const hasOpenWorkspace = Boolean(state.appState.activeWorkspaceId);
        const hasOpenSwarm = state.ui.activeView === 'swarm' && Boolean(state.ui.activeSwarmId);
        const hasOpenTaskBoard = state.ui.activeView === 'task-board';
        const shouldGoHome = !(hasOpenWorkspace || hasOpenSwarm || hasOpenTaskBoard);

        return {
          ui: {
            ...state.ui,
            openEnvironmentOpen: false,
            ...(shouldGoHome ? { startPageOpen: true, startPageMode: 'home' } : {})
          }
        };
      });
    },
    openSettings: (tab = 'appearance') => {
      set((state) => ({
        ui: {
          ...state.ui,
          settingsOpen: true,
          settingsTab: tab
        }
      }));
    },
    setSidebarCollapsed: (collapsed) => {
      set((state) => ({
        ui: {
          ...state.ui,
          sidebarCollapsed: collapsed
        }
      }));
    },
    toggleSidebarCollapsed: () => {
      set((state) => ({
        ui: {
          ...state.ui,
          sidebarCollapsed: !state.ui.sidebarCollapsed
        }
      }));
    },
    setSettingsTab: (tab) => {
      set((state) => ({
        ui: {
          ...state.ui,
          settingsTab: tab
        }
      }));
    },
    closeSettings: () => {
      set((state) => ({
        ui: {
          ...state.ui,
          settingsOpen: false
        }
      }));
    },
    requestTerminalFind: (query) => {
      const workspace = activeWorkspace(get().appState);
      if (!workspace || !workspace.activePaneId) {
        return;
      }
      set((state) => ({
        ui: {
          ...state.ui,
          terminalFindRequest: {
            paneId: workspace.activePaneId,
            query,
            id: uuidv4()
          }
        }
      }));
    }
  };
}
