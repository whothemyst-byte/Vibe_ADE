import { EventEmitter } from 'node:events';
import { AgentRole, type SwarmState } from '@main/types/SwarmOrchestration';
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
import { buildReviewerPrompt } from '@main/prompts/ReviewerPrompt';
import { SwarmOrchestrator } from '@main/services/SwarmOrchestrator';

/**
 * Minimal terminal relay interface used by {@link MessageRouter}.
 *
 * This avoids binding the router to a specific PTY implementation.
 */
export interface AgentMessenger {
  sendToAgent(agentId: string, message: string): void;
}

type RouterEvents = {
  'message-routing-failed': { swarmId: string; messageType: string; error: string; timestamp: number };
  'message-routed': { swarmId: string; messageType: string; timestamp: number };
  'review-requested': { swarmId: string; taskId: string; reviewerId: string; timestamp: number };
};

/**
 * Route parsed {@link SwarmMessage} instances to their targets (orchestrator, terminals, UI events).
 *
 * This class is designed to be:
 * - Order-preserving per swarm (via an internal queue)
 * - Fail-safe: routing errors emit events and logs, without crashing the process
 */
export class MessageRouter {
  private readonly queueBySwarm = new Map<string, Promise<void>>();
  private readonly coordinatorRetryBySwarm = new Map<string, number>();

  constructor(
    private orchestrator: SwarmOrchestrator,
    private messenger: AgentMessenger,
    private eventEmitter: EventEmitter
  ) {}

  /**
   * Route messages in order, preserving the sequence they were received for a given swarm.
   */
  public routeMessages(messages: readonly SwarmMessage[], swarmId: string): void {
    this.enqueue(swarmId, async () => {
      for (const message of messages) {
        this.routeMessageNow(message, swarmId);
      }
    });
  }

  /**
   * Route a single message to the appropriate handler.
   */
  public routeMessage(message: SwarmMessage, swarmId: string): void {
    this.enqueue(swarmId, async () => {
      this.routeMessageNow(message, swarmId);
    });
  }

