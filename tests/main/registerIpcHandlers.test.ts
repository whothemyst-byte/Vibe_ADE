import { describe, expect, it, vi, beforeEach } from 'vitest';

const { handle } = vi.hoisted(() => ({
  handle: vi.fn()
}));

vi.mock('electron', () => ({
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

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    handle.mockReset();
  });

  it('registers all core handlers and adds warning for destructive command', async () => {
    const webContents = { send: vi.fn() };

    const terminalManager = {
      onData: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
      startSession: vi.fn(),
      stopSession: vi.fn(),
      sendInput: vi.fn(),
      executeInSession: vi.fn(),
      resize: vi.fn(),
      getSessionSnapshot: vi.fn(),
      runStructuredCommand: vi.fn(async () => ({
        id: 'b1',
        paneId: 'p1',
        command: 'Remove-Item .\\tmp -Recurse',
        output: '',
        exitCode: 0,
        startedAt: new Date().toISOString(),
        collapsed: true
      }))
    };

    const workspaceRoot = process.cwd();

    const workspaceManager = {
      list: vi.fn(() => ({
        activeWorkspaceId: 'w1',
        workspaces: [{ id: 'w1', rootDir: workspaceRoot }]
      })),
      templates: vi.fn(() => []),
      create: vi.fn(),
      clone: vi.fn(),
      rename: vi.fn(),
      remove: vi.fn(),
      setActive: vi.fn(),
      save: vi.fn()
    };

    const templateRunner = {
      onProgress: vi.fn(() => () => {}),
      run: vi.fn()
    };

    registerIpcHandlers({
      workspaceManager: workspaceManager as never,
      terminalManager: terminalManager as never,
      templateRunner: templateRunner as never,
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
      webContents: webContents as never,
      setSaveMenuEnabled: vi.fn()
    });

    const registeredChannels = handle.mock.calls.map((entry) => entry[0]);
    expect(registeredChannels).toContain('workspace:list');
    expect(registeredChannels).toContain('terminal:startSession');
    expect(registeredChannels).toContain('terminal:runStructuredCommand');

    const structuredHandler = getHandler('terminal:runStructuredCommand');
    const result = (await structuredHandler({}, {
      paneId: 'p1',
      shell: 'powershell',
      cwd: workspaceRoot,
      command: 'Remove-Item .\\tmp -Recurse'
    })) as { warning?: string };

    expect(terminalManager.runStructuredCommand).toHaveBeenCalledTimes(1);
    expect(result.warning).toBeDefined();
  });
});
