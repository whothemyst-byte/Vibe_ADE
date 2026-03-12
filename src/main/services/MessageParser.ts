import {
  ReviewDecision,
  SwarmMessageType,
  type BuilderCompletionMessage,
  type BuilderQuestionMessage,
  type CoordinatorOutputMessage,
  type ReviewDecisionMessage,
  type ScoutResponseMessage,
  type SwarmMessage,
  type SystemLogMessage,
  type TaskTimeoutMessage
} from '@main/types/SwarmMessages';
import type { SwarmTask } from '@main/types/SwarmOrchestration';
import { parseCoordinatorOutput } from '@main/prompts/CoordinatorPrompt';

/**
 * Extract structured swarm messages from raw terminal output.
 *
 * Parsing goals:
 * - Be strict enough to avoid false positives
 * - Be resilient to noisy logs and partial output
 * - Never throw from the main parse method (return empty array on failure)
 * - Preserve ordering (messages returned in the order they appear in output)
 */
export class MessageParser {
  /**
   * Parse raw terminal output into structured {@link SwarmMessage} instances.
   *
   * This method is resilient by design: it returns an empty array if nothing is found,
   * and logs warnings for malformed/partial matches instead of throwing.
   */
  public parseTerminalOutput(output: string, agentId: string): SwarmMessage[] {
    try {
      const text = normalizeText(output);
      if (!text) {
        return [];
      }

      const now = Date.now();
      const found: Array<{ index: number; message: SwarmMessage }> = [];

      // 1) Coordinator task plan block (TASK: ... TITLE: ...).
      const planMatch = firstMatchIndex(text, /^\s*TASK:\s*TASK-\d{3}\s*$/m);
      if (planMatch !== null) {
        const plan = text.slice(planMatch).trim();
        const message: CoordinatorOutputMessage = {
          type: SwarmMessageType.COORDINATOR_OUTPUT,
          fromAgent: agentId,
          plan,
          timestamp: now
        };
        if (this.validateStructure(message)) {
          found.push({ index: planMatch, message });
        } else {
          console.warn('[MessageParser] Invalid coordinator output structure; skipping.');
        }
      }

      // 2) Builder completion (MARK_DONE).
      for (const match of allMatches(text, /^\s*MARK_DONE:\s*(TASK-\d{3})\s*$/gm)) {
        const taskId = match.groups?.taskId ?? match.match[1] ?? '';
        const msg: BuilderCompletionMessage = {
          type: SwarmMessageType.BUILDER_COMPLETION,
          taskId,
          fromAgent: agentId,
          summary: 'MARK_DONE received.',
          filesModified: [],
          timestamp: now
        };
        if (this.validateStructure(msg)) {
          found.push({ index: match.index, message: msg });
        } else {
          console.warn(`[MessageParser] Invalid MARK_DONE line for agent=${agentId}; skipping.`);
        }
      }

      // 3) Directed messages: @scout: ... or @builder-1: ...
      for (const match of allMatches(text, /^\s*@([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$/gm)) {
        const target = match.match[1] ?? '';
        const body = (match.match[2] ?? '').trim();
        const directed = this.parseDirectedMessage(target, body, agentId, now);
        if (!directed) {
          continue;
        }
        if (this.validateStructure(directed)) {
          found.push({ index: match.index, message: directed });
        } else {
          console.warn(`[MessageParser] Invalid directed message "@${target}:" from agent=${agentId}; skipping.`);
        }
      }

      // 4) Reviewer decision block (APPROVE/REJECT).
      const reviewIndex = firstMatchIndex(text, /^\s*(APPROVE|REJECT):\s*(TASK-\d{3})\s*$/m);
      if (reviewIndex !== null) {
        const block = text.slice(reviewIndex).trim();
        const decision = this.parseReviewerDecision(block, now);
        if (decision && this.validateStructure(decision)) {
          found.push({ index: reviewIndex, message: decision });
        } else if (decision) {
          console.warn('[MessageParser] Invalid reviewer decision structure; skipping.');
        }
      }

      // 5) System patterns (timeouts, blocked, errors).
      for (const item of this.parseSystemMessages(text, agentId, now)) {
        if (this.validateStructure(item.message)) {
          found.push(item);
        } else {
          console.warn(`[MessageParser] Invalid system message structure from agent=${agentId}; skipping.`);
        }
      }

      // Order by appearance.
      found.sort((a, b) => a.index - b.index);
      return found.map((f) => f.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[MessageParser] parseTerminalOutput failed for agent=${agentId}: ${message}`);
      return [];
    }
  }

  /**
   * Parse raw coordinator plan content into swarm tasks.
   *
   * This parser is best-effort and is used primarily for validation and debugging; the orchestrator
   * has its own decomposition pipeline.
   */
  public parseCoordinatorTasks(content: string): SwarmTask[] {
    const text = normalizeText(content);
    return parseCoordinatorOutput(text);
  }

  private parseBuilderCompletion(line: string, agentId: string, now: number): BuilderCompletionMessage | null {
    const match = line.match(/^\s*MARK_DONE:\s*(TASK-\d{3})\s*$/);
    if (!match) {
      return null;
    }
    return {
      type: SwarmMessageType.BUILDER_COMPLETION,
      taskId: match[1]!,
      fromAgent: agentId,
      summary: 'MARK_DONE received.',
      filesModified: [],
      timestamp: now
    };
  }

  private parseReviewerDecision(block: string, now: number): ReviewDecisionMessage | null {
    const header = block.match(/^\s*(APPROVE|REJECT):\s*(TASK-\d{3})\s*$/m);
    if (!header) {
      return null;
    }
    const decision = header[1] === 'APPROVE' ? ReviewDecision.APPROVE : ReviewDecision.REJECT;
    const taskId = header[2]!;
    const feedback = extractFeedback(block);
    if (!feedback) {
      console.warn('[MessageParser] Reviewer decision found but missing Feedback: line.');
      return null;
    }
    return {
      type: SwarmMessageType.REVIEW_DECISION,
      taskId,
      decision,
      feedback,
      timestamp: now,
      checklist: {
        acceptanceCriteriaMet: decision === ReviewDecision.APPROVE,
        patternMatch: decision === ReviewDecision.APPROVE,
        securityOK: decision === ReviewDecision.APPROVE,
        errorHandling: decision === ReviewDecision.APPROVE,
        noUnrelatedChanges: decision === ReviewDecision.APPROVE
      }
    };
  }

  private parseDirectedMessage(target: string, body: string, fromAgent: string, now: number): BuilderQuestionMessage | ScoutResponseMessage | null {
    if (!body) {
      return null;
    }

    if (target.toLowerCase() === 'scout') {
      return {
        type: SwarmMessageType.BUILDER_QUESTION,
        fromAgent,
        toAgent: 'scout',
        question: body,
        timestamp: now
      };
    }

    if (/^builder-\d+$/i.test(target)) {
      return {
        type: SwarmMessageType.SCOUT_RESPONSE,
        fromAgent,
        toAgent: target,
        answer: body,
        timestamp: now
      };
    }

    return null;
  }

  private parseSystemMessages(
    text: string,
    agentId: string,
    now: number
  ): Array<{ index: number; message: TaskTimeoutMessage | SystemLogMessage }> {
    const messages: Array<{ index: number; message: TaskTimeoutMessage | SystemLogMessage }> = [];

    // Task timeout: "TASK-001 timeout after 15 minutes"
    for (const match of allMatches(text, /\b(TASK-\d{3})\b\s+timeout\s+after\s+(\d+)\s+minutes\b/gi)) {
      const taskId = match.match[1]!;
      const minutes = Number(match.match[2]!);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        continue;
      }
      messages.push({
        index: match.index,
        message: {
          type: SwarmMessageType.TASK_TIMEOUT,
          taskId,
          agent: agentId,
          timeElapsed: Math.round(minutes * 60_000)
        }
      });
    }

    // Generic error line: "ERROR: ..."
    for (const match of allMatches(text, /^\s*ERROR:\s*(.+)\s*$/gim)) {
      const message = (match.match[1] ?? '').trim();
      if (!message) continue;
      messages.push({
        index: match.index,
        message: {
          type: SwarmMessageType.SYSTEM_LOG,
          level: 'ERROR',
          message: sanitizeText(message, 2_000),
          agentId,
          timestamp: now
        }
      });
    }

    // Blocked: "BLOCKED: ..."
    for (const match of allMatches(text, /^\s*BLOCKED:\s*(.+)\s*$/gim)) {
      const message = (match.match[1] ?? '').trim();
      if (!message) continue;
      messages.push({
        index: match.index,
        message: {
          type: SwarmMessageType.SYSTEM_LOG,
          level: 'WARN',
          message: sanitizeText(`BLOCKED: ${message}`, 2_000),
          agentId,
          timestamp: now
        }
      });
    }

    return messages;
  }

  private validateStructure(message: SwarmMessage): boolean {
    // Fast, safe validation to avoid emitting nonsense messages.
    const MAX_TEXT = 8_000;

    const safeStr = (value: unknown, max = MAX_TEXT): value is string =>
      typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0');

    const validTaskId = (value: unknown): value is string => safeStr(value, 64) && /^TASK-\d{3}$/.test(value);
    const validAgentId = (value: unknown): value is string => safeStr(value, 64) && /^[A-Za-z0-9_-]+$/.test(value);

    switch (message.type) {
      case SwarmMessageType.COORDINATOR_OUTPUT:
        return validAgentId(message.fromAgent) && safeStr(message.plan, 200_000) && Number.isFinite(message.timestamp);
      case SwarmMessageType.BUILDER_COMPLETION:
        return validTaskId(message.taskId) && validAgentId(message.fromAgent) && safeStr(message.summary, MAX_TEXT) && Array.isArray(message.filesModified);
      case SwarmMessageType.BUILDER_QUESTION:
        return validAgentId(message.fromAgent) && safeStr(message.toAgent, 64) && safeStr(message.question, MAX_TEXT);
      case SwarmMessageType.SCOUT_RESPONSE:
        return validAgentId(message.fromAgent) && validAgentId(message.toAgent) && safeStr(message.answer, 50_000);
      case SwarmMessageType.REVIEW_DECISION:
        return validTaskId(message.taskId) && (message.decision === ReviewDecision.APPROVE || message.decision === ReviewDecision.REJECT) && safeStr(message.feedback, 50_000);
      case SwarmMessageType.TASK_TIMEOUT:
        return validTaskId(message.taskId) && validAgentId(message.agent) && Number.isFinite(message.timeElapsed) && message.timeElapsed > 0;
      case SwarmMessageType.SYSTEM_LOG:
        return (message.level === 'INFO' || message.level === 'WARN' || message.level === 'ERROR') && safeStr(message.message, 50_000);
      default:
        return true;
    }
  }
}

/**
 * Parse agent output using a role-specific strategy.
 *
 * This is a convenience wrapper around {@link MessageParser}.
 */
export function parseAgentOutput(agentId: string, output: string, agentRole: string): SwarmMessage[] {
  const parser = new MessageParser();
  const messages = parser.parseTerminalOutput(output, agentId);
  const role = agentRole.trim().toLowerCase();

  // Filter by role to avoid accidental cross-role matches.
  return messages.filter((msg) => {
    if (role === 'coordinator') {
      return msg.type === SwarmMessageType.COORDINATOR_OUTPUT;
    }
    if (role === 'builder') {
      return (
        msg.type === SwarmMessageType.BUILDER_COMPLETION ||
        msg.type === SwarmMessageType.BUILDER_QUESTION ||
        msg.type === SwarmMessageType.SYSTEM_LOG ||
        msg.type === SwarmMessageType.TASK_TIMEOUT
      );
    }
    if (role === 'reviewer') {
      return msg.type === SwarmMessageType.REVIEW_DECISION || msg.type === SwarmMessageType.SYSTEM_LOG;
    }
    if (role === 'scout') {
      return msg.type === SwarmMessageType.SCOUT_RESPONSE || msg.type === SwarmMessageType.SYSTEM_LOG;
    }
    return true;
  });
}

/**
 * Extract a completion/review signal string from output (if present).
 */
export function extractCompletionSignal(output: string): string | null {
  const text = normalizeText(output);
  const markDone = text.match(/^\s*MARK_DONE:\s*(TASK-\d{3})\s*$/m);
  if (markDone) {
    return `MARK_DONE: ${markDone[1]}`;
  }
  const review = text.match(/^\s*(APPROVE|REJECT):\s*(TASK-\d{3})\s*$/m);
  if (review) {
    return `${review[1]}: ${review[2]}`;
  }
  return null;
}

function normalizeText(value: string): string {
  const text = value.replace(/\r\n/g, '\n').trim();
  return text;
}

function sanitizeText(value: string, maxLen: number): string {
  const noNull = value.replace(/\0/g, '');
  if (noNull.length <= maxLen) {
    return noNull;
  }
  return noNull.slice(0, maxLen);
}

function firstMatchIndex(text: string, pattern: RegExp): number | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return match.index;
}

function allMatches(text: string, pattern: RegExp): Array<{ index: number; match: RegExpMatchArray; groups?: Record<string, string> }> {
  const matches: Array<{ index: number; match: RegExpMatchArray; groups?: Record<string, string> }> = [];
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text)) !== null) {
    matches.push({ index: m.index, match: m, groups: (m.groups as Record<string, string> | undefined) ?? undefined });
    if (m.index === re.lastIndex) {
      re.lastIndex += 1;
    }
  }
  return matches;
}

function extractFeedback(block: string): string {
  const match = block.match(/^\s*Feedback:\s*(.*)$/m);
  if (!match) return '';

  const start = (match.index ?? 0);
  const after = block.slice(start);
  const lines = after.split('\n');
  const first = lines[0]!.replace(/^\s*Feedback:\s*/, '').trim();
  const rest: string[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('Blockers:')) break;
    if (/^(APPROVE|REJECT):/.test(trimmed)) break;
    rest.push(lines[i]!);
  }
  return [first, ...rest].join('\n').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTaskBlocks(text: string): string[][] {
  const lines = text.split('\n');
  const blocks: string[][] = [];
  let current: string[] = [];

  const flush = () => {
    const cleaned = current.map((l) => l.trimEnd());
    if (cleaned.some((l) => l.trim().length > 0)) {
      blocks.push(cleaned);
    }
    current = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('TASK:')) {
      flush();
    }
    current.push(line);
  }
  flush();
  return blocks;
}

function readRequiredLineValue(lines: readonly string[], prefix: string): string {
  const line = lines.find((l) => l.trimStart().startsWith(prefix));
  if (!line) {
    throw new Error(`Missing required line "${prefix}" in task block.`);
  }
  const value = line.slice(line.indexOf(prefix) + prefix.length).trim();
  if (!value) {
    throw new Error(`Line "${prefix}" must have a value.`);
  }
  return value;
}