  private routeMessageNow(message: SwarmMessage, swarmId: string): void {
    const now = Date.now();
    const source = this.describeSource(message);
    const detail = this.describeMessageDetail(message);
    console.log(`[${new Date(now).toISOString()}] [MESSAGE] source: ${source}, type: ${message.type}${detail ? `, ${detail}` : ''}`);

    try {
      switch (message.type) {
        case SwarmMessageType.COORDINATOR_OUTPUT:
          this.handleCoordinatorOutput(message, swarmId);
          break;
        case SwarmMessageType.BUILDER_COMPLETION:
          this.handleBuilderCompletion(message, swarmId);
          break;
        case SwarmMessageType.BUILDER_QUESTION:
          this.handleBuilderQuestion(message, swarmId);
          break;
        case SwarmMessageType.SCOUT_RESPONSE:
          this.handleScoutResponse(message, swarmId);
          break;
        case SwarmMessageType.REVIEW_DECISION:
          this.handleReviewerDecision(message, swarmId);
          break;
        case SwarmMessageType.TASK_TIMEOUT:
          this.handleTaskTimeout(message, swarmId);
          break;
        case SwarmMessageType.SYSTEM_LOG:
          this.handleSystemLog(message, swarmId);
          break;
        default:
          console.warn(`[${new Date(now).toISOString()}] [ROUTING] Unhandled message type: ${message.type}`);
      }

      this.eventEmitter.emit('message-routed', { swarmId, messageType: message.type, timestamp: now } satisfies RouterEvents['message-routed']);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${new Date(now).toISOString()}] [ROUTING] Failed type=${message.type}: ${errorMessage}`);

      if (message.type === SwarmMessageType.COORDINATOR_OUTPUT) {
        this.maybeRequestCoordinatorRetry(message, swarmId, errorMessage);
      }

      this.eventEmitter.emit('message-routing-failed', {
        swarmId,
        messageType: message.type,
        error: errorMessage,
        timestamp: now
      } satisfies RouterEvents['message-routing-failed']);
    }
  }

  private handleCoordinatorOutput(msg: CoordinatorOutputMessage, swarmId: string): void {
    console.log(`[${new Date(Date.now()).toISOString()}] [ROUTING] COORDINATOR_OUTPUT -> orchestrator.decomposeTasks()`);
    const tasks = this.orchestrator.decomposeTasks(swarmId, msg.plan);
    this.orchestrator.createTasks(swarmId, tasks);
    this.coordinatorRetryBySwarm.delete(swarmId);
  }

  private maybeRequestCoordinatorRetry(msg: CoordinatorOutputMessage, swarmId: string, errorMessage: string): void {
    const maxRetries = 2;
    const retryCount = this.coordinatorRetryBySwarm.get(swarmId) ?? 0;
    if (retryCount >= maxRetries) {
      return;
    }

    const shouldRetry =
      errorMessage.includes('FILES_TO_MODIFY must contain at least one file')
      || errorMessage.includes('missing TASK:')
      || errorMessage.includes('missing TITLE:')
      || errorMessage.includes('missing DESCRIPTION:');

    if (!shouldRetry) {
      return;
    }

    this.coordinatorRetryBySwarm.set(swarmId, retryCount + 1);

    const guidance = [
      '[FORMAT ERROR]',
      `Your last output could not be parsed: ${errorMessage}`,
      '',
      'Re-output the full task plan in the required format.',
      'Important:',
      '- For ROLE: builder tasks, FILES_TO_MODIFY must list at least one concrete file path (it can be a new file).',
      '- If the target folder is empty/greenfield, propose the initial files (e.g. index.html, styles.css).',
      '',
      'Example (minimal):',
      'TASK: TASK-001',
      'TITLE: Create hello world page',
      'ROLE: builder',
      'DESCRIPTION: Create a minimal HTML page and matching CSS file in the target folder.',
      'FILES_TO_MODIFY: [index.html, styles.css]',
      'DEPENDENCIES: []',
      'ACCEPTANCE_CRITERIA:',
      '- Opening index.html shows "Hello world"',
      '- styles.css is linked and applies basic styling',
      '',
      'Now output 3-5 tasks in that exact structure (no extra text).'
    ].join('\r\n');

    try {
      this.sendToAgent(msg.fromAgent, `${guidance}\r\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[${new Date(Date.now()).toISOString()}] [ROUTING] Failed to request coordinator retry: ${message}`);
    }
  }

  private handleBuilderCompletion(msg: BuilderCompletionMessage, swarmId: string): void {
    console.log(`[${new Date(Date.now()).toISOString()}] [ROUTING] BUILDER_COMPLETION -> orchestrator.taskCompleted()`);
    this.orchestrator.taskCompleted(swarmId, msg.taskId, msg.fromAgent, msg.summary || 'Completed.');

    const state = this.orchestrator.getSwarmState(swarmId);
    const task = state.tasks.get(msg.taskId);
    if (!task) {
      console.warn(`[${new Date(Date.now()).toISOString()}] [ROUTING] Task not found after completion: ${msg.taskId}`);
      return;
    }

    // Only request an explicit review if the orchestrator put the task into REVIEWING.
    if (task.status !== 'REVIEWING') {
      return;
    }

    const reviewerId = this.resolveAgentByRole(state, AgentRole.REVIEWER) ?? 'reviewer-1';
    const prompt = buildReviewerPrompt(task, task.context.acceptanceCriteria);
    try {
      this.sendToAgent(reviewerId, `${prompt}\r\n`);
      this.eventEmitter.emit('review-requested', { swarmId, taskId: msg.taskId, reviewerId, timestamp: Date.now() } satisfies RouterEvents['review-requested']);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[${new Date(Date.now()).toISOString()}] [ROUTING] No reviewer available for ${msg.taskId}: ${message}`);
    }
  }

  private handleBuilderQuestion(msg: BuilderQuestionMessage, swarmId: string): void {
    const state = this.orchestrator.getSwarmState(swarmId);
    const scoutId = this.resolveAgentByRole(state, AgentRole.SCOUT) ?? (msg.toAgent === 'scout' ? 'scout-1' : msg.toAgent);
    const currentTask = state.agents.get(msg.fromAgent)?.currentTask;

    const header = currentTask ? `QUESTION_FROM ${msg.fromAgent} (TASK: ${currentTask})` : `QUESTION_FROM ${msg.fromAgent}`;
    const forwarded = `${header}:\r\n${msg.question}\r\n\r\nREPLY USING:\r\n@${msg.fromAgent}: <answer>\r\n`;

    console.log(`[${new Date(Date.now()).toISOString()}] [ROUTING] BUILDER_QUESTION -> scout (${scoutId})`);
    this.sendToAgent(scoutId, forwarded);
  }

  private handleScoutResponse(msg: ScoutResponseMessage, _swarmId: string): void {
    const payload = `@scout: ${msg.answer}\r\n`;
    console.log(`[${new Date(Date.now()).toISOString()}] [ROUTING] SCOUT_RESPONSE -> ${msg.toAgent}`);
    this.sendToAgent(msg.toAgent, payload);
  }

  private handleReviewerDecision(msg: ReviewDecisionMessage, swarmId: string): void {
    const stateBefore = this.orchestrator.getSwarmState(swarmId);
    const taskBefore = stateBefore.tasks.get(msg.taskId);
    const assignedBuilder = taskBefore?.tracking.assignedAgent || null;

    console.log(`[${new Date(Date.now()).toISOString()}] [ROUTING] REVIEW_DECISION -> orchestrator.taskReviewed()`);
    this.orchestrator.taskReviewed(swarmId, msg.taskId, msg.decision, msg.feedback);

    if (msg.decision === ReviewDecision.REJECT && assignedBuilder) {
      const payload = [
        `REVIEW_REJECTED: ${msg.taskId}`,
        `Feedback: ${msg.feedback}`,
        '',
        `NEXT: Fix issues and resubmit with "MARK_DONE: ${msg.taskId}".`
      ].join('\r\n');
      this.sendToAgent(assignedBuilder, `${payload}\r\n`);
    }
  }

  private handleTaskTimeout(msg: TaskTimeoutMessage, swarmId: string): void {
    const reason = `Task timeout after ${(msg.timeElapsed / 60_000).toFixed(0)} minutes.`;
    console.log(`[${new Date(Date.now()).toISOString()}] [ROUTING] TASK_TIMEOUT -> orchestrator.escalateBlocker()`);
    this.orchestrator.escalateBlocker(swarmId, {
      agentId: msg.agent,
      taskId: msg.taskId,
      reason,
      suggestedFix: 'Coordinator should split the task, clarify requirements, or sequence dependencies.'
    });
  }

  private handleSystemLog(msg: SystemLogMessage, swarmId: string): void {
    // Escalate if the system log indicates a block and we can infer a task.
    if (msg.message.toUpperCase().startsWith('BLOCKED:') && msg.agentId) {
      const state = this.orchestrator.getSwarmState(swarmId);
      const currentTask = state.agents.get(msg.agentId)?.currentTask;
      if (currentTask) {
        this.orchestrator.escalateBlocker(swarmId, {
          agentId: msg.agentId,
          taskId: currentTask,
          reason: msg.message,
          suggestedFix: 'Coordinator should investigate the block reason and update dependencies/context.'
        });
      }
    }
  }

  private enqueue(swarmId: string, fn: () => Promise<void>): void {
    const prev = this.queueBySwarm.get(swarmId) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(() => fn())
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[${new Date(Date.now()).toISOString()}] [ROUTING] Queue error for swarm=${swarmId}: ${message}`);
      });
    this.queueBySwarm.set(swarmId, next);
  }

  private sendToAgent(agentId: string, payload: string): void {
    this.messenger.sendToAgent(agentId, payload);
  }

  private resolveAgentByRole(state: SwarmState, role: AgentRole): string | undefined {
    for (const agent of state.agents.values()) {
      if (agent.role === role) {
        return agent.agentId;
      }
    }
    return undefined;
  }

  private describeSource(message: SwarmMessage): string {
    switch (message.type) {
      case SwarmMessageType.COORDINATOR_OUTPUT:
        return message.fromAgent;
      case SwarmMessageType.BUILDER_COMPLETION:
        return message.fromAgent;
      case SwarmMessageType.BUILDER_QUESTION:
        return message.fromAgent;
      case SwarmMessageType.SCOUT_RESPONSE:
        return message.fromAgent;
      case SwarmMessageType.REVIEW_DECISION:
        return 'reviewer';
      case SwarmMessageType.TASK_TIMEOUT:
        return message.agent;
      case SwarmMessageType.SYSTEM_LOG:
        return message.agentId ?? 'system';
      default:
        return 'unknown';
    }
  }

  private describeMessageDetail(message: SwarmMessage): string {
    switch (message.type) {
      case SwarmMessageType.BUILDER_COMPLETION:
        return `taskId: ${message.taskId}`;
      case SwarmMessageType.REVIEW_DECISION:
        return `taskId: ${message.taskId}, decision: ${message.decision}`;
      case SwarmMessageType.TASK_TIMEOUT:
        return `taskId: ${message.taskId}, elapsedMs: ${message.timeElapsed}`;
      case SwarmMessageType.BUILDER_QUESTION:
        return `to: ${message.toAgent}`;
      case SwarmMessageType.SCOUT_RESPONSE:
        return `to: ${message.toAgent}`;
      default:
        return '';
    }
  }
}
