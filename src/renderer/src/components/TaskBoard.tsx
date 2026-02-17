import { useMemo, useState } from 'react';
import type { TaskItem, TaskStatus, WorkspaceState } from '@shared/types';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';

interface TaskBoardProps {
  workspace: WorkspaceState;
}

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'done', label: 'Done' }
];

export function TaskBoard({ workspace }: TaskBoardProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [draggedTask, setDraggedTask] = useState<TaskItem | null>(null);
  const addTask = useWorkspaceStore((s) => s.addTask);
  const moveTask = useWorkspaceStore((s) => s.moveTask);
  const deleteTask = useWorkspaceStore((s) => s.deleteTask);
  const updateTask = useWorkspaceStore((s) => s.updateTask);

  const grouped = useMemo(
    () =>
      COLUMNS.map((column) => ({
        ...column,
        tasks: workspace.tasks.filter((task) => task.status === column.key)
      })),
    [workspace.tasks]
  );

  return (
    <div className="task-board">
      <div className="task-create">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New task" />
        <button
          onClick={() => {
            if (!title.trim()) {
              return;
            }
            void addTask(title.trim());
            setTitle('');
          }}
        >
          Add
        </button>
      </div>

      <div className="task-columns">
        {grouped.map((column) => (
          <section
            key={column.key}
            className="task-column"
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (draggedTask) {
                void moveTask(draggedTask.id, column.key);
              }
              setDraggedTask(null);
            }}
          >
            <h4>{column.label}</h4>
            {column.tasks.map((task) => (
              <article
                key={task.id}
                className="task-card"
                draggable
                onDragStart={() => setDraggedTask(task)}
                onDragEnd={() => setDraggedTask(null)}
              >
                <p>{task.title}</p>
                <div className="task-meta">{task.paneId ? `Attached: ${task.paneId.slice(0, 4)}` : 'Not attached'}</div>
                <div className="task-actions">
                  <button onClick={() => void updateTask(task.id, { paneId: workspace.activePaneId })} title="Attach to active pane">
                    Attach
                  </button>
                  <button onClick={() => void deleteTask(task.id)}>Delete</button>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
