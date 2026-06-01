import { useEffect, useMemo, useState } from 'react';
import type { TaskItem, TaskPriority, TaskSortMode, TaskStatus, WorkspaceState } from '@shared/types';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import {
  loadUiPreferences,
  UI_PREFERENCES_CHANGED_EVENT,
  UI_PREFERENCES_KEY
} from '@renderer/services/preferences';
import { Button, Input, Icon, cn } from './ui';

interface TaskBoardProps {
  workspace: WorkspaceState;
}

const COLUMNS: { key: TaskStatus; label: string; accentBar: string; badge: string }[] = [
  { key: 'backlog', label: 'Backlog', accentBar: 'bg-fg-muted/40', badge: 'text-fg-muted bg-bg-panel border-line' },
  { key: 'in-progress', label: 'In Progress', accentBar: 'bg-primary/60', badge: 'text-primary bg-primary/10 border-primary/30' },
  { key: 'review', label: 'Review', accentBar: 'bg-warn/60', badge: 'text-warn bg-warn/10 border-warn/30' },
  { key: 'done', label: 'Done', accentBar: 'bg-success/60', badge: 'text-success bg-success/10 border-success/30' }
];

const EMPTY_COPY: Record<TaskStatus, string> = {
  backlog: 'Nothing in backlog — add one to get started.',
  'in-progress': 'Nothing in flight — pull one from backlog.',
  review: 'Nothing waiting on review.',
  done: 'Nothing done yet — finish something.'
};

const PRIORITY_OPTIONS: TaskPriority[] = ['low', 'medium', 'high'];

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: 'bg-bg-panel-2 text-fg-muted border-line',
  medium: 'bg-primary/10 text-primary border-primary/30',
  high: 'bg-danger/10 text-danger border-danger/30'
};

const SORT_OPTIONS: Array<{ value: TaskSortMode; label: string }> = [
  { value: 'updated-desc', label: 'Updated (Newest)' },
  { value: 'updated-asc', label: 'Updated (Oldest)' },
  { value: 'created-desc', label: 'Created (Newest)' },
  { value: 'created-asc', label: 'Created (Oldest)' },
  { value: 'priority-desc', label: 'Priority (High to Low)' },
  { value: 'priority-asc', label: 'Priority (Low to High)' },
  { value: 'due-asc', label: 'Due (Soonest)' },
  { value: 'due-desc', label: 'Due (Latest)' }
];

function nextStatus(status: TaskStatus): TaskStatus {
  if (status === 'backlog') return 'in-progress';
  if (status === 'in-progress') return 'review';
  if (status === 'review') return 'done';
  return 'backlog';
}

function statusActionLabel(status: TaskStatus): string {
  if (status === 'backlog') return 'Start';
  if (status === 'in-progress') return 'Review';
  if (status === 'review') return 'Done';
  return 'Reopen';
}

function statusActionIcon(status: TaskStatus): string {
  if (status === 'backlog') return 'play_arrow';
  if (status === 'in-progress') return 'rate_review';
  if (status === 'review') return 'check';
  return 'restart_alt';
}

function toIsoDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function dueState(dueAt: string | undefined): 'overdue' | 'today' | 'upcoming' | null {
  if (!dueAt) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  if (dueDay < today) return 'overdue';
  if (dueDay === today) return 'today';
  return 'upcoming';
}

const DUE_STYLES = {
  overdue: 'text-danger',
  today: 'text-warn',
  upcoming: 'text-fg-muted'
} as const;

