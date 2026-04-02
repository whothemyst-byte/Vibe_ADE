import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WorkspaceState } from '../../src/shared/types';
import { exportEnvironmentToDirectory, listEnvironmentExports, loadEnvironmentExport } from '../../src/main/services/EnvironmentFileManager';

function makeWorkspace(): WorkspaceState {
  const now = new Date('2026-03-01T00:00:00.000Z').toISOString();
  return {
    id: 'w1',
    name: 'My Env',
    rootDir: 'C:\\Repo',
    layout: {
      id: 'split-1',
      type: 'split',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        { id: 'pane-a', type: 'pane', paneId: 'p-a' },
        { id: 'pane-b', type: 'pane', paneId: 'p-b' }
      ]
    },
    paneTypes: { 'p-a': 'terminal', 'p-b': 'browser' },
    paneShells: { 'p-a': 'cmd' },
    browserPanes: {
      'p-b': {
        url: 'about:blank',
        title: 'about:blank',
        isLoading: false,
        history: ['about:blank'],
        historyIndex: 0
      }
    },
    activePaneId: 'p-a',
    commandBlocks: {
      'p-a': [
        {
          id: 'b1',
          paneId: 'p-a',
          command: 'echo hi',
          output: 'hi',
          exitCode: 0,
          startedAt: now,
          completedAt: now,
          collapsed: false
        }
      ],
      'p-b': []
    },
    tasks: [
      {
        id: 't1',
        title: 'Attached task',
        description: '',
        status: 'backlog',
        paneId: 'p-a',
        createdAt: now,
        updatedAt: now
      }
    ],
    createdAt: now,
    updatedAt: now
  };
}

describe('EnvironmentFileManager', () => {
  it('exports a browser-aware snapshot and lists it', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'vibe-ade-env-'));
    const workspace = makeWorkspace();

    const filePath = await exportEnvironmentToDirectory(workspace, directory);
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as { version: number; environment: { name: string; rootDir: string; layout: unknown } };

    expect(parsed.version).toBe(2);
    expect(parsed.environment.name).toBe('My Env');
    expect(parsed.environment.rootDir).toBe('C:\\Repo');
    expect(parsed.environment.layout).toBeTruthy();

    const list = await listEnvironmentExports(directory);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].filePath).toBe(filePath);
    expect(list[0].name).toBe('My Env');
  });

  it('imports with new ids, clears command history, and preserves browser panes', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'vibe-ade-env-'));
    const workspace = makeWorkspace();
    const filePath = await exportEnvironmentToDirectory(workspace, directory);

    const imported = await loadEnvironmentExport(filePath);
    expect(imported.id).not.toBe(workspace.id);
    expect(imported.commandBlocks).toBeDefined();
    expect(Object.values(imported.commandBlocks).every((blocks) => blocks.length === 0)).toBe(true);
    expect(Object.values(imported.paneShells).every((shell) => shell === 'powershell')).toBe(true);
    const importedBrowserPaneId = Object.keys(imported.browserPanes)[0];
    expect(importedBrowserPaneId).toBeDefined();
    expect(imported.browserPanes[importedBrowserPaneId]).toMatchObject({
      url: 'about:blank',
      title: 'about:blank',
      isLoading: false,
      history: ['about:blank'],
      historyIndex: 0
    });
    expect(imported.tasks).toEqual([]);

    const importedPaneIds =
      imported.layout.type === 'pane'
        ? [imported.layout.paneId]
        : imported.layout.children.map((child) => (child.type === 'pane' ? child.paneId : ''));
    expect(importedPaneIds).not.toContain('p-a');
    expect(importedPaneIds).not.toContain('p-b');
  });
});
