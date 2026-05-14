import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkspaceManager } from '../../src/main/services/WorkspaceManager';

describe('WorkspaceManager mode field', () => {
  it('defaults legacy workspace (no mode field) to "space" on load', async () => {
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'vibe-ade-mode-'));
    const legacyState = {
      version: 2,
      activeWorkspaceId: 'ws-legacy',
      workspaces: [
        {
          id: 'ws-legacy',
          name: 'legacy',
          rootDir: process.cwd(),
          layout: { id: 'l', type: 'pane', paneId: 'p1' },
          paneTypes: { p1: 'terminal' },
          paneShells: { p1: 'powershell' },
          browserPanes: {},
          activePaneId: 'p1',
          commandBlocks: { p1: [] },
          tasks: [],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z'
        }
      ],
      subscription: { tier: 'spark', usage: { month: '2026-01', tasksCreated: 0, swarmsStarted: 0 } }
    };
    await writeFile(path.join(userDataDir, 'vibe-ade-state.json'), JSON.stringify(legacyState), 'utf8');
    const mgr = new WorkspaceManager(userDataDir, null as never);
    await mgr.initialize();
    const ws = mgr.list().workspaces.find((w) => w.id === 'ws-legacy');
    expect(ws?.mode).toBe('space');
  });

  it('creates a new workspace with the supplied mode', async () => {
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'vibe-ade-mode-'));
    await mkdir(userDataDir, { recursive: true });
    const mgr = new WorkspaceManager(userDataDir, null as never);
    await mgr.initialize();
    const ws = await mgr.create({ name: 'canvas-ws', rootDir: process.cwd(), mode: 'canvas' });
    expect(ws.mode).toBe('canvas');
  });

  it('defaults new workspace mode to "space" when omitted', async () => {
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'vibe-ade-mode-'));
    await mkdir(userDataDir, { recursive: true });
    const mgr = new WorkspaceManager(userDataDir, null as never);
    await mgr.initialize();
    const ws = await mgr.create({ name: 'default-ws', rootDir: process.cwd() });
    expect(ws.mode).toBe('space');
  });
});
