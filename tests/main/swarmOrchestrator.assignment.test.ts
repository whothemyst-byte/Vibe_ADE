import { afterEach, describe, expect, it } from 'vitest';
import { SwarmOrchestrator } from '../../src/main/services/SwarmOrchestrator';
import { AgentRole, SwarmTaskStatus } from '../../src/main/types/SwarmOrchestration';

function uniqueSwarmId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

describe('SwarmOrchestrator assignment recovery', () => {
  const createdSwarmIds: string[] = [];

  afterEach(() => {
    const orchestrator = SwarmOrchestrator.getInstance();
    while (createdSwarmIds.length > 0) {
      orchestrator.removeSwarm(createdSwarmIds.pop()!);
    }
  });

  it('requeues a task when assignment delivery must be rolled back', () => {
    const orchestrator = SwarmOrchestrator.getInstance();
    const swarmId = uniqueSwarmId('swarm-rollback');
    createdSwarmIds.push(swarmId);

    orchestrator.createSwarm(swarmId, 'Test rollback', '.');
    orchestrator.registerAgent(swarmId, 'builder-1', AgentRole.BUILDER);

    const plan = [
      'TASK: TASK-001',
      'TITLE: Patch runtime',
      'ROLE: builder',
      'DESCRIPTION: Update the runtime path.',
      'FILES_TO_MODIFY: [src/main/services/SwarmManager.ts]',
      'DEPENDENCIES: []',
      'ACCEPTANCE_CRITERIA:',
      '- Runtime accepts the patch'
    ].join('\n');

    const tasks = orchestrator.decomposeTasks(swarmId, plan);
    orchestrator.createTasks(swarmId, tasks);
    orchestrator.assignTaskToAgent(swarmId, 'TASK-001', 'builder-1');
    orchestrator.releaseTaskAssignment(swarmId, 'TASK-001', 'builder-1', 'Dispatch failed');

    const state = orchestrator.getSwarmState(swarmId);
    const task = state.tasks.get('TASK-001');
    const agent = state.agents.get('builder-1');

    expect(task?.status).toBe(SwarmTaskStatus.QUEUED);
    expect(task?.tracking.assignedAgent).toBeUndefined();
    expect(task?.fileOwnership.ownedBy).toBe(`reserved:${swarmId}:TASK-001`);
    expect(agent?.status).toBe('IDLE');
    expect(agent?.currentTask).toBeUndefined();
    expect(agent?.lastMessage).toBe('Dispatch failed');
  });
});
