import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, WorkspaceState } from '../../src/shared/types';
import { WorkspaceManager } from '../../src/main/services/WorkspaceManager';
import { normalizeSubscriptionState } from '../../src/shared/subscription';

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
    paneTypes: { [`pane-${id}`]: 'terminal' },
    paneShells: { [`pane-${id}`]: 'cmd' },
    browserPanes: {},
    activePaneId: `pane-${id}`,
    commandBlocks: { [`pane-${id}`]: [] },
    tasks: [],
    createdAt: now,
    updatedAt: now
  };
}

function collectPaneIds(layout: WorkspaceState['layout']): string[] {
  if (layout.type === 'pane') {
    return [layout.paneId];
  }
  return layout.children.flatMap(collectPaneIds);
}

describe('WorkspaceManager task migration and normalization', () => {
  let userDataDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    userDataDir = await mkdtemp(path.join(os.tmpdir(), 'vibe-ade-wm-'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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
      workspaces: [legacyWorkspace],
      subscription: normalizeSubscriptionState()
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
      workspaces: [workspace],
      subscription: normalizeSubscriptionState()
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
      workspaces: [workspace],
      subscription: normalizeSubscriptionState()
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

  it('blocks spark cloud workspace creation after the configured limit', async () => {
    const manager = new WorkspaceManager(userDataDir, {
      isConfigured: vi.fn(() => true),
      getSession: vi.fn(async () => ({ id: 'user-1', email: 'test@example.com' })),
      getSessionWithToken: vi.fn(async () => ({
        accessToken: 'token',
        user: { id: 'user-1', email: 'test@example.com' }
      })),
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn()
    });
    await manager.initialize();

    await manager.replaceState({
      activeWorkspaceId: null,
      workspaces: [makeWorkspace('w1'), makeWorkspace('w2')],
      subscription: normalizeSubscriptionState({
        tier: 'spark',
        usage: { month: '2026-03', tasksCreated: 0, swarmsStarted: 0 }
      })
    });

    await expect(manager.create({ name: 'w3', rootDir: 'C:\\Repo3' })).rejects.toThrow(
      'Spark plan allows up to 2 cloud-synced workspaces'
    );
  });

  it('creates all panes for the selected layout preset', async () => {
    const manager = new WorkspaceManager(userDataDir);
    await manager.initialize();

    const workspace = await manager.create({
      name: 'layout-w',
      rootDir: 'C:\\Repo',
      layoutPresetId: '12-pane-grid'
    });

    const paneIds = collectPaneIds(workspace.layout);
    expect(paneIds).toHaveLength(12);
    expect(Object.keys(workspace.paneTypes)).toHaveLength(12);
    expect(Object.keys(workspace.paneShells)).toHaveLength(12);
    expect(paneIds.every((paneId) => workspace.paneTypes[paneId] === 'terminal')).toBe(true);
    expect(paneIds.every((paneId) => workspace.commandBlocks[paneId]?.length === 0)).toBe(true);
    expect(workspace.activePaneId).toBe(paneIds[0]);
  });

  it('preserves the existing subscription when replaceState omits it', async () => {
    const manager = new WorkspaceManager(userDataDir);
    await manager.initialize();

    await manager.updateSubscription(
      normalizeSubscriptionState({
        tier: 'forge',
        usage: { month: '2026-03', tasksCreated: 0, swarmsStarted: 0 }
      })
    );

    await manager.replaceState({
      activeWorkspaceId: null,
      workspaces: [makeWorkspace('keep-tier')] as WorkspaceState[],
      subscription: undefined as unknown as AppState['subscription']
    } as unknown as AppState);

    expect(manager.list().subscription.tier).toBe('forge');
  });

  it('removes a workspace locally even if remote cleanup fails', async () => {
    const getSessionWithToken = vi.fn(async () => ({
      accessToken: 'header.payload.signature',
      user: { id: 'user-1', email: 'test@example.com' }
    }));
    const manager = new WorkspaceManager(userDataDir, {
      isConfigured: vi.fn(() => true),
      getSession: vi.fn(async () => ({ user: { id: 'user-1', email: 'test@example.com' }, expiresAt: Date.now() + 60_000 })),
      getSessionWithToken,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn()
    });
    await manager.initialize();

    const workspace = makeWorkspace('remove-me');
    await manager.replaceState({
      activeWorkspaceId: workspace.id,
      workspaces: [workspace],
      subscription: normalizeSubscriptionState()
    });

    const fetchMock = vi.fn(async () => {
      throw new Error('Error: Expected 3 parts in JWT; got 1');
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await expect(manager.remove(workspace.id)).resolves.toBeUndefined();
    expect(getSessionWithToken).toHaveBeenCalled();
    expect(manager.list().workspaces).toHaveLength(0);
  });
});
