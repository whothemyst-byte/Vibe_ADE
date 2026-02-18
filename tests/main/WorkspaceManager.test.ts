import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, WorkspaceState } from '../../src/shared/types';
import { WorkspaceManager } from '../../src/main/services/WorkspaceManager';

function makeWorkspace(id: string): WorkspaceState {
  const now = new Date().toISOString();
  return {
    id,
    name: `Workspace ${id}`,
    rootDir: process.cwd(),
    layout: {
      id: `layout-${id}`,
      type: 'pane',
      paneId: `pane-${id}`
    },
    paneShells: { [`pane-${id}`]: 'cmd' },
    activePaneId: `pane-${id}`,
    selectedModel: 'llama3.2',
    commandBlocks: { [`pane-${id}`]: [] },
    tasks: [],
    paneAgents: {
      [`pane-${id}`]: {
        paneId: `pane-${id}`,
        attached: false,
        model: 'llama3.2',
        running: false
      }
    },
    createdAt: now,
    updatedAt: now
  };
}

describe('WorkspaceManager task migration and normalization', () => {
  let userDataDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    userDataDir = await mkdtemp(path.join(os.tmpdir(), 'vibe-ade-wm-'));
  });

  afterEach(() => {
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('normalizes legacy tasks and repairs invalid active workspace id', async () => {
    const manager = new WorkspaceManager(userDataDir);
    await manager.initialize();

    const legacyWorkspace = makeWorkspace('w1');
    legacyWorkspace.tasks = [
      {
        id: 't1',
        title: 'first',
        description: '',
        status: 'backlog',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      {
        id: 't2',
        title: 'second',
        description: '',
        status: 'backlog',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        labels: [' ui ', '', 'bug']
      }
    ];

    const input: AppState = {
      activeWorkspaceId: 'missing-workspace',
      workspaces: [legacyWorkspace]
    };

    await manager.replaceState(input);
    const state = manager.list();

    expect(state.activeWorkspaceId).toBe('w1');
    expect(state.workspaces[0].tasks).toHaveLength(2);
    expect(state.workspaces[0].tasks[0].priority).toBe('medium');
    expect(state.workspaces[0].tasks[0].archived).toBe(false);
    expect(state.workspaces[0].tasks[0].order).toBe(1);
    expect(state.workspaces[0].tasks[1].labels).toEqual(['ui', 'bug']);
    expect(state.workspaces[0].tasks[1].order).toBe(2);
  });

  it('re-normalizes task ordering on save', async () => {
    const manager = new WorkspaceManager(userDataDir);
    await manager.initialize();

    const workspace = makeWorkspace('w2');
    workspace.tasks = [
      {
        id: 't-a',
        title: 'A',
        description: '',
        status: 'done',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        order: 9
      },
      {
        id: 't-b',
        title: 'B',
        description: '',
        status: 'done',
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        order: 1
      }
    ];

    await manager.replaceState({
      activeWorkspaceId: workspace.id,
      workspaces: [workspace]
    });

    const saved = manager.list().workspaces[0];
    await manager.save(saved);

    const done = manager
      .list()
      .workspaces[0]
      .tasks.filter((task) => task.status === 'done')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    expect(done.map((task) => task.id)).toEqual(['t-b', 't-a']);
    expect(done.map((task) => task.order)).toEqual([1, 2]);
  });

  it('keeps normalized task data after persisted reload', async () => {
    const first = new WorkspaceManager(userDataDir);
    await first.initialize();

    const workspace = makeWorkspace('w3');
    workspace.tasks = [
      {
        id: 'legacy-task',
        title: 'Legacy',
        description: '',
        status: 'backlog',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        labels: [' api ', '']
      }
    ];

    await first.replaceState({
      activeWorkspaceId: workspace.id,
      workspaces: [workspace]
    });

    const second = new WorkspaceManager(userDataDir);
    await second.initialize();
    const reloaded = second.list().workspaces[0].tasks[0];

    expect(reloaded.id).toBe('legacy-task');
    expect(reloaded.priority).toBe('medium');
    expect(reloaded.archived).toBe(false);
    expect(reloaded.order).toBe(1);
    expect(reloaded.labels).toEqual(['api']);
  });
});
