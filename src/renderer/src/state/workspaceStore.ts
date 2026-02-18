import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, CommandBlock, PaneId, TaskFilterState, TaskItem, TaskPriority, TaskSortMode, TaskStatus, WorkspaceState } from '@shared/types';
import {
  appendPaneToWorkspace,
  collectPaneIds,
  movePaneInOrder,
  removePaneFromWorkspace,
  syncPaneOrder as syncPaneOrderList
} from '@renderer/services/layoutEngine';
import type { LayoutPresetId } from '@renderer/services/layoutPresets';
import { useToastStore } from '@renderer/hooks/useToast';

interface UiState {
  commandPaletteOpen: boolean;
  taskBoardTabOpen: boolean;
  activeView: 'workspace' | 'task-board';
  agentPanelOpen: boolean;
  startPageOpen: boolean;
  startPageMode: 'home' | 'open';
  settingsOpen: boolean;
  layoutPresetByWorkspace: Record<string, LayoutPresetId>;
  paneOrderByWorkspace: Record<string, PaneId[]>;
  unsavedByWorkspace: Record<string, boolean>;
  pendingCloseWorkspaceId: string | null;
  taskSearch: string;
  taskFilters: TaskFilterState;
  taskSort: TaskSortMode;
}

interface WorkspaceStoreState {
  appState: AppState;
  loading: boolean;
  ui: UiState;
  initialize: () => Promise<void>;
  createWorkspace: (input: { name: string; rootDir: string; templateId?: string }) => Promise<void>;
  cloneWorkspace: (workspaceId: string, newName: string) => Promise<void>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  requestCloseWorkspace: (workspaceId: string) => Promise<void>;
  cancelCloseWorkspace: () => void;
  confirmCloseWorkspace: (mode: 'save' | 'continue') => Promise<void>;
  setActiveWorkspace: (workspaceId: string) => Promise<void>;
  saveActiveWorkspace: () => Promise<void>;
  saveAsActiveWorkspace: () => Promise<void>;
  setActivePane: (paneId: PaneId) => Promise<void>;
  addPaneToLayout: () => Promise<void>;
  removePaneFromLayout: (paneId: PaneId) => Promise<boolean>;
  reorderPanes: (sourcePaneId: PaneId, targetPaneId: PaneId) => void;
  syncPaneOrder: (workspaceId: string, paneIds: PaneId[]) => void;
  setLayoutPreset: (presetId: LayoutPresetId) => void;
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
  setAgentAttachment: (paneId: PaneId, attached: boolean, model?: string) => Promise<void>;
  setAgentRunning: (paneId: PaneId, running: boolean) => Promise<void>;
  setAgentOutput: (paneId: PaneId, output: WorkspaceState['paneAgents'][PaneId]['lastOutput']) => Promise<void>;
  toggleCommandPalette: (open?: boolean) => void;
  toggleTaskBoard: (open?: boolean) => void;
  toggleAgentPanel: (open?: boolean) => void;
  openStartPage: (mode?: UiState['startPageMode']) => void;
  closeStartPage: () => void;
  openSettings: () => void;
  closeSettings: () => void;
}

function activeWorkspace(state: WorkspaceStoreState): WorkspaceState | undefined {
  const id = state.appState.activeWorkspaceId;
  if (!id) {
    return undefined;
  }
  return state.appState.workspaces.find((w) => w.id === id);
}

function presetFromPaneCount(count: number): LayoutPresetId {
  if (count >= 16) return '16-pane-grid';
  if (count >= 12) return '12-pane-grid';
  if (count >= 8) return '8-pane-grid';
  if (count >= 6) return '6-pane-grid';
  if (count >= 4) return '4-pane-grid';
  if (count >= 3) return '3-pane-left-large';
  if (count >= 2) return '2-pane-vertical';
  return '1-pane';
}

