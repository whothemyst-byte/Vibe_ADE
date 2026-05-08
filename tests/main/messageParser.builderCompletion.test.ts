import { describe, expect, it } from 'vitest';
import { MessageParser } from '../../src/main/services/MessageParser';
import { SwarmMessageType } from '../../src/main/types/SwarmMessages';

describe('MessageParser builder completion evidence', () => {
  it('extracts FILES_MODIFIED alongside MARK_DONE', () => {
    const parser = new MessageParser();
    const messages = parser.parseTerminalOutput(
      [
        'Implemented the task.',
        'FILES_MODIFIED: [src/main/prompts/BuilderPrompt.ts, tests/main/swarmPromptBuilders.test.ts]',
        'MARK_DONE: TASK-001'
      ].join('\n'),
      'builder-1'
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe(SwarmMessageType.BUILDER_COMPLETION);
    if (messages[0]?.type === SwarmMessageType.BUILDER_COMPLETION) {
      expect(messages[0].filesModified).toEqual([
        'src/main/prompts/BuilderPrompt.ts',
        'tests/main/swarmPromptBuilders.test.ts'
      ]);
    }
  });
});
