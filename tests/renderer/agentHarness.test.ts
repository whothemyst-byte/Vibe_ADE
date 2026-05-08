import { describe, expect, it } from 'vitest';
import { buildHarnessPrompt, getHarnessSubmitControls, resolveHarnessProvider } from '../../src/renderer/src/services/agentHarness';
import type { WorkspaceRun } from '../../src/shared/types';

describe('agentHarness', () => {
  it.each([
    ['claude-3.7-sonnet', 'claude'],
    ['gemini-2.5-pro', 'gemini'],
    ['codex', 'codex'],
    ['  Claude  ', 'claude']
  ])('resolves %s to %s', (modelId, expected) => {
    expect(resolveHarnessProvider(modelId)).toBe(expected);
  });

  it('builds a single-line codex harness prompt to avoid multiline compose mode', () => {
    expect(
      buildHarnessPrompt({
        provider: 'codex',
        runId: 'run-123',
        prompt: 'Fix the failing submit path'
      })
    ).toBe(
      [
        'Respond as a coding agent in harness mode with exact marker lines.',
        'Print this marker on its own line first: __VIBE_RUN_STARTED__:run-123.',
        'Then provide your response content.',
        'Print this marker on its own line last: __VIBE_RUN_COMPLETED__:run-123.',
        'User request: Fix the failing submit path'
      ].join(' ')
    );
  });

  it.each([
    [
      'claude',
      'You are running in a structured harness. Do not omit markers.'
    ],
    [
      'gemini',
      'Respond in harness mode with exact marker lines.'
    ]
  ])('builds a %s multiline harness prompt with the provider-specific preamble', (provider, preamble) => {
    expect(
      buildHarnessPrompt({
        provider,
        runId: 'run-123',
        prompt: 'Fix the failing submit path'
      })
    ).toBe([
      preamble,
      'Print this marker on its own line first: __VIBE_RUN_STARTED__:run-123',
      'Then provide your response content.',
      'Print this marker on its own line last: __VIBE_RUN_COMPLETED__:run-123',
      '',
      'Fix the failing submit path'
    ].join('\n'));
  });

  it('uses a two-step submit key sequence for codex', () => {
    expect(getHarnessSubmitControls('codex').submitSequence).toEqual(['\r', '\r']);
  });

  it('parses only marker lines and ignores marker text embedded in instructions', async () => {
    const { deriveRunOutputState } = await import('../../src/renderer/src/services/agentHarness');
    const run: WorkspaceRun = {
      id: 'run-123',
      workspaceId: 'w1',
      paneId: 'pane-1',
      modelId: 'gemini',
      prompt: 'Hi',
      status: 'running',
      assistantContent: '',
      rawOutput: '',
      parserState: 'awaiting_start',
      degraded: false,
      queuedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const raw = [
      '> Print this marker on its own line first: __VIBE_RUN_STARTED__:run-123',
      'Then provide your response content.',
      '> __VIBE_RUN_STARTED__:run-123',
      'Actual assistant answer',
      '__VIBE_RUN_COMPLETED__:run-123'
    ].join('\n');

    const state = deriveRunOutputState(run, raw);
    expect(state.assistantContent.trim()).toBe('Actual assistant answer');
    expect(state.completed).toBe(true);
  });
});