function deriveUiMaps(
  workspaces: WorkspaceState[]
): Pick<UiState, 'layoutPresetByWorkspace' | 'paneOrderByWorkspace' | 'unsavedByWorkspace'> {
  const layoutPresetByWorkspace: Record<string, LayoutPresetId> = {};
  const paneOrderByWorkspace: Record<string, PaneId[]> = {};
  const unsavedByWorkspace: Record<string, boolean> = {};

  for (const workspace of workspaces) {
    const paneIds = collectPaneIds(workspace.layout);
    paneOrderByWorkspace[workspace.id] = paneIds;
    layoutPresetByWorkspace[workspace.id] = presetFromPaneCount(paneIds.length);
    unsavedByWorkspace[workspace.id] = false;
  }

  return { layoutPresetByWorkspace, paneOrderByWorkspace, unsavedByWorkspace };
}

function markDirty(state: WorkspaceStoreState, workspaceId: string): UiState {
  return {
    ...state.ui,
    unsavedByWorkspace: {
      ...state.ui.unsavedByWorkspace,
      [workspaceId]: true
    }
  };
}

const DEFAULT_TASK_PRIORITY: TaskPriority = 'medium';
const DEFAULT_TASK_SORT: TaskSortMode = 'updated-desc';
const DEFAULT_TASK_FILTERS: TaskFilterState = { archived: false };

function normalizeLabels(labels: string[] | undefined): string[] {
  if (!labels) {
    return [];
  }
  return labels.map((label) => label.trim()).filter(Boolean);
}

