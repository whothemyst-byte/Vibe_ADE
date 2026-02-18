import { useMemo, useState } from 'react';
import { LAYOUT_PRESETS } from '@renderer/services/layoutPresets';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';

export function CommandPalette(): JSX.Element {
  const [query, setQuery] = useState('');
  const togglePalette = useWorkspaceStore((s) => s.toggleCommandPalette);
  const toggleTaskBoard = useWorkspaceStore((s) => s.toggleTaskBoard);
  const toggleAgentPanel = useWorkspaceStore((s) => s.toggleAgentPanel);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const setLayoutPreset = useWorkspaceStore((s) => s.setLayoutPreset);
  const addPaneToLayout = useWorkspaceStore((s) => s.addPaneToLayout);
  const addTask = useWorkspaceStore((s) => s.addTask);
  const setTaskFilters = useWorkspaceStore((s) => s.setTaskFilters);
  const setTaskSort = useWorkspaceStore((s) => s.setTaskSort);
  const clearTaskFilters = useWorkspaceStore((s) => s.clearTaskFilters);
  const appState = useWorkspaceStore((s) => s.appState);
  const taskFilters = useWorkspaceStore((s) => s.ui.taskFilters);
  const activeWorkspace = appState.workspaces.find((w) => w.id === appState.activeWorkspaceId);

  const actions = useMemo(() => {
    const layoutActions = LAYOUT_PRESETS.map((preset) => ({
      id: `layout-${preset.id}`,
      label: `Layout: ${preset.label}`,
      run: () => setLayoutPreset(preset.id)
    }));

    return [
      {
        id: 'new-workspace',
        label: 'New Workspace',
        run: () => void createWorkspace({ name: `Workspace ${Date.now()}`, rootDir: 'C:\\' })
      },
      {
        id: 'switch-workspace',
        label: 'Switch Workspace',
        run: () => {
          if (appState.workspaces.length < 2 || !activeWorkspace) {
            return;
          }
          const index = appState.workspaces.findIndex((w) => w.id === activeWorkspace.id);
          const next = appState.workspaces[(index + 1) % appState.workspaces.length];
          void setActiveWorkspace(next.id);
        }
      },
      {
        id: 'add-pane',
        label: 'Add Terminal Pane',
        run: () => void addPaneToLayout()
      },
      {
        id: 'create-task',
        label: 'Create Task',
        run: () => {
          toggleTaskBoard(true);
          void addTask('New task');
        }
      },
      {
        id: 'toggle-task-board',
        label: 'Open Task Board Tab',
        run: () => toggleTaskBoard(true)
      },
      {
        id: 'toggle-task-archived',
        label: (taskFilters.archived ?? false) ? 'Task Board: Hide Archived' : 'Task Board: Show Archived',
        run: () => {
          toggleTaskBoard(true);
          setTaskFilters({ archived: !(taskFilters.archived ?? false) });
        }
      },
      {
        id: 'task-sort-priority',
        label: 'Task Board: Sort by Priority (High to Low)',
        run: () => {
          toggleTaskBoard(true);
          setTaskSort('priority-desc');
        }
      },
      {
        id: 'task-sort-updated',
        label: 'Task Board: Sort by Updated (Newest)',
        run: () => {
          toggleTaskBoard(true);
          setTaskSort('updated-desc');
        }
      },
      {
        id: 'task-reset-filters',
        label: 'Task Board: Reset Filters',
        run: () => {
          toggleTaskBoard(true);
          clearTaskFilters();
        }
      },
      {
        id: 'toggle-agent-panel',
        label: 'Toggle Agent Panel',
        run: () => toggleAgentPanel()
      },
      ...layoutActions
    ];
  }, [
    activeWorkspace,
    addPaneToLayout,
    addTask,
    appState.workspaces,
    clearTaskFilters,
    createWorkspace,
    setActiveWorkspace,
    setLayoutPreset,
    setTaskFilters,
    setTaskSort,
    taskFilters.archived,
    toggleAgentPanel,
    toggleTaskBoard
  ]);

  const filtered = actions.filter((action) => action.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="command-palette-overlay" onClick={() => togglePalette(false)}>
      <div className="command-palette" onClick={(event) => event.stopPropagation()}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type an action" autoFocus />
        <div className="command-results">
          {filtered.map((action) => (
            <button
              key={action.id}
              onClick={() => {
                action.run();
                togglePalette(false);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
