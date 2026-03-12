import { describe, expect, it } from 'vitest';
import { SwarmOrchestrator } from '../../src/main/services/SwarmOrchestrator';

function uniqueSwarmId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

describe('SwarmOrchestrator coordinator plan parsing', () => {
  it('allows empty FILES_TO_MODIFY for scout tasks', () => {
    const orchestrator = SwarmOrchestrator.getInstance();
    const swarmId = uniqueSwarmId('swarm-scout');
    orchestrator.createSwarm(swarmId, 'Test goal', '.');

    const plan = [
      'TASK: TASK-001',
      'TITLE: Analyze requirements',
      'ROLE: scout',
      'DESCRIPTION: Review the goal and propose an approach.',
      'FILES_TO_MODIFY: []',
      'DEPENDENCIES: []',
      'ACCEPTANCE_CRITERIA:',
      '- Summarize key requirements'
    ].join('\n');

    const tasks = orchestrator.decomposeTasks(swarmId, plan);
    expect(tasks).toHaveLength(1);
    expect(Array.from(tasks[0]!.fileOwnership.files)).toEqual([]);
  });

  it('rejects empty FILES_TO_MODIFY for builder tasks', () => {
    const orchestrator = SwarmOrchestrator.getInstance();
    const swarmId = uniqueSwarmId('swarm-builder');
    orchestrator.createSwarm(swarmId, 'Test goal', '.');

    const plan = [
      'TASK: TASK-001',
      'TITLE: Implement feature',
      'ROLE: builder',
      'DESCRIPTION: Build the thing.',
      'FILES_TO_MODIFY: []',
      'DEPENDENCIES: []',
      'ACCEPTANCE_CRITERIA:',
      '- It works'
    ].join('\n');

    expect(() => orchestrator.decomposeTasks(swarmId, plan)).toThrow('FILES_TO_MODIFY must contain at least one file');
  });
});

