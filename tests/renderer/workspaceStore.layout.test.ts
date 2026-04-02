import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceState } from '../../src/shared/types';
import { collectPaneIds } from '../../src/renderer/src/services/layoutEngine';
import { useWorkspaceStore } from '../../src/renderer/src/state/workspaceStore';

function makeWorkspace(): WorkspaceState {
  const now = new Date().toISOString();
  return {
    id: 'w1',
    name: 'Workspace',
    rootDir: process.cwd(),
    layout: {
      id: 'split-root',
      type: 'split',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        {
          id: 'split-left',
          type: 'split',
          direction: 'vertical',
          sizes: [50, 50],
          children: [
            { id: 'pane-1', type: 'pane', paneId: 'pane-1' },
            { id: 'pane-2', type: 'pane', paneId: 'pane-2' }
          ]
        },
        {
          id: 'split-right',
          type: 'split',
          direction: 'vertical',
          sizes: [50, 50],
          children: [
            { id: 'pane-3', type: 'pane', paneId: 'pane-3' },
            { id: 'pane-4', type: 'pane', paneId: 'pane-4' }
          ]
        }
      ]
    },
    paneTypes: {
      'pane-1': 'terminal',
      'pane-2': 'terminal',
      'pane-3': 'terminal',
      'pane-4': 'terminal'
    },
    paneShells: {
      'pane-1': 'powershell',
      'pane-2': 'powershell',
      'pane-3': 'powershell',
      'pane-4': 'powershell'
    },
    browserPanes: {},
    activePaneId: 'pane-1',
    commandBlocks: {
      'pane-1': [],
      'pane-2': [],
      'pane-3': [],
      'pane-4': []
    },
    tasks: [],
    createdAt: now,
    updatedAt: now
  };
}

