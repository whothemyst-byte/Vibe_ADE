import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorkspaceState } from '../../src/shared/types';
import { TaskBoard } from '../../src/renderer/src/components/TaskBoard';
import { useWorkspaceStore } from '../../src/renderer/src/state/workspaceStore';

function makeWorkspace(): WorkspaceState {
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
    tasks: [
      {
        id: 't1',
        title: 'Task A',
        description: 'desc',
        status: 'backlog',
        priority: 'medium',
        labels: ['ui'],
        archived: false,
        order: 1,
        createdAt: now,
        updatedAt: now
      }
    ],
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

describe('TaskBoard render surface', () => {
  beforeEach(() => {
    useWorkspaceStore.setState((state) => ({
      ...state,
      appState: {
        activeWorkspaceId: 'w1',
        workspaces: [makeWorkspace()]
      },
      ui: {
        ...state.ui,
        taskSearch: '',
        taskFilters: { archived: false },
        taskSort: 'updated-desc'
      }
    }));
  });

  it('renders task controls and columns', () => {
    const workspace = useWorkspaceStore.getState().appState.workspaces[0];
    const html = renderToStaticMarkup(React.createElement(TaskBoard, { workspace }));

    expect(html).toContain('Search tasks...');
    expect(html).toContain('All Priorities');
    expect(html).toContain('Backlog');
    expect(html).toContain('In Progress');
    expect(html).toContain('Done');
    expect(html).toContain('New Task');
    expect(html).toContain('Filters');
  });
});
