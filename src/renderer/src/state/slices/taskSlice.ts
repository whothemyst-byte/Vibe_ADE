import { v4 as uuidv4 } from 'uuid';
import type { TaskItem } from '@shared/types';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import { activeWorkspace } from '../helpers/workspace';
import {
  DEFAULT_TASK_FILTERS,
  DEFAULT_TASK_PRIORITY,
  DEFAULT_TASK_SORT,
  matchesTaskFilters,
  nextOrder,
  normalizeLabels,
  normalizeTasks,
  sortTasks
} from '../helpers/tasks';
import { markDirty, type StoreGet, type StoreSet, type WorkspaceStoreState } from '../storeTypes';

type TaskSlice = Pick<
  WorkspaceStoreState,
  | 'createTask'
  | 'addTask'
  | 'updateTask'
  | 'moveTask'
  | 'reorderTasks'
  | 'archiveTask'
  | 'deleteTask'
  | 'setTaskSearch'
  | 'setTaskFilters'
  | 'setTaskSort'
  | 'clearTaskFilters'
  | 'getVisibleTasks'
  | 'toggleTaskBoard'
  | 'toggleTaskFilters'
  | 'exportTasks'
  | 'archiveCompletedTasks'
>;

export function createTaskSlice(set: StoreSet, get: StoreGet): TaskSlice {
  return {
    createTask: async (input) => {
      const current = activeWorkspace(get().appState);
      if (!current) {
        return;
      }
      const normalizedSub = normalizeSubscriptionState(get().appState.subscription);
      const plan = SUBSCRIPTION_PLANS[normalizedSub.tier];
      if (!plan.features.taskBoard) {
        useToastStore.getState().addToast('info', 'Task Board is available on Flux and Forge plans.');
        return;
      }
      const limit = plan.limits.taskBoardTasksPerMonth;
      if (limit !== null && normalizedSub.usage.tasksCreated >= limit) {
        useToastStore.getState().addToast('info', `Flux plan limit reached (${limit} tasks/month). Upgrade to Forge for unlimited tasks.`);
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
          workspaces: state.appState.workspaces.map((w) => (w.id === next.id ? next : w)),
          subscription: {
            ...normalizedSub,
            usage: {
              ...normalizedSub.usage,
              tasksCreated: normalizedSub.usage.tasksCreated + 1
            }
          }
        },
        ui: markDirty(state, next.id)
      }));
      void window.vibeAde.workspace.updateSubscription({
        ...normalizedSub,
        usage: {
          ...normalizedSub.usage,
          tasksCreated: normalizedSub.usage.tasksCreated + 1
        }
      });
      void window.vibeAde.billing.recordUsage('task', 1);
    },
    addTask: async (title) => {
      const today = new Date();
      const startAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0).toISOString();
      const endAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();
      await get().createTask({ title, startAt, endAt });
    },
    updateTask: async (taskId, patch) => {
      const current = activeWorkspace(get().appState);
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
      const current = activeWorkspace(get().appState);
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
      const current = activeWorkspace(get().appState);
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
      const current = activeWorkspace(get().appState);
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
      const workspace = activeWorkspace(state.appState);
      if (!workspace) {
        return [];
      }
      const filtered = workspace.tasks.filter((task) => matchesTaskFilters(task, state.ui.taskSearch, state.ui.taskFilters));
      const scoped = status ? filtered.filter((task) => task.status === status) : filtered;
      return sortTasks(scoped, state.ui.taskSort);
    },
    toggleTaskBoard: (open) => {
      const normalizedSub = normalizeSubscriptionState(get().appState.subscription);
      const plan = SUBSCRIPTION_PLANS[normalizedSub.tier];
      if (!plan.features.taskBoard) {
        useToastStore.getState().addToast('info', 'Task Board is available on Flux and Forge plans.');
        return;
      }
      set((state) => ({
        appState: normalizedSub !== state.appState.subscription ? { ...state.appState, subscription: normalizedSub } : state.appState,
        ui: {
          ...state.ui,
          taskBoardTabOpen: open ?? !state.ui.taskBoardTabOpen,
          activeView:
            (open ?? !state.ui.taskBoardTabOpen)
              ? 'task-board'
              : 'workspace'
        }
      }));
      if (normalizedSub !== get().appState.subscription) {
        void window.vibeAde.workspace.updateSubscription(normalizedSub);
      }
    },
    toggleTaskFilters: (open) => {
      set((state) => ({
        ui: {
          ...state.ui,
          taskFiltersOpen: open ?? !state.ui.taskFiltersOpen
        }
      }));
    },
    exportTasks: async () => {
      const workspace = activeWorkspace(get().appState);
      if (!workspace) {
        return;
      }
      const directory = await window.vibeAde.system.selectDirectory();
      if (!directory) {
        return;
      }
      await window.vibeAde.task.export(workspace.id, directory);
      useToastStore.getState().addToast('success', 'Tasks exported');
    },
    archiveCompletedTasks: async () => {
      const workspace = activeWorkspace(get().appState);
      if (!workspace) {
        return;
      }
      const doneTasks = workspace.tasks.filter((task) => task.status === 'done' && !task.archived);
      if (doneTasks.length === 0) {
        useToastStore.getState().addToast('info', 'No completed tasks to archive.');
        return;
      }
      for (const task of doneTasks) {
        await get().archiveTask(task.id, true);
      }
      useToastStore.getState().addToast('success', 'Completed tasks archived.');
    }
  };
}
