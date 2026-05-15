import type { StoreApi } from 'zustand';
import type {
  AppState,
  BrowserPaneState,
  CommandBlock,
  PaneId,
  TaskFilterState,
  TaskItem,
  TaskPriority,
  TaskSortMode,
  TaskStatus,
  UpdateStatus
} from '@shared/types';
import type { LayoutPresetId } from '@renderer/services/layoutPresets';

export interface UiState {
  taskBoardTabOpen: boolean;
  activeView: 'workspace' | 'task-board' | 'swarm' | 'mindmap';
  startPageOpen: boolean;
  startPageMode: 'home' | 'open';
  openEnvironmentOpen: boolean;
  createFlowOpen: boolean;
  createFlowMode: 'workspace' | 'swarm' | 'canvas' | null;
  settingsOpen: boolean;
  settingsTab: 'appearance' | 'shortcuts' | 'environments' | 'task-board' | 'account';
  sidebarCollapsed: boolean;
  swarmDashboardOpen: boolean;
  activeSwarmId: string | null;
  swarmSessions: Array<{ swarmId: string; name: string }>;
  layoutPresetByWorkspace: Record<string, LayoutPresetId>;
  paneOrderByWorkspace: Record<string, PaneId[]>;
  unsavedByWorkspace: Record<string, boolean>;
  pendingCloseWorkspaceId: string | null;
  taskSearch: string;
  taskFilters: TaskFilterState;
  taskSort: TaskSortMode;
  updateStatus: UpdateStatus;
  taskFiltersOpen: boolean;
  terminalFindRequest: { paneId: PaneId; query: string; id: string } | null;
}

export interface WorkspaceStoreState {
  appState: AppState;
  loading: boolean;
  ui: UiState;
  initialize: () => Promise<void>;
  createWorkspace: (input: { name: string; rootDir: string; layoutPresetId?: string; templateId?: string; mode?: import('@shared/types').WorkspaceMode }) => Promise<void>;
  cloneWorkspace: (workspaceId: string, newName: string) => Promise<void>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  requestCloseWorkspace: (workspaceId: string) => Promise<void>;
  cancelCloseWorkspace: () => void;
  confirmCloseWorkspace: (mode: 'save' | 'continue') => Promise<void>;
  setActiveWorkspace: (workspaceId: string) => Promise<void>;
  importEnvironmentFromFile: (filePath: string) => Promise<void>;
  saveActiveWorkspace: () => Promise<void>;
  saveAsActiveWorkspace: () => Promise<void>;
  setActivePane: (paneId: PaneId) => Promise<void>;
  addPaneToLayout: () => Promise<void>;
  addBrowserPaneToLayout: (targetPaneId?: PaneId, url?: string) => Promise<void>;
  removePaneFromLayout: (paneId: PaneId) => Promise<boolean>;
  addBrowserTabToLayout: (workspaceId: string, paneId: PaneId, input?: { url?: string; title?: string }) => void;
  setActiveBrowserTab: (workspaceId: string, paneId: PaneId, tabId: string) => void;
  closeBrowserTab: (workspaceId: string, paneId: PaneId, tabId: string) => void;
  moveBrowserTabToLayout: (workspaceId: string, paneId: PaneId, sourceTabId: string, targetTabId: string) => void;
  moveBrowserTabToLayoutEnd: (workspaceId: string, paneId: PaneId, sourceTabId: string) => void;
  reorderPanes: (sourcePaneId: PaneId, targetPaneId: PaneId) => void;
  movePaneToIndex: (paneId: PaneId, toIndex: number) => void;
  syncPaneOrder: (workspaceId: string, paneIds: PaneId[]) => void;
  updateBrowserPane: (workspaceId: string, paneId: PaneId, patch: Partial<BrowserPaneState>) => void;
  setLayoutPreset: (presetId: LayoutPresetId) => Promise<void>;
  appendCommandBlock: (paneId: PaneId, block: CommandBlock) => Promise<void>;
  toggleCommandBlock: (paneId: PaneId, blockId: string) => Promise<void>;
  createTask: (input: {
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    startAt?: string;
    endAt?: string;
    dueAt?: string;
    labels?: string[];
    paneId?: PaneId;
  }) => Promise<void>;
  addTask: (title: string) => Promise<void>;
  updateTask: (taskId: string, patch: Partial<TaskItem>) => Promise<void>;
  moveTask: (taskId: string, status: TaskStatus, toIndex?: number) => Promise<void>;
  reorderTasks: (status: TaskStatus, orderedTaskIds: string[]) => Promise<void>;
  archiveTask: (taskId: string, archived?: boolean) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  setTaskSearch: (value: string) => void;
  setTaskFilters: (patch: Partial<TaskFilterState>) => void;
  setTaskSort: (mode: TaskSortMode) => void;
  clearTaskFilters: () => void;
  getVisibleTasks: (status?: TaskStatus) => TaskItem[];
  toggleTaskBoard: (open?: boolean) => void;
  toggleTaskFilters: (open?: boolean) => void;
  openStartPage: (mode?: UiState['startPageMode']) => void;
  closeStartPage: () => void;
  openCreateFlow: (mode?: UiState['createFlowMode']) => void;
  closeCreateFlow: () => void;
  openEnvironmentOverlay: () => void;
  closeEnvironmentOverlay: () => void;
  openSettings: (tab?: UiState['settingsTab']) => void;
  closeSettings: () => void;
  setSettingsTab: (tab: UiState['settingsTab']) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  requestTerminalFind: (query: string) => void;
  exportTasks: () => Promise<void>;
  archiveCompletedTasks: () => Promise<void>;
  openSwarmDashboard: (swarmId?: string) => void;
  closeSwarmDashboard: () => void;
  setActiveSwarmId: (swarmId: string | null) => void;
  openSwarmSession: (input: { swarmId: string; name: string }) => void;
  closeSwarmSession: (swarmId: string) => Promise<void>;
  setActiveSwarmSession: (swarmId: string) => void;
  setCanvasTransform: (wsId: import('@shared/types').WorkspaceId, transform: import('@shared/types').CanvasState['transform']) => void;
  setCanvasCard: (wsId: import('@shared/types').WorkspaceId, paneId: PaneId, rect: { x: number; y: number; w: number; h: number }) => void;
  removeCanvasCard: (wsId: import('@shared/types').WorkspaceId, paneId: PaneId) => void;
  setCanvasOptions: (
    wsId: import('@shared/types').WorkspaceId,
    options: { snapToGrid?: boolean; background?: 'dots' | 'grid' | 'blank' }
  ) => void;
}

export type StoreSet = StoreApi<WorkspaceStoreState>['setState'];
export type StoreGet = StoreApi<WorkspaceStoreState>['getState'];

export function markDirty(state: WorkspaceStoreState, workspaceId: string): UiState {
  return {
    ...state.ui,
    unsavedByWorkspace: {
      ...state.ui.unsavedByWorkspace,
      [workspaceId]: true
    }
  };
}

export function insertPaneAfter(order: PaneId[], sourcePaneId: PaneId, newPaneId: PaneId): PaneId[] {
  const withoutNew = order.filter((paneId) => paneId !== newPaneId);
  const sourceIndex = withoutNew.indexOf(sourcePaneId);
  if (sourceIndex < 0) {
    return [...withoutNew, newPaneId];
  }
  const next = [...withoutNew];
  next.splice(sourceIndex + 1, 0, newPaneId);
  return next;
}
