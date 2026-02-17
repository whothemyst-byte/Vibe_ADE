import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn()
}));

vi.mock('node-pty', () => ({
  default: {
    spawn: spawnMock
  }
}));

import { TerminalManager } from '../../src/main/services/TerminalManager';

describe('TerminalManager lifecycle', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('starts, writes, resizes, and stops pane sessions', async () => {
    let onDataCb: ((data: string) => void) | undefined;
    let onExitCb: ((event: { exitCode: number }) => void) | undefined;

    const proc = {
      pid: 45678,
      onData: vi.fn((cb: (data: string) => void) => {
        onDataCb = cb;
      }),
      onExit: vi.fn((cb: (event: { exitCode: number }) => void) => {
        onExitCb = cb;
      }),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn()
    };

    spawnMock.mockReturnValue(proc);

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'vibe-ade-'));
    const manager = new TerminalManager(tempDir);
    await manager.initialize();

    const dataListener = vi.fn();
    const exitListener = vi.fn();
    manager.onData(dataListener);
    manager.onExit(exitListener);

    manager.startSession({ paneId: 'pane-a', shell: 'powershell', cwd: tempDir });
    manager.sendInput('pane-a', 'echo hi\r');
    manager.resize('pane-a', 140, 50);

    onDataCb?.('hello\n');
    expect(dataListener).toHaveBeenCalledWith('pane-a', 'hello\n');

    expect(proc.write).toHaveBeenCalledWith('echo hi\r');
    expect(proc.resize).toHaveBeenCalledWith(140, 50);

    onExitCb?.({ exitCode: 0 });
    expect(exitListener).toHaveBeenCalledWith('pane-a', 0);

    expect(() => manager.sendInput('pane-a', 'x')).toThrow();

    manager.startSession({ paneId: 'pane-a', shell: 'powershell', cwd: tempDir });
    manager.stopSession('pane-a');
    expect(proc.kill).toHaveBeenCalled();
  });
});
