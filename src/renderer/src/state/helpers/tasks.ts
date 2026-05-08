import type { TaskFilterState, TaskItem, TaskPriority, TaskSortMode, TaskStatus } from '@shared/types';

export const DEFAULT_TASK_PRIORITY: TaskPriority = 'medium';
export const DEFAULT_TASK_SORT: TaskSortMode = 'updated-desc';
export const DEFAULT_TASK_FILTERS: TaskFilterState = { archived: false };

export function normalizeLabels(labels: string[] | undefined): string[] {
  if (!labels) {
    return [];
  }
  return labels.map((label) => label.trim()).filter(Boolean);
}

export function priorityRank(priority: TaskPriority | undefined): number {
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  return 1;
}

export function nextOrder(tasks: TaskItem[], status: TaskStatus): number {
  const max = tasks
    .filter((task) => task.status === status)
    .reduce((acc, task) => Math.max(acc, task.order ?? 0), 0);
  return max + 1;
}

export function normalizeTasks(tasks: TaskItem[]): TaskItem[] {
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

export function matchesTaskFilters(task: TaskItem, search: string, filters: TaskFilterState): boolean {
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

export function sortTasks(tasks: TaskItem[], mode: TaskSortMode): TaskItem[] {
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
