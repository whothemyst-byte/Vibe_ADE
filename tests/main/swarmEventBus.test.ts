import { describe, expect, it } from 'vitest';
import { SwarmEventBus } from '../../src/main/services/SwarmEventBus';
import { AgentRole, SwarmTaskPriority, SwarmTaskStatus, type SwarmTask } from '../../src/main/types/SwarmOrchestration';

function makeTask(): SwarmTask {
  return {
    id: 'TASK-001',
    title: 'Ship evidence flow',
    description: 'Capture completion evidence and mailbox entries.',
    status: SwarmTaskStatus.QUEUED,
    fileOwnership: {
      ownedBy: 'builder-1',
      files: new Set(['src/main/services/SwarmManager.ts']),
      dependencies: []
    },
    context: {
      goal: 'Ship evidence flow',
      requirements: [],
      acceptanceCriteria: ['Evidence is stored'],
      codePatterns: 'Preserve swarm state shape.',
      constraints: []
    },
    tracking: {
      assignedAgent: 'builder-1',
      assignedAt: 0
    },
    execution: {
      role: AgentRole.BUILDER,
      reviewRequired: true
    },
    priority: SwarmTaskPriority.MEDIUM,
    estimatedMinutes: 15
  };
}

describe('SwarmEventBus projection', () => {
  it('projects mailbox and evidence events into swarm state', () => {
    const bus = new SwarmEventBus();
    const now = Date.now();
    const task = makeTask();
    let state: any = null;
    const unsubscribe = bus.onSwarmStateChange('swarm-1', (next) => {
      state = next;
    });

    bus.emit({ type: 'swarm-created', swarmId: 'swarm-1', goal: 'Improve swarm', timestamp: now });
    bus.emit({ type: 'task-created', swarmId: 'swarm-1', task, timestamp: now + 1 });
    bus.emit({
      type: 'mailbox-message-posted',
      swarmId: 'swarm-1',
      timestamp: now + 2,
      entry: {
        id: 'mail-1',
        taskId: 'TASK-001',
        fromAgentId: 'builder-1',
        toAgentId: 'scout-1',
        category: 'question',
        subject: 'Need scout input',
        body: 'Which service owns this path?',
        createdAt: now + 2
      }
    });
    bus.emit({
      type: 'task-evidence-updated',
      swarmId: 'swarm-1',
      taskId: 'TASK-001',
      timestamp: now + 3,
      evidence: {
        reportedFilesModified: ['src/main/services/SwarmManager.ts'],
        observedFilesModified: ['src/main/services/SwarmManager.ts', 'src/renderer/src/components/SwarmBoard.tsx'],
        ownershipViolations: ['src/renderer/src/components/SwarmBoard.tsx'],
        evidenceNotes: ['Observed changes not declared by builder.'],
        updatedAt: now + 3
      }
    });

    unsubscribe();
    expect(state).not.toBeNull();
    expect(state.mailbox).toHaveLength(1);
    expect(state.mailbox[0].subject).toBe('Need scout input');
    expect(state.tasks.get('TASK-001').tracking.completionEvidence.ownershipViolations).toEqual([
      'src/renderer/src/components/SwarmBoard.tsx'
    ]);
  });

  it('waits for an event scoped to the requested swarm', async () => {
    const bus = new SwarmEventBus();
    const target = bus.waitFor('tasks-decomposed', 1_000, (event) => event.swarmId === 'swarm-2');

    bus.emit({
      type: 'tasks-decomposed',
      swarmId: 'swarm-1',
      taskCount: 0,
      tasks: [],
      timestamp: Date.now()
    });

    const expectedEvent = {
      type: 'tasks-decomposed' as const,
      swarmId: 'swarm-2',
      taskCount: 1,
      tasks: [makeTask()],
      timestamp: Date.now() + 1
    };
    bus.emit(expectedEvent);

    await expect(target).resolves.toEqual(expectedEvent);
  });
});
