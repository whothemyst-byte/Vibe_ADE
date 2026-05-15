import { describe, it, expect, beforeEach } from 'vitest';
import { FileOwnershipManager } from '@main/services/FileOwnershipManager';
import { buildFileOwnershipSnapshot } from '@main/ipc/fileOwnershipHandlers';
import type { SwarmTask, SwarmTaskPriority, SwarmTaskStatus } from '@main/types/SwarmOrchestration';

function makeTask(id: string, agentId: string, files: string[]): SwarmTask {
  return {
    id,
    title: id,
    description: '',
    status: 'QUEUED' as SwarmTaskStatus,
    fileOwnership: {
      ownedBy: agentId,
      files: new Set(files),
      dependencies: []
    },
    context: {
      goal: '',
      requirements: [],
      acceptanceCriteria: [],
      codePatterns: '',
      constraints: []
    },
    tracking: { assignedAgent: agentId, assignedAt: 0 },
    priority: 'medium' as SwarmTaskPriority,
    estimatedMinutes: 5
  };
}

describe('buildFileOwnershipSnapshot', () => {
  beforeEach(() => {
    FileOwnershipManager.getInstance().resetForTesting();
  });

  it('returns empty snapshot when nothing is owned', () => {
    const snap = buildFileOwnershipSnapshot();
    expect(snap.byFile).toEqual({});
    expect(snap.byTask).toEqual({});
  });

  it('returns owners by file and files by task after assignment', () => {
    const mgr = FileOwnershipManager.getInstance();
    mgr.assignOwnership(makeTask('TASK-A', 'agent-1', ['src/a.ts', 'src/b.ts']), 'agent-1');
    mgr.assignOwnership(makeTask('TASK-B', 'agent-2', ['src/c.ts']), 'agent-2');

    const snap = buildFileOwnershipSnapshot();
    expect(snap.byFile).toEqual({
      'src/a.ts': 'agent-1',
      'src/b.ts': 'agent-1',
      'src/c.ts': 'agent-2'
    });
    expect(new Set(snap.byTask['TASK-A'])).toEqual(new Set(['src/a.ts', 'src/b.ts']));
    expect(snap.byTask['TASK-B']).toEqual(['src/c.ts']);
  });
});
