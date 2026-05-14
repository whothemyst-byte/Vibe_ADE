import { create } from 'zustand';
import { normalizeSubscriptionState } from '@shared/subscription';
import { createCanvasSlice } from './slices/canvasSlice';
import { createPaneSlice } from './slices/paneSlice';
import { createSwarmSlice } from './slices/swarmSlice';
import { createTaskSlice } from './slices/taskSlice';
import { createUiSlice } from './slices/uiSlice';
import { createWorkspaceSlice } from './slices/workspaceSlice';
import { DEFAULT_TASK_FILTERS, DEFAULT_TASK_SORT } from './helpers/tasks';
import type { UiState, WorkspaceStoreState } from './storeTypes';

const initialUi: UiState = {
  taskBoardTabOpen: false,
  activeView: 'workspace',
  startPageOpen: true,
  startPageMode: 'home',
  openEnvironmentOpen: false,
  createFlowOpen: false,
  createFlowMode: 'choose',
  settingsOpen: false,
  settingsTab: 'appearance',
  sidebarCollapsed: false,
  swarmDashboardOpen: false,
  activeSwarmId: null,
  swarmSessions: [],
  layoutPresetByWorkspace: {},
  paneOrderByWorkspace: {},
  unsavedByWorkspace: {},
  pendingCloseWorkspaceId: null,
  taskSearch: '',
  taskFilters: DEFAULT_TASK_FILTERS,
  taskSort: DEFAULT_TASK_SORT,
  updateStatus: { state: 'idle' },
  taskFiltersOpen: false,
  terminalFindRequest: null
};

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  appState: {
    activeWorkspaceId: null,
    workspaces: [],
    subscription: normalizeSubscriptionState()
  },
  loading: true,
  ui: initialUi,
  ...createWorkspaceSlice(set, get),
  ...createPaneSlice(set, get),
  ...createTaskSlice(set, get),
  ...createUiSlice(set, get),
  ...createSwarmSlice(set, get),
  ...createCanvasSlice(set, get, undefined as never)
}));

export type { UiState, WorkspaceStoreState } from './storeTypes';
