import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskItem, WorkspaceState } from '../../src/shared/types';

const { handle } = vi.hoisted(() => ({
  handle: vi.fn()
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null)
  },
  dialog: {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] }))
  },
  ipcMain: {
    handle
  }
}));

import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers';

function getHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const call = handle.mock.calls.find((entry) => entry[0] === channel);
  if (!call) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return call[1] as (...args: unknown[]) => Promise<unknown>;
}

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

describe('registerIpcHandlers task handlers', () => {
  beforeEach(() => {
    handle.mockReset();
  });

  it('validates task payloads and sanitizes labels on create', async () => {
    let workspace = makeWorkspace([]);
    const save = vi.fn(async (next: WorkspaceState) => {
      workspace = next;
    });

    registerIpcHandlers({
      workspaceManager: {
        list: vi.fn(() => ({ activeWorkspaceId: workspace.id, workspaces: [workspace] })),
        templates: vi.fn(() => []),
        create: vi.fn(),
        clone: vi.fn(),
        rename: vi.fn(),
        remove: vi.fn(),
        setActive: vi.fn(),
        save
      } as never,
      terminalManager: {
        onData: vi.fn(() => () => {}),
        onExit: vi.fn(() => () => {}),
        startSession: vi.fn(),
        stopSession: vi.fn(),
        sendInput: vi.fn(),
        executeInSession: vi.fn(),
        resize: vi.fn(),
        getSessionSnapshot: vi.fn(),
        runStructuredCommand: vi.fn()
      } as never,
      agentManager: {
        onUpdate: vi.fn(() => () => {}),
        start: vi.fn(),
        stop: vi.fn()
      } as never,
      templateRunner: {
        onProgress: vi.fn(() => () => {}),
        run: vi.fn()
      } as never,
      authManager: {
        getSession: vi.fn(),
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn()
      } as never,
      cloudSyncManager: {
        getStatus: vi.fn(),
        listRemoteWorkspaces: vi.fn(),
        getSyncPreview: vi.fn(),
        pushLocalState: vi.fn(),
        pullRemoteToLocal: vi.fn()
      } as never,
      webContents: { send: vi.fn() } as never,
      setSaveMenuEnabled: vi.fn()
    });

    const create = getHandler('task:create');
    await expect(
      create({}, 'w1', {
        title: 'x',
        labels: ['ok', '']
      })
    ).rejects.toThrow('Invalid task labels');

    const created = (await create({}, 'w1', {
      title: '  New Task  ',
      labels: [' bug ', 'bug', 'ui '],
      priority: 'high'
    })) as TaskItem;

    expect(save).toHaveBeenCalledTimes(1);
    expect(created.title).toBe('New Task');
    expect(created.priority).toBe('high');
    expect(created.labels).toEqual(['bug', 'ui']);
    expect(created.archived).toBe(false);
    expect(created.order).toBe(1);
    expect(workspace.tasks).toHaveLength(1);
  });

  it('moves task into target column and reorders by target index', async () => {
    const now = new Date().toISOString();
    const t1: TaskItem = {
      id: 't1',
      title: 'a',
      description: '',
      status: 'backlog',
      createdAt: now,
      updatedAt: now,
      order: 1
    };
    const t2: TaskItem = {
      id: 't2',
      title: 'b',
      description: '',
      status: 'done',
      createdAt: now,
      updatedAt: now,
      order: 1
    };
    let workspace = makeWorkspace([t1, t2]);

    registerIpcHandlers({
      workspaceManager: {
        list: vi.fn(() => ({ activeWorkspaceId: workspace.id, workspaces: [workspace] })),
        templates: vi.fn(() => []),
        create: vi.fn(),
        clone: vi.fn(),
        rename: vi.fn(),
        remove: vi.fn(),
        setActive: vi.fn(),
        save: vi.fn(async (next: WorkspaceState) => {
          workspace = next;
        })
      } as never,
      terminalManager: {
        onData: vi.fn(() => () => {}),
        onExit: vi.fn(() => () => {}),
        startSession: vi.fn(),
        stopSession: vi.fn(),
        sendInput: vi.fn(),
        executeInSession: vi.fn(),
        resize: vi.fn(),
        getSessionSnapshot: vi.fn(),
        runStructuredCommand: vi.fn()
      } as never,
      agentManager: {
        onUpdate: vi.fn(() => () => {}),
        start: vi.fn(),
        stop: vi.fn()
      } as never,
      templateRunner: {
        onProgress: vi.fn(() => () => {}),
        run: vi.fn()
      } as never,
      authManager: {
        getSession: vi.fn(),
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn()
      } as never,
      cloudSyncManager: {
        getStatus: vi.fn(),
        listRemoteWorkspaces: vi.fn(),
        getSyncPreview: vi.fn(),
        pushLocalState: vi.fn(),
        pullRemoteToLocal: vi.fn()
      } as never,
      webContents: { send: vi.fn() } as never,
      setSaveMenuEnabled: vi.fn()
    });

    const move = getHandler('task:move');
    await move({}, 'w1', 't2', 'backlog', 0);

    const backlog = workspace.tasks
      .filter((task) => task.status === 'backlog')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    expect(backlog.map((task) => task.id)).toEqual(['t2', 't1']);
    expect(backlog.map((task) => task.order)).toEqual([1, 2]);
  });
});
