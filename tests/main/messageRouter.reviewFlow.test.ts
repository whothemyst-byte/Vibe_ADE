import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { MessageRouter } from '../../src/main/services/MessageRouter';
import { AgentRole, SwarmTaskPriority, SwarmTaskStatus, type SwarmSharedContext, type SwarmState, type SwarmTask } from '../../src/main/types/SwarmOrchestration';
import { SwarmMessageType, type BuilderCompletionMessage } from '../../src/main/types/SwarmMessages';

function makeTask(): SwarmTask {
  return {
    id: 'TASK-001',
    title: 'Capture runtime evidence',
    description: 'Store reviewer evidence on task completion.',
    status: SwarmTaskStatus.REVIEWING,
    fileOwnership: {
      ownedBy: 'builder-1',
      files: new Set(['src/main/services/SwarmManager.ts']),
      dependencies: []
    },
    context: {
      goal: 'Capture runtime evidence',
      requirements: [],
      acceptanceCriteria: ['Evidence is visible to reviewer'],
      codePatterns: 'Keep prompts explicit.',
      constraints: []
    },
    tracking: {
      assignedAgent: 'builder-1',
      assignedAt: 0,
      feedback: 'Builder summary.',
      completionEvidence: {
        reportedFilesModified: ['src/main/services/SwarmManager.ts'],
        observedFilesModified: ['src/main/services/SwarmManager.ts', 'src/renderer/src/components/SwarmBoard.tsx'],
        ownershipViolations: ['src/renderer/src/components/SwarmBoard.tsx'],
        evidenceNotes: ['Observed changes not declared by builder.'],
        updatedAt: 123
      },
      filesModified: ['src/main/services/SwarmManager.ts', 'src/renderer/src/components/SwarmBoard.tsx']
    },
    execution: {
      role: AgentRole.BUILDER,
      reviewRequired: true
    },
    priority: SwarmTaskPriority.MEDIUM,
    estimatedMinutes: 15
  };
}

describe('MessageRouter review flow', () => {
  it('forwards completion evidence into the reviewer prompt', async () => {
    const task = makeTask();
    const sharedContext: SwarmSharedContext = {
      codebaseStructure: 'src/',
      conventions: 'Use explicit types.',
      existingPatterns: 'Service classes.',
      security: 'Validate inputs.',
      testing: 'Add targeted tests.',
      scoutFindings: 'Swarm services live in src/main/services.',
      scoutUpdatedAt: 1
    };
    const swarmState: SwarmState = {
      swarmId: 'swarm-1',
      overallGoal: 'Improve swarm',
      createdAt: 1,
      tasks: new Map([['TASK-001', task]]),
      fileOwnershipMap: new Map(),
      agents: new Map([
        ['builder-1', { agentId: 'builder-1', role: AgentRole.BUILDER, status: 'WAITING', currentTask: 'TASK-001', assignedTasks: ['TASK-001'], lastActivity: 1, responseTime: 0 }],
        ['reviewer-1', { agentId: 'reviewer-1', role: AgentRole.REVIEWER, status: 'IDLE', assignedTasks: [], lastActivity: 1, responseTime: 0 }]
      ]),
      parallelGroups: [],
      dependencies: new Map(),
      sharedContext,
      mailbox: [],
      taskArtifacts: new Map()
    };

    const orchestrator = {
      taskCompleted: vi.fn(),
      getSwarmState: vi.fn(() => swarmState)
    } as never;
    const messenger = { sendToAgent: vi.fn() };
    const emitter = new EventEmitter();
    const router = new MessageRouter(orchestrator, messenger, emitter, {
      resolveSharedContext: () => sharedContext,
      resolveTaskCompletionEvidence: async () => task.tracking.completionEvidence ?? null
    });

    const msg: BuilderCompletionMessage = {
      type: SwarmMessageType.BUILDER_COMPLETION,
      taskId: 'TASK-001',
      fromAgent: 'builder-1',
      summary: 'Done.',
      filesModified: ['src/main/services/SwarmManager.ts'],
      timestamp: Date.now()
    };

    router.routeMessage(msg, 'swarm-1');
    await new Promise((resolve) => setImmediate(resolve));

    expect(orchestrator.taskCompleted).toHaveBeenCalledWith(
      'swarm-1',
      'TASK-001',
      'builder-1',
      'Done.',
      ['src/main/services/SwarmManager.ts'],
      task.tracking.completionEvidence
    );
    expect(messenger.sendToAgent).toHaveBeenCalledWith(
      'reviewer-1',
      expect.stringContaining('OWNERSHIP VIOLATIONS: src/renderer/src/components/SwarmBoard.tsx')
    );
    expect(messenger.sendToAgent).toHaveBeenCalledWith(
      'reviewer-1',
      expect.stringContaining('OBSERVED FILES_MODIFIED: src/main/services/SwarmManager.ts, src/renderer/src/components/SwarmBoard.tsx')
    );
  });
});
