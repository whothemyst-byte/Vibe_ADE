import { describe, expect, it } from 'vitest';
import { extractDelimitedChunk, extractExecChunk, isCodexExecNoiseLine, isLikelyBinaryTerminalPayload } from '../../src/main/services/AgentProcess';

describe('agent process output filtering', () => {
  it('detects docx and zip-style binary terminal payloads', () => {
    const binaryLike = `PK\x03\x04 word/_rels/document.xml.rels [Content_Types].xml docProps/app.xml`;
    expect(isLikelyBinaryTerminalPayload(binaryLike)).toBe(true);
  });

  it('keeps normal scout markdown reports', () => {
    const report = `## KEY FILES\n- src/main.ts: entrypoint\n\n## COMMON PATTERNS\n1. Error Handling: explicit Result objects`;
    expect(isLikelyBinaryTerminalPayload(report)).toBe(false);
  });

  it('filters codex exec footer noise', () => {
    expect(isCodexExecNoiseLine('OpenAI Codex v0.0.0')).toBe(true);
    expect(isCodexExecNoiseLine('tokens used')).toBe(true);
    expect(isCodexExecNoiseLine('7,674')).toBe(true);
    expect(isCodexExecNoiseLine('TASK: TASK-001')).toBe(false);
  });

  it('extracts completed exec output even when the sentinel is not newline-terminated', () => {
    const chunk = extractExecChunk(
      'TASK: TASK-001\nTITLE: Hello\n[SWARM_CMD_DONE:coordinator-1:1]',
      '[SWARM_CMD_DONE:coordinator-1:1]'
    );

    expect(chunk).not.toBeNull();
    expect(chunk?.lines).toEqual(['TASK: TASK-001', 'TITLE: Hello']);
    expect(chunk?.remainder).toBe('');
  });

  it('extracts only the explicit codex result payload from a noisy stream', () => {
    const chunk = extractDelimitedChunk(
      'OpenAI Codex v0.118.0\n[SWARM_RESULT_BEGIN:coordinator-1:1]\nTASK: TASK-001\nTITLE: Hello\n[SWARM_RESULT_END:coordinator-1:1]\n[SWARM_CMD_DONE:coordinator-1:1]',
      '[SWARM_RESULT_BEGIN:coordinator-1:1]',
      '[SWARM_RESULT_END:coordinator-1:1]'
    );

    expect(chunk).not.toBeNull();
    expect(chunk?.lines).toEqual(['TASK: TASK-001', 'TITLE: Hello']);
    expect(chunk?.remainder).toBe('[SWARM_CMD_DONE:coordinator-1:1]');
  });
});