function priorityRank(priority: TaskPriority | undefined): number {
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

function nextOrder(tasks: TaskItem[], status: TaskStatus): number {
  const max = tasks
    .filter((task) => task.status === status)
    .reduce((acc, task) => Math.max(acc, task.order ?? 0), 0);
  return max + 1;
}

function normalizeTasks(tasks: TaskItem[]): TaskItem[] {
  const byStatus: Record<TaskStatus, TaskItem[]> = {
    backlog: [],
    'in-progress': [],
    done: []
  };
  for (const task of tasks) {
    byStatus[task.status].push({
      ...task,
      priority: task.priority ?? DEFAULT_TASK_PRIORITY,
      labels: normalizeLabels(task.labels),
      archived: task.archived ?? false,
      order: task.order ?? 0
    });
  }
  (Object.keys(byStatus) as TaskStatus[]).forEach((status) => {
    byStatus[status].sort((a, b) => {
      const byOrder = (a.order ?? 0) - (b.order ?? 0);
      if (byOrder !== 0) return byOrder;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    byStatus[status] = byStatus[status].map((task, index) => ({ ...task, order: index + 1 }));
  });
  return [...byStatus.backlog, ...byStatus['in-progress'], ...byStatus.done];
}

function matchesTaskFilters(task: TaskItem, search: string, filters: TaskFilterState): boolean {
  if ((filters.archived ?? false) !== (task.archived ?? false)) {
    return false;
  }
  if (filters.statuses && filters.statuses.length > 0 && !filters.statuses.includes(task.status)) {
    return false;
  }
  if (filters.priorities && filters.priorities.length > 0 && !filters.priorities.includes(task.priority ?? DEFAULT_TASK_PRIORITY)) {
    return false;
  }
  if (filters.attachedOnly && !task.paneId) {
    return false;
  }
  if (filters.labels && filters.labels.length > 0) {
    const labels = new Set(task.labels ?? []);
    if (!filters.labels.some((label) => labels.has(label))) {
      return false;
    }
  }
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [task.title, task.description, ...(task.labels ?? []), task.paneId ?? ''].join(' ').toLowerCase().includes(needle);
}

function sortTasks(tasks: TaskItem[], mode: TaskSortMode): TaskItem[] {
  const next = [...tasks];
  next.sort((a, b) => {
    const aDue = a.endAt ?? a.dueAt;
    const bDue = b.endAt ?? b.dueAt;
    if (mode === 'updated-desc') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (mode === 'updated-asc') return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    if (mode === 'created-desc') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (mode === 'created-asc') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (mode === 'priority-desc') return priorityRank(b.priority) - priorityRank(a.priority);
    if (mode === 'priority-asc') return priorityRank(a.priority) - priorityRank(b.priority);
    if (mode === 'due-asc') return (aDue ? new Date(aDue).getTime() : Number.MAX_SAFE_INTEGER) - (bDue ? new Date(bDue).getTime() : Number.MAX_SAFE_INTEGER);
    return (bDue ? new Date(bDue).getTime() : Number.MIN_SAFE_INTEGER) - (aDue ? new Date(aDue).getTime() : Number.MIN_SAFE_INTEGER);
  });
  return next;
}

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  appState: {
    activeWorkspaceId: null,
    workspaces: []
  },
  loading: true,
  ui: {
    commandPaletteOpen: false,
    taskBoardTabOpen: false,
    activeView: 'workspace',
    agentPanelOpen: false,
    startPageOpen: true,
    startPageMode: 'home',
    settingsOpen: false,
    layoutPresetByWorkspace: {},
    paneOrderByWorkspace: {},
    unsavedByWorkspace: {},
    pendingCloseWorkspaceId: null,
    taskSearch: '',
    taskFilters: DEFAULT_TASK_FILTERS,
    taskSort: DEFAULT_TASK_SORT
  },
  initialize: async () => {
    try {
      const state = await window.vibeAde.workspace.list();
      const normalizedWorkspaces = state.workspaces.map((workspace) => ({
        ...workspace,
        tasks: normalizeTasks(workspace.tasks)
      }));
      const maps = deriveUiMaps(state.workspaces);
      set((store) => ({
        appState: {
          ...state,
          workspaces: normalizedWorkspaces
        },
        loading: false,
        ui: {
          ...store.ui,
          ...maps
        }
      }));
    } catch (error) {
      console.error('Failed to initialize workspace:', error);
      useToastStore.getState().addToast('error', 'Failed to load workspaces');
      set({ loading: false });
    }
  },
  createWorkspace: async (input) => {
    try {
      const created = await window.vibeAde.workspace.create(input);
      const paneIds = collectPaneIds(created.layout);
      set((state) => ({
        appState: {
          activeWorkspaceId: created.id,
          workspaces: [...state.appState.workspaces, created]
        },
        ui: {
          ...state.ui,
          startPageOpen: false,
          startPageMode: 'home',
          layoutPresetByWorkspace: {
            ...state.ui.layoutPresetByWorkspace,
            [created.id]: presetFromPaneCount(paneIds.length)
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
      useToastStore.getState().addToast('error', 'Failed to create environment');
      throw error;
    }
  },
  cloneWorkspace: async (workspaceId, newName) => {
    const cloned = await window.vibeAde.workspace.clone(workspaceId, newName);
    const paneIds = collectPaneIds(cloned.layout);
    set((state) => ({
      appState: {
        activeWorkspaceId: cloned.id,
        workspaces: [...state.appState.workspaces, cloned]
      },
      ui: {
        ...state.ui,
        startPageOpen: false,
        startPageMode: 'home',
        layoutPresetByWorkspace: {
          ...state.ui.layoutPresetByWorkspace,
          [cloned.id]: presetFromPaneCount(paneIds.length)
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
      useToastStore.getState().addToast('error', 'Failed to delete environment');
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
  saveActiveWorkspace: async () => {
    const workspace = activeWorkspace(get());
    if (!workspace) {
      return;
    }
    try {
      await window.vibeAde.workspace.save(workspace);
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
    const workspace = activeWorkspace(get());
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

    await window.vibeAde.workspace.save(nextWorkspace);

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
  },
  setActivePane: async (paneId) => {
    const current = activeWorkspace(get());
    if (!current) {
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
    const current = activeWorkspace(get());
    if (!current) {
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
        workspaces: state.appState.workspaces.map((w) => (w.id === next.id ? next : w))
      },
      ui: {
        ...markDirty(state, next.id),
        paneOrderByWorkspace: {
          ...state.ui.paneOrderByWorkspace,
          [next.id]: syncPaneOrderList(state.ui.paneOrderByWorkspace[next.id] ?? [], paneIds)
        }
      }
    }));
  },
  removePaneFromLayout: async (paneId) => {
    const current = activeWorkspace(get());
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
        workspaces: state.appState.workspaces.map((w) => (w.id === next.id ? next : w))
      },
      ui: {
        ...markDirty(state, next.id),
        layoutPresetByWorkspace: {
          ...state.ui.layoutPresetByWorkspace,
          [next.id]: presetFromPaneCount(paneIds.length)
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
  setLayoutPreset: (presetId) => {
    const workspaceId = get().appState.activeWorkspaceId;
    if (!workspaceId) {
      return;
    }
    set((state) => ({
      ui: {
        ...markDirty(state, workspaceId),
        layoutPresetByWorkspace: {
          ...state.ui.layoutPresetByWorkspace,
          [workspaceId]: presetId
        }
      }
    }));
  },
  appendCommandBlock: async (paneId, block) => {
    const current = activeWorkspace(get());
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
    const current = activeWorkspace(get());
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
  },
  createTask: async (input) => {
    const current = activeWorkspace(get());
    if (!current) {
      return;
    }
    const title = input.title.trim();
    if (!title) {
      return;
    }
    const now = new Date().toISOString();
    const nextTask: TaskItem = {
      id: uuidv4(),
      title,
      description: input.description ?? '',
      status: input.status ?? 'backlog',
      priority: input.priority ?? DEFAULT_TASK_PRIORITY,
      startAt: input.startAt,
      endAt: input.endAt,
      dueAt: input.endAt ?? input.dueAt,
      labels: normalizeLabels(input.labels),
      archived: false,
      order: nextOrder(current.tasks, input.status ?? 'backlog'),
      paneId: input.paneId,
      createdAt: now,
      updatedAt: now
    };
    const next = {
      ...current,
      tasks: normalizeTasks([...current.tasks, nextTask])
    };
    set((state) => ({
      appState: {
        ...state.appState,
        workspaces: state.appState.workspaces.map((w) => (w.id === next.id ? next : w))
      },
      ui: markDirty(state, next.id)
    }));
  },
  addTask: async (title) => {
    const today = new Date();
    const startAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).toISOString();
    const endAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();
    await get().createTask({ title, startAt, endAt });
  },
  updateTask: async (taskId, patch) => {
    const current = activeWorkspace(get());
    if (!current) {
      return;
    }
    const now = new Date().toISOString();
    const next = {
      ...current,
      tasks: normalizeTasks(
        current.tasks.map((task) => {
          if (task.id !== taskId) {
            return task;
          }
          const nextStatus = patch.status ?? task.status;
          const movedStatus = nextStatus !== task.status;
          return {
            ...task,
            ...patch,
            title: patch.title !== undefined ? patch.title : task.title,
            labels: patch.labels !== undefined ? normalizeLabels(patch.labels) : task.labels,
            priority: patch.priority ?? task.priority ?? DEFAULT_TASK_PRIORITY,
            status: nextStatus,
            order: patch.order ?? (movedStatus ? nextOrder(current.tasks, nextStatus) : task.order),
            updatedAt: now
          };
        })
      )
    };
    set((state) => ({
      appState: {
        ...state.appState,
        workspaces: state.appState.workspaces.map((w) => (w.id === next.id ? next : w))
      },
      ui: markDirty(state, next.id)
    }));
  },
  moveTask: async (taskId, status, toIndex) => {
    const current = activeWorkspace(get());
    if (!current) {
      return;
    }
    const now = new Date().toISOString();
    const updated = current.tasks.map((task) =>
      task.id === taskId
        ? {
          ...task,
          status,
          order: nextOrder(current.tasks, status),
          updatedAt: now
        }
        : task
    );
    const normalized = normalizeTasks(updated);
    const next = {
      ...current,
      tasks: normalized
    };
    set((state) => ({
      appState: {
        ...state.appState,
        workspaces: state.appState.workspaces.map((w) => (w.id === next.id ? next : w))
      },
      ui: markDirty(state, next.id)
    }));

    if (typeof toIndex === 'number') {
      const movedIdList = normalized
        .filter((task) => task.status === status)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((task) => task.id);
      const fromIndex = movedIdList.indexOf(taskId);
      if (fromIndex !== -1) {
        movedIdList.splice(fromIndex, 1);
        const clamped = Math.max(0, Math.min(toIndex, movedIdList.length));
        movedIdList.splice(clamped, 0, taskId);
        await get().reorderTasks(status, movedIdList);
      }
    }
  },
  reorderTasks: async (status, orderedTaskIds) => {
    const current = activeWorkspace(get());
    if (!current) {
      return;
    }
    const rank = new Map<string, number>();
    orderedTaskIds.forEach((taskId, index) => rank.set(taskId, index + 1));

    let fallbackIndex = orderedTaskIds.length;
    const reordered = current.tasks.map((task) => {
      if (task.status !== status) {
        return task;
      }
      const forced = rank.get(task.id);
      if (forced) {
        return { ...task, order: forced };
      }
      fallbackIndex += 1;
      return { ...task, order: fallbackIndex };
    });

    const next = {
      ...current,
      tasks: normalizeTasks(reordered)
    };

    set((state) => ({
      appState: {
        ...state.appState,
        workspaces: state.appState.workspaces.map((w) => (w.id === next.id ? next : w))
      },
      ui: markDirty(state, next.id)
    }));
  },
  archiveTask: async (taskId, archived = true) => {
    await get().updateTask(taskId, { archived });
  },
  deleteTask: async (taskId) => {
    const current = activeWorkspace(get());
    if (!current) {
      return;
    }
    const next = {
      ...current,
      tasks: normalizeTasks(current.tasks.filter((task) => task.id !== taskId))
    };
    set((state) => ({
      appState: {
        ...state.appState,
        workspaces: state.appState.workspaces.map((w) => (w.id === next.id ? next : w))
      },
      ui: markDirty(state, next.id)
    }));
  },
  setTaskSearch: (value) => {
    set((state) => ({
      ui: {
        ...state.ui,
        taskSearch: value
      }
    }));
  },
  setTaskFilters: (patch) => {
    set((state) => ({
      ui: {
        ...state.ui,
        taskFilters: {
          ...state.ui.taskFilters,
          ...patch
        }
      }
    }));
  },
  setTaskSort: (mode) => {
    set((state) => ({
      ui: {
        ...state.ui,
        taskSort: mode
      }
    }));
  },
  clearTaskFilters: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        taskSearch: '',
        taskFilters: DEFAULT_TASK_FILTERS,
        taskSort: DEFAULT_TASK_SORT
      }
    }));
  },
  getVisibleTasks: (status) => {
    const state = get();
    const workspace = activeWorkspace(state);
    if (!workspace) {
      return [];
    }
    const filtered = workspace.tasks.filter((task) => matchesTaskFilters(task, state.ui.taskSearch, state.ui.taskFilters));
    const scoped = status ? filtered.filter((task) => task.status === status) : filtered;
    return sortTasks(scoped, state.ui.taskSort);
  },
  setAgentAttachment: async (paneId, attached, model) => {
    const current = activeWorkspace(get());
    if (!current) {
      return;
    }
    const currentPaneState = current.paneAgents[paneId] ?? {
      paneId,
      attached: false,
      model: current.selectedModel,
      running: false
    };
    const next = {
      ...current,
      paneAgents: {
        ...current.paneAgents,
        [paneId]: {
          ...currentPaneState,
          attached,
          model: model ?? currentPaneState.model
        }
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
  setAgentRunning: async (paneId, running) => {
    const current = activeWorkspace(get());
    if (!current) {
      return;
    }
    const paneState = current.paneAgents[paneId];
    if (!paneState) {
      return;
    }
    const next = {
      ...current,
      paneAgents: {
        ...current.paneAgents,
        [paneId]: {
          ...paneState,
          running
        }
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
  setAgentOutput: async (paneId, output) => {
    const current = activeWorkspace(get());
    if (!current) {
      return;
    }
    const paneState = current.paneAgents[paneId];
    if (!paneState) {
      return;
    }
    const next = {
      ...current,
      paneAgents: {
        ...current.paneAgents,
        [paneId]: {
          ...paneState,
          lastOutput: output,
          running: false
        }
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
  toggleCommandPalette: (open) => {
    set((state) => ({
      ui: {
        ...state.ui,
        commandPaletteOpen: open ?? !state.ui.commandPaletteOpen
      }
    }));
  },
  toggleTaskBoard: (open) => {
    set((state) => ({
      ui: {
        ...state.ui,
        taskBoardTabOpen: open ?? !state.ui.taskBoardTabOpen,
        activeView:
          (open ?? !state.ui.taskBoardTabOpen)
            ? 'task-board'
            : 'workspace'
      }
    }));
  },
  toggleAgentPanel: (open) => {
    set((state) => ({
      ui: {
        ...state.ui,
        agentPanelOpen: open ?? !state.ui.agentPanelOpen
      }
    }));
  },
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
  openSettings: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        settingsOpen: true
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
  }
}));
