import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceState } from '../../src/shared/types';
import { buildHarnessPrompt, getHarnessSubmitControls, resolveHarnessProvider } from '../../src/renderer/src/services/agentHarness';
import { useWorkspaceStore } from '../../src/renderer/src/state/workspaceStore';

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'run-1')
}));

function makeWorkspace(modelId: string): WorkspaceState {
  const now = new Date().toISOString();
  return {
    id: 'w1',
    name: 'Workspace',
    rootDir: process.cwd(),
    workspaceMode: 'chat',
    selectedModelId: modelId,
    layout: {
      id: 'layout-1',
      type: 'pane',
      paneId: 'pane-1'
    },
    paneTypes: {
      'pane-1': 'terminal'
    },
    paneShells: {
      'pane-1': 'powershell'
    },
    browserPanes: {},
    activePaneId: 'pane-1',
    commandBlocks: {
      'pane-1': []
    },
    chatMessages: [],
    runs: [],
    tasks: [],
    createdAt: now,
    updatedAt: now
  };
}

describe('workspaceStore harness submit path', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['codex-5', 'codex'],
    ['claude-3.7-sonnet', 'claude'],
    ['gemini-2.5-pro', 'gemini']
  ])('submits wrapped harness prompts with provider controls for %s', async (modelId, expectedProvider) => {
    const sendInput = vi.fn().mockResolvedValue(undefined);
    const dispatchEvent = vi.fn();

    vi.stubGlobal('window', {
      dispatchEvent,
      vibeAde: {
        terminal: {
          sendInput
        },
        workspace: {
          updateSubscription: vi.fn()
        }
      }
    });

    useWorkspaceStore.setState((state) => ({
      ...state,
      appState: {
        activeWorkspaceId: 'w1',
        workspaces: [makeWorkspace(modelId)],
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
        terminalReadyByPane: {
          'pane-1': true
        },
        activeRunByPane: {},
        terminalRunQueueByPane: {},
        runEventsByWorkspace: {}
      }
    }));

    await useWorkspaceStore.getState().startWorkspaceChat('w1', {
      paneId: 'pane-1',
      message: '  Fix the failing submit path  ',
      modelId
    });

    const submittedPrompt = buildHarnessPrompt({
      provider: resolveHarnessProvider(modelId),
      runId: 'run-1',
      prompt: 'Fix the failing submit path'
    });
    const controls = getHarnessSubmitControls(resolveHarnessProvider(modelId));

    expect(resolveHarnessProvider(modelId)).toBe(expectedProvider);
    expect(sendInput).toHaveBeenCalledTimes(1 + controls.submitSequence.length);
    expect(sendInput).toHaveBeenNthCalledWith(1, 'pane-1', submittedPrompt);
    controls.submitSequence.forEach((key, index) => {
      expect(sendInput).toHaveBeenNthCalledWith(index + 2, 'pane-1', key);
    });
    expect(useWorkspaceStore.getState().ui.activeRunByPane['pane-1']).toBe('run-1');
    expect(useWorkspaceStore.getState().ui.terminalRunQueueByPane['pane-1']).toEqual(['run-1']);
    expect(useWorkspaceStore.getState().appState.workspaces[0]?.runs[0]?.status).toBe('running');
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });
});