describe('workspaceStore layout preset actions', () => {
  beforeEach(() => {
    const workspace = makeWorkspace();
    useWorkspaceStore.setState((state) => ({
      ...state,
      appState: {
        activeWorkspaceId: 'w1',
        workspaces: [workspace],
        subscription: {
          tier: 'spark',
          usage: {
            month: '2026-04',
            tasksCreated: 0,
            swarmsStarted: 0
          }
        }
      },
      ui: {
        ...state.ui,
        layoutPresetByWorkspace: {
          w1: '4-pane-grid'
        },
        paneOrderByWorkspace: {
          w1: ['pane-1', 'pane-2', 'pane-3', 'pane-4']
        },
        unsavedByWorkspace: {
          w1: false
        }
      }
    }));

    (globalThis as typeof globalThis & { window?: unknown }).window = {
        vibeAde: {
          terminal: {
            stopSession: vi.fn().mockResolvedValue(undefined)
          },
          workspace: {
            updateSubscription: vi.fn()
        }
      }
    };
  });

  it('closes surplus panes when switching to a smaller preset', async () => {
    await useWorkspaceStore.getState().setLayoutPreset('2-pane-vertical');

    const state = useWorkspaceStore.getState();
    const workspace = state.appState.workspaces[0];
    expect(collectPaneIds(workspace.layout)).toHaveLength(2);
    expect(collectPaneIds(workspace.layout)).toEqual(['pane-1', 'pane-2']);
    expect(state.ui.layoutPresetByWorkspace.w1).toBe('2-pane-vertical');

    const stopSession = (globalThis as typeof globalThis & { window: { vibeAde: { terminal: { stopSession: ReturnType<typeof vi.fn> } } } }).window
      .vibeAde.terminal.stopSession;
    expect(stopSession).toHaveBeenCalledTimes(2);
    expect(stopSession).toHaveBeenCalledWith('pane-3');
    expect(stopSession).toHaveBeenCalledWith('pane-4');
  });

  it('inserts and removes a browser pane in the shared layout', async () => {
    useWorkspaceStore.setState((state) => ({
      ...state,
      appState: {
        ...state.appState,
        subscription: {
          tier: 'flux',
          usage: {
            month: '2026-04',
            tasksCreated: 0,
            swarmsStarted: 0
          }
        }
      }
    }));

    await useWorkspaceStore.getState().addBrowserPaneToLayout('pane-2');

    const addedState = useWorkspaceStore.getState();
    const addedWorkspace = addedState.appState.workspaces[0];
    const paneIds = collectPaneIds(addedWorkspace.layout);
    const browserPaneId = paneIds.find((paneId) => addedWorkspace.paneTypes[paneId] === 'browser');

    expect(browserPaneId).toBeTruthy();
    expect(addedWorkspace.paneTypes[browserPaneId!]).toBe('browser');
    expect(addedWorkspace.browserPanes[browserPaneId!]).toBeDefined();
    expect(addedWorkspace.browserPanes[browserPaneId!].sourcePaneId).toBe('pane-2');
    expect(addedState.ui.paneOrderByWorkspace.w1).toContain(browserPaneId!);
    expect(addedWorkspace.activePaneId).toBe(browserPaneId);

    useWorkspaceStore.getState().addBrowserTabToLayout('w1', browserPaneId!, {
      url: 'https://example.com',
      title: 'Example'
    });

    const withTabState = useWorkspaceStore.getState();
    const withTabWorkspace = withTabState.appState.workspaces[0];
    expect(withTabWorkspace.browserPanes[browserPaneId!].tabs).toHaveLength(2);
    expect(withTabWorkspace.browserPanes[browserPaneId!].activeTabId).toBe(withTabWorkspace.browserPanes[browserPaneId!].tabs[1].id);

    useWorkspaceStore.getState().closeBrowserTab('w1', browserPaneId!, withTabWorkspace.browserPanes[browserPaneId!].tabs[1].id);

    const afterCloseState = useWorkspaceStore.getState();
    const afterCloseWorkspace = afterCloseState.appState.workspaces[0];
    expect(afterCloseWorkspace.browserPanes[browserPaneId!].tabs).toHaveLength(1);
    expect(afterCloseWorkspace.browserPanes[browserPaneId!].activeTabId).toBe(afterCloseWorkspace.browserPanes[browserPaneId!].tabs[0].id);

    const removed = await useWorkspaceStore.getState().removePaneFromLayout(browserPaneId!);
    expect(removed).toBe(true);

    const removedWorkspace = useWorkspaceStore.getState().appState.workspaces[0];
    expect(collectPaneIds(removedWorkspace.layout)).toHaveLength(4);
    expect(removedWorkspace.browserPanes[browserPaneId!]).toBeUndefined();
    expect(removedWorkspace.paneTypes[browserPaneId!]).toBeUndefined();
  });

  it('prevents opening a second browser window for the same terminal', async () => {
    useWorkspaceStore.setState((state) => ({
      ...state,
      appState: {
        ...state.appState,
        subscription: {
          tier: 'flux',
          usage: {
            month: '2026-04',
            tasksCreated: 0,
            swarmsStarted: 0
          }
        }
      }
    }));

    await useWorkspaceStore.getState().addBrowserPaneToLayout('pane-3');
    const firstState = useWorkspaceStore.getState();
    const firstWorkspace = firstState.appState.workspaces[0];
    const browserPaneIds = collectPaneIds(firstWorkspace.layout).filter((paneId) => firstWorkspace.paneTypes[paneId] === 'browser');
    expect(browserPaneIds).toHaveLength(1);

    await useWorkspaceStore.getState().addBrowserPaneToLayout('pane-3');

    const secondState = useWorkspaceStore.getState();
    const secondWorkspace = secondState.appState.workspaces[0];
    const secondBrowserPaneIds = collectPaneIds(secondWorkspace.layout).filter((paneId) => secondWorkspace.paneTypes[paneId] === 'browser');
    expect(secondBrowserPaneIds).toHaveLength(1);
    expect(secondWorkspace.browserPanes[secondBrowserPaneIds[0]!].sourcePaneId).toBe('pane-3');
  });

  it('reorders a browser pane within the workspace layout', async () => {
    useWorkspaceStore.setState((state) => ({
      ...state,
      appState: {
        ...state.appState,
        subscription: {
          tier: 'flux',
          usage: {
            month: '2026-04',
            tasksCreated: 0,
            swarmsStarted: 0
          }
        }
      }
    }));

    await useWorkspaceStore.getState().addBrowserPaneToLayout('pane-1');
    const browserState = useWorkspaceStore.getState();
    const workspace = browserState.appState.workspaces[0];
    const browserPaneId = collectPaneIds(workspace.layout).find((paneId) => workspace.paneTypes[paneId] === 'browser');
    expect(browserPaneId).toBeTruthy();

    const beforeOrder = [...useWorkspaceStore.getState().ui.paneOrderByWorkspace.w1];
    expect(beforeOrder).toContain(browserPaneId!);

    useWorkspaceStore.getState().reorderPanes(browserPaneId!, 'pane-4');

    const afterOrder = useWorkspaceStore.getState().ui.paneOrderByWorkspace.w1;
    expect(afterOrder).not.toEqual(beforeOrder);
    expect(afterOrder.indexOf(browserPaneId!)).toBeLessThan(afterOrder.indexOf('pane-4'));
  });

  it('reorders tabs within a browser pane without changing the workspace layout', async () => {
    useWorkspaceStore.setState((state) => ({
      ...state,
      appState: {
        ...state.appState,
        subscription: {
          tier: 'flux',
          usage: {
            month: '2026-04',
            tasksCreated: 0,
            swarmsStarted: 0
          }
        }
      }
    }));

    await useWorkspaceStore.getState().addBrowserPaneToLayout('pane-1');
    const browserState = useWorkspaceStore.getState();
    const workspace = browserState.appState.workspaces[0];
    const browserPaneId = collectPaneIds(workspace.layout).find((paneId) => workspace.paneTypes[paneId] === 'browser');
    expect(browserPaneId).toBeTruthy();

    useWorkspaceStore.getState().addBrowserTabToLayout('w1', browserPaneId!, {
      url: 'https://one.example',
      title: 'One'
    });
    useWorkspaceStore.getState().addBrowserTabToLayout('w1', browserPaneId!, {
      url: 'https://two.example',
      title: 'Two'
    });

    const beforeMove = useWorkspaceStore.getState().appState.workspaces[0].browserPanes[browserPaneId!];
    const [firstTabId, secondTabId, thirdTabId] = beforeMove.tabs.map((tab) => tab.id);
    expect(firstTabId).toBeTruthy();
    expect(secondTabId).toBeTruthy();
    expect(thirdTabId).toBeTruthy();

    const beforePaneOrder = [...useWorkspaceStore.getState().ui.paneOrderByWorkspace.w1];
    useWorkspaceStore.getState().moveBrowserTabToLayout('w1', browserPaneId!, thirdTabId, firstTabId);
    const movedPane = useWorkspaceStore.getState().appState.workspaces[0].browserPanes[browserPaneId!];
    expect(movedPane.tabs.map((tab) => tab.id)).toEqual([thirdTabId, firstTabId, secondTabId]);
    expect(movedPane.activeTabId).toBe(beforeMove.activeTabId);
    expect(useWorkspaceStore.getState().ui.paneOrderByWorkspace.w1).toEqual(beforePaneOrder);
  });
});
