import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { MessageRouter } from '../../src/main/services/MessageRouter';
import { SwarmMessageType, type CoordinatorOutputMessage } from '../../src/main/types/SwarmMessages';

describe('MessageRouter coordinator retry', () => {
  it('requests a bounded retry when coordinator output has empty FILES_TO_MODIFY', async () => {
    const orchestrator = {
      decomposeTasks: vi.fn(() => {
        throw new Error('Invalid plan for TASK-001: FILES_TO_MODIFY must contain at least one file.');
      }),
      createTasks: vi.fn()
    } as never;

    const messenger = {
      sendToAgent: vi.fn()
    };

    const emitter = new EventEmitter();
    const router = new MessageRouter(orchestrator, messenger, emitter);

    const msg: CoordinatorOutputMessage = {
      type: SwarmMessageType.COORDINATOR_OUTPUT,
      fromAgent: 'coordinator-1',
      plan: 'TASK: TASK-001\nTITLE: X\nROLE: builder\nDESCRIPTION: Y\nFILES_TO_MODIFY: []\nDEPENDENCIES: []\nACCEPTANCE_CRITERIA:\n- ok\n',
      timestamp: Date.now()
    };

    router.routeMessage(msg, 'swarm-1');
    await new Promise((r) => setImmediate(r));

    router.routeMessage(msg, 'swarm-1');
    await new Promise((r) => setImmediate(r));

    router.routeMessage(msg, 'swarm-1');
    await new Promise((r) => setImmediate(r));

    expect(messenger.sendToAgent).toHaveBeenCalledTimes(2);
    expect(messenger.sendToAgent).toHaveBeenCalledWith('coordinator-1', expect.stringContaining('FORMAT ERROR'));
    expect(messenger.sendToAgent).toHaveBeenCalledWith('coordinator-1', expect.stringContaining('FILES_TO_MODIFY'));
  });
});

