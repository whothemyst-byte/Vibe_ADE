import { useState } from 'react';
import type { TaskItem, TaskPriority, TaskSortMode, TaskStatus, WorkspaceState } from '@shared/types';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';

interface TaskBoardProps {
  workspace: WorkspaceState;
}

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'done', label: 'Done' }
];

const PRIORITY_OPTIONS: TaskPriority[] = ['low', 'medium', 'high'];
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

function Icon({ path, paths, className }: { path?: string; paths?: string[]; className?: string }): JSX.Element {
  const resolved = paths ?? (path ? [path] : []);
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {resolved.map((item, index) => (
        <path key={`${item}-${index}`} d={item} />
      ))}
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

function nextStatus(status: TaskStatus): TaskStatus {
  if (status === 'backlog') return 'in-progress';
  if (status === 'in-progress') return 'done';
  return 'backlog';
}

function statusActionLabel(status: TaskStatus): string {
  if (status === 'backlog') return 'Start';
  if (status === 'in-progress') return 'Done';
  return 'Reopen';
}

function statusActionPaths(status: TaskStatus): string[] {
  if (status === 'backlog') return ['M7 5l11 7-11 7z'];
  if (status === 'in-progress') return ['M20 6L9 17l-5-5'];
  return ['M4 4v5h5', 'M20 12a8 8 0 1 0-8 8'];
}

function attachActionPaths(): string[] {
  return ['M21.44 11.05l-8.49 8.49a5 5 0 0 1-7.07-7.07l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a2 2 0 0 1-2.83-2.83l8.49-8.49'];
}

function archiveActionPaths(archived: boolean): string[] {
  if (archived) {
    return ['M3 3v6h6', 'M21 12a9 9 0 1 0-9 9'];
  }
  return ['M3 7h18', 'M5 7l1 12h12l1-12', 'M10 11h4'];
}

function deleteActionPaths(): string[] {
  return ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14', 'M10 11v6', 'M14 11v6'];
}

function toIsoDate(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function dueState(dueAt: string | undefined): 'overdue' | 'today' | 'upcoming' | null {
  if (!dueAt) {
    return null;
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) {
    return null;
  }
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  if (dueDay < today) return 'overdue';
  if (dueDay === today) return 'today';
  return 'upcoming';
}

export function TaskBoard({ workspace }: TaskBoardProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [labelsInput, setLabelsInput] = useState('');
  const [draggedTask, setDraggedTask] = useState<TaskItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  const grouped = COLUMNS.map((column) => ({
    ...column,
    tasks: getVisibleTasks(column.key)
  }));

  const canCreate = Boolean(title.trim() && startDate && endDate) && endDate >= startDate;

  return (
    <div className="task-board">
      <div className="task-board-toolbar">
        <div className="task-search-wrap">
          <span className="task-search-icon">
            <SearchIcon />
          </span>
          <input
            className="task-search-input"
            value={taskSearch}
            onChange={(event) => setTaskSearch(event.target.value)}
            placeholder="Search tasks..."
          />
        </div>
        <div className="task-toolbar-actions">
          <button type="button" onClick={() => setFiltersOpen((value) => !value)}>
            <Icon className="inline-icon" paths={['M4 6h16', 'M4 12h10', 'M14 12h6', 'M4 18h7', 'M13 18h7']} />
            Filters
          </button>
          <button type="button" className="primary-button" onClick={() => setCreateOpen(true)}>
            <Icon className="inline-icon" paths={['M12 5v14', 'M5 12h14']} />
            New Task
          </button>
        </div>
      </div>

      <div className={filtersOpen ? 'task-board-main filters-open' : 'task-board-main'}>
        <div className="task-columns">
          {grouped.map((column) => (
            <section
              key={column.key}
              className={`task-column status-${column.key}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedTask) {
                  void moveTask(draggedTask.id, column.key);
                }
                setDraggedTask(null);
              }}
            >
              <div className="task-column-header">
                <h4>
                  {column.label}
                  <span className="task-count-badge">{column.tasks.length}</span>
                </h4>
                <div className="task-column-actions">
                  <button
                    type="button"
                    className="task-column-action"
                    title={`Add task to ${column.label}`}
                    onClick={() => {
                      setDraftStatus(column.key);
                      setCreateOpen(true);
                    }}
                  >
                    <Icon paths={['M12 5v14', 'M5 12h14']} />
                  </button>
                  <button type="button" className="task-column-action" title="Column actions">
                    <Icon paths={['M6 12h.01', 'M12 12h.01', 'M18 12h.01']} />
                  </button>
                </div>
              </div>

              <div className="task-column-list">
                {column.tasks.map((task, index) => {
                    const dueAt = task.endAt ?? task.dueAt;
                    const isInProgress = task.status === 'in-progress';
                    const progressWidth = task.status === 'done' ? 100 : task.status === 'in-progress' ? 65 : 0;
                    return (
                      <article
                        key={task.id}
                        className={[
                          (task.archived ?? false) ? 'task-card archived' : 'task-card',
                          `status-${task.status}`
                        ].join(' ')}
                        draggable
                        onDragStart={() => setDraggedTask(task)}
                        onDragEnd={() => setDraggedTask(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (!draggedTask || draggedTask.id === task.id) {
                            return;
                          }
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
                        <p className="task-card-title">{task.title}</p>
                        {task.description && <div className="task-description">{task.description}</div>}
                        {isInProgress && (
                          <div className="task-progress">
                            <div className="task-progress-fill" style={{ width: `${progressWidth}%` }} />
                          </div>
                        )}
                        <div className="task-meta">
                          <span className={`task-priority ${task.priority ?? 'medium'}`}>{task.priority ?? 'medium'}</span>
                          {task.startAt && <span>Start: {new Date(task.startAt).toLocaleDateString()}</span>}
                          {dueAt && (
                            <span className={`task-due ${dueState(dueAt) ?? ''}`}>End: {new Date(dueAt).toLocaleDateString()}</span>
                          )}
                          <span>{task.paneId ? `Attached: ${task.paneId.slice(0, 6)}` : 'Not attached'}</span>
                        </div>
                        {task.labels && task.labels.length > 0 && (
                          <div className="task-labels">
                            {task.labels.map((label) => (
                              <span key={`${task.id}-${label}`}>{label}</span>
                            ))}
                          </div>
                        )}
                        <div className="task-actions">
                          <button
                            className="task-action-icon"
                            onClick={() => void updateTask(task.id, { status: nextStatus(task.status) })}
                            title={statusActionLabel(task.status)}
                            aria-label={statusActionLabel(task.status)}
                          >
                            <Icon paths={statusActionPaths(task.status)} />
                          </button>
                          <button
                            className="task-action-icon"
                            onClick={() => void updateTask(task.id, { paneId: workspace.activePaneId })}
                            title="Attach to active pane"
                            aria-label="Attach to active pane"
                          >
                            <Icon paths={attachActionPaths()} />
                          </button>
                          <button
                            className="task-action-icon"
                            onClick={() => void archiveTask(task.id, !(task.archived ?? false))}
                            title={task.archived ? 'Unarchive' : 'Archive'}
                            aria-label={task.archived ? 'Unarchive' : 'Archive'}
                          >
                            <Icon paths={archiveActionPaths(Boolean(task.archived))} />
                          </button>
                          <button
                            className="task-action-icon danger"
                            onClick={() => void deleteTask(task.id)}
                            title="Delete"
                            aria-label="Delete"
                          >
                            <Icon paths={deleteActionPaths()} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          ))}
        </div>

        <aside className={filtersOpen ? 'task-filters-panel open' : 'task-filters-panel'}>
          <header>
            <strong>Filters</strong>
            <button type="button" className="icon-only-button" onClick={() => setFiltersOpen(false)}>
              <Icon paths={['M6 6l12 12', 'M18 6l-12 12']} />
            </button>
          </header>
          <label>
            <span>Sort</span>
            <select value={taskSort} onChange={(event) => setTaskSort(event.target.value as TaskSortMode)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select
              value={taskFilters.priorities?.[0] ?? ''}
              onChange={(event) =>
                setTaskFilters({
                  priorities: event.target.value ? [event.target.value as TaskPriority] : undefined
                })
              }
            >
              <option value="">All Priorities</option>
              {PRIORITY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="task-filter-check">
            <input
              type="checkbox"
              checked={taskFilters.attachedOnly ?? false}
              onChange={(event) => setTaskFilters({ attachedOnly: event.target.checked || undefined })}
            />
            <span>Attached only</span>
          </label>
          <label className="task-filter-check">
            <input
              type="checkbox"
              checked={taskFilters.archived ?? false}
              onChange={(event) => setTaskFilters({ archived: event.target.checked })}
            />
            <span>Show archived</span>
          </label>
          <button type="button" onClick={clearTaskFilters}>Reset Filters</button>
        </aside>
      </div>

      {createOpen && (
        <div className="task-create-modal-backdrop" onClick={() => setCreateOpen(false)}>
          <section className="task-create-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>Create Task</h3>
              <button type="button" className="icon-only-button" onClick={() => setCreateOpen(false)}>
                <Icon paths={['M6 6l12 12', 'M18 6l-12 12']} />
              </button>
            </header>
            <div className="task-create-form">
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Task title" />
              <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" />
              <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                {PRIORITY_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <div className="task-date-row">
                <label>
                  <span>Start date *</span>
                  <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </label>
                <label>
                  <span>End date *</span>
                  <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </label>
              </div>
              <input value={labelsInput} onChange={(event) => setLabelsInput(event.target.value)} placeholder="labels: bug, api, ux" />
              {startDate && endDate && endDate < startDate && (
                <small className="task-create-error">End date must be on or after start date.</small>
              )}
            </div>
            <footer>
              <button type="button" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button
                type="button"
                disabled={!canCreate}
                onClick={() => {
                  if (!canCreate) {
                    return;
                  }
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
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
