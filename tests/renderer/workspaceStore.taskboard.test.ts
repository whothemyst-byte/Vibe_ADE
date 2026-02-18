import { beforeEach, describe, expect, it } from 'vitest';
import type { TaskItem, WorkspaceState } from '../../src/shared/types';
import { useWorkspaceStore } from '../../src/renderer/src/state/workspaceStore';

function makeWorkspace(tasks: TaskItem[]): WorkspaceState {
  const now = new Date().toISOString();
  return {
    id: 'w1',
    name: 'Workspace',
    rootDir: process.cwd(),
    layout: {
      id: 'layout-1',
      type: 'pane',
      paneId: 'pane-1'
    },
    paneShells: { 'pane-1': 'cmd' },
    activePaneId: 'pane-1',
    selectedModel: 'llama3.2',
    commandBlocks: { 'pane-1': [] },
    tasks,
    paneAgents: {
      'pane-1': {
        paneId: 'pane-1',
        attached: false,
        model: 'llama3.2',
        running: false
      }
    },
    createdAt: now,
    updatedAt: now
  };
}

describe('workspaceStore task board actions', () => {
  beforeEach(() => {
    const now = new Date().toISOString();
    const workspace = makeWorkspace([
      {
        id: 't1',
        title: 'Bugfix',
        description: '',
        status: 'backlog',
        priority: 'high',
        labels: ['bug'],
        archived: false,
        order: 1,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 't2',
        title: 'Refactor',
        description: '',
        status: 'backlog',
        priority: 'low',
        archived: false,
        order: 2,
        createdAt: now,
        updatedAt: now
      }
    ]);

    useWorkspaceStore.setState((state) => ({
      ...state,
      appState: {
        activeWorkspaceId: 'w1',
        workspaces: [workspace]
      },
      ui: {
        ...state.ui,
        taskSearch: '',
        taskFilters: { archived: false },
        taskSort: 'updated-desc'
      }
    }));
  });

  it('creates a task with normalized defaults', async () => {
    await useWorkspaceStore.getState().createTask({
      title: '  New Task  ',
      labels: [' ui ', '', 'api']
    });

    const tasks = useWorkspaceStore.getState().appState.workspaces[0].tasks;
    const created = tasks.find((task) => task.title === 'New Task');
    expect(created).toBeDefined();
    expect(created?.priority).toBe('medium');
    expect(created?.archived).toBe(false);
    expect(created?.labels).toEqual(['ui', 'api']);
    expect(created?.status).toBe('backlog');
  });

  it('filters and sorts visible tasks', () => {
    const store = useWorkspaceStore.getState();
    store.setTaskFilters({ priorities: ['high'], archived: false });
    store.setTaskSort('priority-desc');
    const visible = store.getVisibleTasks('backlog');
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('t1');
  });

  it('moves and reorders tasks in a column', async () => {
    await useWorkspaceStore.getState().moveTask('t2', 'backlog', 0);
    const backlog = useWorkspaceStore
      .getState()
      .appState.workspaces[0]
      .tasks.filter((task) => task.status === 'backlog')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    expect(backlog.map((task) => task.id)).toEqual(['t2', 't1']);
    expect(backlog.map((task) => task.order)).toEqual([1, 2]);
  });
});