export function TaskBoard({ workspace }: TaskBoardProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [labelsInput, setLabelsInput] = useState('');
  const [draggedTask, setDraggedTask] = useState<TaskItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [compactMode, setCompactMode] = useState<boolean>(() => {
    try {
      return loadUiPreferences().taskBoardCompactMode;
    } catch {
      return false;
    }
  });
  const filtersOpen = useWorkspaceStore((s) => s.ui.taskFiltersOpen);
  const toggleTaskFilters = useWorkspaceStore((s) => s.toggleTaskFilters);
  const [draftStatus, setDraftStatus] = useState<TaskStatus>('backlog');

  const createTask = useWorkspaceStore((s) => s.createTask);
  const moveTask = useWorkspaceStore((s) => s.moveTask);
  const reorderTasks = useWorkspaceStore((s) => s.reorderTasks);
  const deleteTask = useWorkspaceStore((s) => s.deleteTask);
  const archiveTask = useWorkspaceStore((s) => s.archiveTask);
  const updateTask = useWorkspaceStore((s) => s.updateTask);
  const setTaskSearch = useWorkspaceStore((s) => s.setTaskSearch);
  const setTaskFilters = useWorkspaceStore((s) => s.setTaskFilters);
  const setTaskSort = useWorkspaceStore((s) => s.setTaskSort);
  const clearTaskFilters = useWorkspaceStore((s) => s.clearTaskFilters);
  const getVisibleTasks = useWorkspaceStore((s) => s.getVisibleTasks);
  const taskSearch = useWorkspaceStore((s) => s.ui.taskSearch);
  const taskFilters = useWorkspaceStore((s) => s.ui.taskFilters);
  const taskSort = useWorkspaceStore((s) => s.ui.taskSort);

  const grouped = useMemo(
    () =>
      COLUMNS.map((column) => ({
        ...column,
        tasks: getVisibleTasks(column.key)
      })),
    [getVisibleTasks, taskFilters, taskSearch, taskSort, workspace.tasks]
  );

  useEffect(() => {
    const sync = (): void => {
      try {
        setCompactMode(loadUiPreferences().taskBoardCompactMode);
      } catch {
        setCompactMode(false);
      }
    };
    const onStorage = (event: StorageEvent): void => {
      if (event.key === UI_PREFERENCES_KEY) {
        sync();
      }
    };
    window.addEventListener(UI_PREFERENCES_CHANGED_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(UI_PREFERENCES_CHANGED_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const canCreate = Boolean(title.trim() && startDate && endDate) && endDate >= startDate;
  const columnBodyClass = compactMode ? 'p-2 space-y-1.5' : 'p-3 space-y-2.5';
  const cardPadClass = compactMode ? 'p-2' : 'p-3';
  const cardTitleClass = compactMode ? 'text-[11px]' : 'text-xs';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-page">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-line bg-bg-panel">
        <div className="flex-1 max-w-md">
          <Input
            value={taskSearch}
            onChange={(event) => setTaskSearch(event.target.value)}
            placeholder="Search tasks..."
            leftIcon={<Icon name="search" size="sm" />}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" leftIcon={<Icon name="tune" size="sm" />} onClick={() => toggleTaskFilters()}>
            Filters
          </Button>
          <Button variant="primary" leftIcon={<Icon name="add" size="sm" />} onClick={() => setCreateOpen(true)} glow>
            New Task
          </Button>
        </div>
      </div>

      <div className={cn('flex-1 flex min-h-0', filtersOpen && 'pr-0')}>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 p-2 overflow-auto">
          {grouped.map((column) => (
            <section
              key={column.key}
              className="flex flex-col bg-bg-panel border border-line rounded-sm overflow-hidden min-h-[220px]"
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedTask) void moveTask(draggedTask.id, column.key);
                setDraggedTask(null);
              }}
            >
              <div className="flex items-center justify-between px-2 h-7 bg-bg-panel-2">
                <h4 className="flex items-center gap-1.5 text-xs font-medium text-fg">
                  {column.label}
                  <span
                    className={cn(
                      'inline-flex items-center justify-center min-w-[16px] h-3.5 px-1 rounded-sm text-[10px] font-semibold border',
                      column.badge
                    )}
                  >
                    {column.tasks.length}
                  </span>
                </h4>
                <button
                  type="button"
                  className="h-7 w-7 grid place-items-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-panel-2 transition-colors"
                  title={`Add task to ${column.label}`}
                  onClick={() => {
                    setDraftStatus(column.key);
                    setCreateOpen(true);
                  }}
                >
                  <Icon name="add" size="sm" />
                </button>
              </div>
              <div className={cn('h-0.5 w-full', column.accentBar)} aria-hidden="true" />

              <div className={cn('flex-1 overflow-y-auto', columnBodyClass)}>
                {column.tasks.length === 0 && (
                  <p
                    role="status"
                    className="mx-0.5 my-1 px-3 py-4 text-center text-[11px] leading-relaxed text-fg-muted border border-dashed border-line/70 rounded-lg"
                  >
                    {EMPTY_COPY[column.key]}
                  </p>
                )}
                {column.tasks.map((task, index) => {
                  const dueAt = task.endAt ?? task.dueAt;
                  const progressWidth =
                    task.status === 'done' ? 100 :
                    task.status === 'review' ? 85 :
                    task.status === 'in-progress' ? 50 :
                    0;
                  const showProgress = task.status === 'in-progress' || task.status === 'review';
                  const state = dueState(dueAt);
                  return (
                    <article
                      key={task.id}
                      className={cn(
                        'group rounded-lg border transition-all cursor-grab active:cursor-grabbing',
                        cardPadClass,
                        'border-line bg-bg-panel-2/50 hover:border-line-strong hover:bg-bg-panel-2',
                        task.archived && 'opacity-60'
                      )}
                      draggable
                      onDragStart={() => setDraggedTask(task)}
                      onDragEnd={() => setDraggedTask(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (!draggedTask || draggedTask.id === task.id) return;
                        if (draggedTask.status === column.key) {
                          const orderedIds = column.tasks.map((item) => item.id).filter((id) => id !== draggedTask.id);
                          orderedIds.splice(index, 0, draggedTask.id);
                          void reorderTasks(column.key, orderedIds);
                        } else {
                          void moveTask(draggedTask.id, column.key, index);
                        }
                        setDraggedTask(null);
                      }}
                    >
                      <p className={cn('font-medium text-fg leading-snug', cardTitleClass)}>{task.title}</p>
                      {task.description && (
                        <div className="mt-1 text-[11px] text-fg-muted leading-relaxed line-clamp-2">
                          {task.description}
                        </div>
                      )}
                      {showProgress && (
                        <div className="mt-2 h-1 bg-bg-panel rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full transition-all',
                              task.status === 'review'
                                ? 'bg-gradient-to-r from-warn to-warn/70'
                                : 'bg-gradient-to-r from-primary to-primary/70'
                            )}
                            style={{ width: `${progressWidth}%` }}
                          />
                        </div>
                      )}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded-md border font-semibold uppercase tracking-wider',
                            PRIORITY_STYLES[task.priority ?? 'medium']
                          )}
                        >
                          {task.priority ?? 'medium'}
                        </span>
                        {task.startAt && (
                          <span className="text-fg-muted">Start: {new Date(task.startAt).toLocaleDateString()}</span>
                        )}
                        {dueAt && (
                          <span className={cn('font-medium', state ? DUE_STYLES[state] : 'text-fg-muted')}>
                            End: {new Date(dueAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {task.labels && task.labels.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {task.labels.map((label) => (
                            <span
                              key={`${task.id}-${label}`}
                              className="px-1.5 py-0.5 rounded-md bg-bg-panel border border-line text-[10px] text-fg-muted"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-2.5 pt-2.5 border-t border-line flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <IconAction
                          icon={statusActionIcon(task.status)}
                          label={statusActionLabel(task.status)}
                          onClick={() => void updateTask(task.id, { status: nextStatus(task.status) })}
                        />
                        <IconAction
                          icon="attach_file"
                          label="Attach to active pane"
                          onClick={() => void updateTask(task.id, { paneId: workspace.activePaneId })}
                        />
                        <IconAction
                          icon={task.archived ? 'unarchive' : 'archive'}
                          label={task.archived ? 'Unarchive' : 'Archive'}
                          onClick={() => void archiveTask(task.id, !(task.archived ?? false))}
                        />
                        <IconAction
                          icon="delete"
                          label="Delete"
                          danger
                          onClick={() => void deleteTask(task.id)}
                        />
                        <div className="ml-auto text-[10px] text-fg-muted">
                          {task.paneId ? `Pane ${task.paneId.slice(0, 4)}` : 'Unattached'}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {filtersOpen && (
          <aside className="w-60 shrink-0 border-l border-line bg-bg-panel p-2.5 overflow-y-auto">
            <header className="flex items-center justify-between mb-4">
              <strong className="text-xs font-semibold text-fg">Filters</strong>
              <button
                type="button"
                className="h-7 w-7 grid place-items-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-panel-2 transition-colors"
                onClick={() => toggleTaskFilters(false)}
              >
                <Icon name="close" size="sm" />
              </button>
            </header>
            <div className="space-y-4">
              <SelectField label="Sort" value={taskSort} onChange={(v) => setTaskSort(v as TaskSortMode)}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className="bg-bg-panel">
                    {option.label}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Priority"
                value={taskFilters.priorities?.[0] ?? ''}
                onChange={(v) =>
                  setTaskFilters({
                    priorities: v ? [v as TaskPriority] : undefined
                  })
                }
              >
                <option value="" className="bg-bg-panel">
                  All Priorities
                </option>
                {PRIORITY_OPTIONS.map((value) => (
                  <option key={value} value={value} className="bg-bg-panel">
                    {value}
                  </option>
                ))}
              </SelectField>
              <label className="flex items-center gap-2 text-xs text-fg cursor-pointer">
                <input
                  type="checkbox"
                  checked={taskFilters.attachedOnly ?? false}
                  onChange={(event) => setTaskFilters({ attachedOnly: event.target.checked || undefined })}
                  className="accent-primary"
                />
                <span>Attached only</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-fg cursor-pointer">
                <input
                  type="checkbox"
                  checked={taskFilters.archived ?? false}
                  onChange={(event) => setTaskFilters({ archived: event.target.checked })}
                  className="accent-primary"
                />
                <span>Show archived</span>
              </label>
              <Button variant="ghost" size="sm" className="w-full" onClick={clearTaskFilters}>
                Reset Filters
              </Button>
            </div>
          </aside>
        )}
      </div>

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setCreateOpen(false)}
        >
          <section
            className="w-full max-w-md bg-bg-panel border border-line rounded shadow-premium overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="px-3 py-2.5 flex items-center justify-between border-b border-line">
              <h3 className="text-sm font-semibold tracking-tight text-fg">Create Task</h3>
              <button
                type="button"
                className="h-7 w-7 grid place-items-center rounded-md text-fg-muted hover:text-fg hover:bg-bg-panel-2 transition-colors"
                onClick={() => setCreateOpen(false)}
              >
                <Icon name="close" size="sm" />
              </button>
            </header>
            <div className="p-3 space-y-2">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Task title"
                leftIcon={<Icon name="title" size="sm" />}
              />
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Description (optional)"
              />
              <SelectField label="Priority" value={priority} onChange={(v) => setPriority(v as TaskPriority)}>
                {PRIORITY_OPTIONS.map((value) => (
                  <option key={value} value={value} className="bg-bg-panel">
                    {value}
                  </option>
                ))}
              </SelectField>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Start date *</span>
                  <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">End date *</span>
                  <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </label>
              </div>
              <Input
                value={labelsInput}
                onChange={(event) => setLabelsInput(event.target.value)}
                placeholder="labels: bug, api, ux"
                leftIcon={<Icon name="sell" size="sm" />}
              />
              {startDate && endDate && endDate < startDate && (
                <small className="text-[11px] text-danger flex items-center gap-1">
                  <Icon name="error_outline" size="xs" /> End date must be on or after start date.
                </small>
              )}
            </div>
            <footer className="px-3 py-2 border-t border-line bg-bg-panel-2/40 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!canCreate}
                leftIcon={<Icon name="add" size="sm" />}
                glow
                onClick={() => {
                  if (!canCreate) return;
                  const labels = labelsInput
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean);
                  void createTask({
                    title: title.trim(),
                    description: description.trim(),
                    status: draftStatus,
                    priority,
                    startAt: toIsoDate(startDate),
                    endAt: toIsoDate(endDate),
                    labels
                  });
                  setTitle('');
                  setDescription('');
                  setStartDate('');
                  setEndDate('');
                  setLabelsInput('');
                  setPriority('medium');
                  setDraftStatus('backlog');
                  setCreateOpen(false);
                }}
              >
                Add Task
              </Button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function IconAction({
  icon,
  label,
  onClick,
  danger
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}): JSX.Element {
  return (
    <button
      className={cn(
        'h-6 w-6 grid place-items-center rounded-md transition-colors',
        danger
          ? 'text-fg-muted hover:text-danger hover:bg-danger/10'
          : 'text-fg-muted hover:text-fg hover:bg-bg-panel-2'
      )}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <Icon name={icon} size="xs" />
    </button>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full h-7 px-2 rounded-lg border border-line bg-bg-panel-2/50 text-xs text-fg focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
      >
        {children}
      </select>
    </label>
  );
}
