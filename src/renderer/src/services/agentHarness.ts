import type { WorkspaceRun } from '@shared/types';

export type HarnessProvider = 'codex' | 'claude' | 'gemini';

interface RunMarkers {
  start: string;
  end: string;
}

export interface HarnessSubmitControls {
  promptSettleDelayMs: number;
  submitKeyDelayMs: number;
  submitSequence: readonly string[];
}

interface RunOutputState {
  assistantContent: string;
  rawOutput: string;
  parserState: WorkspaceRun['parserState'];
  degraded: boolean;
  completed: boolean;
}

const DEFAULT_SUBMIT_CONTROLS: HarnessSubmitControls = {
  promptSettleDelayMs: 20,
  submitKeyDelayMs: 0,
  submitSequence: ['\r']
};

const CODEX_SUBMIT_CONTROLS: HarnessSubmitControls = {
  promptSettleDelayMs: 120,
  submitKeyDelayMs: 120,
  submitSequence: ['\r', '\r']
};

function markersFor(runId: string): RunMarkers {
  return {
    start: `__VIBE_RUN_STARTED__:${runId}`,
    end: `__VIBE_RUN_COMPLETED__:${runId}`
  };
}

export function resolveHarnessProvider(modelId: string): HarnessProvider {
  const normalized = modelId.trim().toLowerCase();
  if (normalized.includes('claude')) {
    return 'claude';
  }
  if (normalized.includes('gemini')) {
    return 'gemini';
  }
  return 'codex';
}

export function getHarnessSubmitControls(provider: HarnessProvider): HarnessSubmitControls {
  if (provider === 'codex') {
    return CODEX_SUBMIT_CONTROLS;
  }
  return DEFAULT_SUBMIT_CONTROLS;
}

function providerPreamble(provider: HarnessProvider): string {
  if (provider === 'claude') {
    return 'You are running in a structured harness. Do not omit markers.';
  }
  if (provider === 'gemini') {
    return 'Respond in harness mode with exact marker lines.';
  }
  return 'Respond as a coding agent in harness mode with exact marker lines.';
}

export function buildHarnessPrompt(input: {
  provider: HarnessProvider;
  runId: string;
  prompt: string;
}): string {
  const markers = markersFor(input.runId);
  if (input.provider === 'codex') {
    // Codex CLI switches to multiline compose when the submitted payload contains line breaks.
    // Keep the harness wrapper single-line so Enter submits immediately.
    return [
      providerPreamble(input.provider),
      `Print this marker on its own line first: ${markers.start}.`,
      'Then provide your response content.',
      `Print this marker on its own line last: ${markers.end}.`,
      `User request: ${input.prompt}`
    ].join(' ');
  }
  return [
    providerPreamble(input.provider),
    `Print this marker on its own line first: ${markers.start}`,
    'Then provide your response content.',
    `Print this marker on its own line last: ${markers.end}`,
    '',
    input.prompt
  ].join('\n');
}

export function deriveRunOutputState(run: WorkspaceRun, incomingRawChunk: string): RunOutputState {
  const markers = markersFor(run.id);
  const rawOutput = `${run.rawOutput}${incomingRawChunk}`;
  const provider = resolveHarnessProvider(run.modelId);
  const startLine = findMarkerLine(rawOutput, markers.start);
  const hasStart = Boolean(startLine);
  const contentStart = startLine?.contentStart ?? 0;
  const endLine = startLine ? findMarkerLine(rawOutput, markers.end, contentStart) : null;
  const hasEnd = Boolean(endLine);

  if (hasStart && hasEnd) {
    const assistantContent = rawOutput.slice(contentStart, endLine.lineStart).trimStart();
    return {
      assistantContent,
      rawOutput,
      parserState: 'streaming',
      degraded: run.degraded,
      completed: true
    };
  }

  if (hasStart) {
    const assistantContent = rawOutput.slice(contentStart);
    return {
      assistantContent,
      rawOutput,
      parserState: 'streaming',
      degraded: run.degraded,
      completed: false
    };
  }

  const fallbackThreshold = provider === 'codex' ? 240 : 1200;
  const shouldDegrade = rawOutput.length > fallbackThreshold || run.degraded;
  if (shouldDegrade) {
    return {
      assistantContent: rawOutput,
      rawOutput,
      parserState: 'degraded',
      degraded: true,
      completed: false
    };
  }

  return {
    assistantContent: run.assistantContent,
    rawOutput,
    parserState: 'awaiting_start',
    degraded: false,
    completed: false
  };
}

function findMarkerLine(
  content: string,
  marker: string,
  fromIndex = 0
): { lineStart: number; contentStart: number } | null {
  const escaped = escapeRegex(marker);
  const linePattern = new RegExp(`(?:^|\\n)[\\t >*+-]*${escaped}[\\t ]*(?=\\n|$)`, 'g');
  linePattern.lastIndex = fromIndex;
  const match = linePattern.exec(content);
  if (!match) {
    return null;
  }
  const markerIndex = content.indexOf(marker, match.index);
  if (markerIndex < 0) {
    return null;
  }
  const lineStart = content.lastIndexOf('\n', markerIndex) + 1;
  const lineEnd = content.indexOf('\n', markerIndex);
  const contentStart = lineEnd === -1 ? content.length : lineEnd + 1;
  return { lineStart, contentStart };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
