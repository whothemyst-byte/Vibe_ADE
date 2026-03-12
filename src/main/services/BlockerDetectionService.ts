import { FileOwnershipManager } from '@main/services/FileOwnershipManager';
import { swarmEventBus } from '@main/services/SwarmEventBus';
import { SwarmOrchestrator } from '@main/services/SwarmOrchestrator';
import type { SwarmTerminalManager } from '@main/services/SwarmTerminalManager';
import { AgentRole, AgentRuntimeStatus, SwarmTaskStatus, type SwarmState, type SwarmTask, type TaskId } from '@main/types/SwarmOrchestration';
import type { ErrorSeverity } from '@main/types/SwarmEvents';

type BlockerType =
  | 'timeout'
  | 'dependency'
  | 'file-conflict'
  | 'agent-crash'
  | 'message-backlog'
  | 'repeated-rejection';

type BlockerDetails = Readonly<Record<string, unknown>>;

type BlockerEscalationInput = Readonly<{
  type: BlockerType;
  swarmId: string;
  taskId: TaskId;
  agentId?: string;
  reason: string;
  suggestion: string;
  severity: ErrorSeverity;
  details: BlockerDetails;
}>;

type MonitorKey = string;

type TaskTimerConfig = Readonly<{
  startTime: number;
  timeout: number;
  agentId: string;
}>;

type PendingMessage = Readonly<{
  fromAgentId: string;
  toAgentId: string;
  createdAt: number;
  summary: string;
}>;

/**
 * Detects stuck/blocked agents and tasks and escalates actionable blocker reports.
 *
 * This service is intentionally defensive: it should never throw in a way that
 * crashes the main process. All detection failures are logged and ignored.
 *
 * Integration options:
 * - Attach to {@link SwarmOrchestrator} to observe task lifecycle events (assign/reject/complete).
 * - Attach to {@link SwarmTerminalManager} to observe agent crashes/activity.
 * - Attach to {@link FileOwnershipManager} to observe file conflict events.
 *
 * The service emits:
 * - SwarmEventBus `blocker-escalated` events for UI/telemetry
 * - Best-effort notifications to a coordinator agent (if messenger is available)
 */
export class BlockerDetectionService {
  private static instance: BlockerDetectionService | null = null;

  /**
   * Singleton accessor.
   */
  public static getInstance(): BlockerDetectionService {
    if (!BlockerDetectionService.instance) {
      BlockerDetectionService.instance = new BlockerDetectionService();
    }
    return BlockerDetectionService.instance;
  }

  private readonly taskTimers: Map<MonitorKey, TaskTimerConfig> = new Map();
  private readonly taskChecks: Map<MonitorKey, NodeJS.Timeout> = new Map();
  private readonly hardTimeouts: Map<MonitorKey, NodeJS.Timeout> = new Map();
  private readonly rejectionCounts: Map<MonitorKey, number> = new Map();
  private readonly lastEscalationAt: Map<string, number> = new Map();
  private readonly orchestratorEchoes: Map<string, number> = new Map();

  private readonly pendingMessages: Map<string, PendingMessage> = new Map();
  private readonly taskToSwarmId: Map<TaskId, string> = new Map();

  private orchestrator: SwarmOrchestrator | null = null;
  private terminalManager: SwarmTerminalManager | null = null;
  private fileOwnershipManager: FileOwnershipManager | null = null;
  private coordinatorAgentIdOverride: string | null = null;
  private messenger: { sendToAgent: (agentId: string, message: string) => void } | null = null;

  private readonly checkIntervalMs = 30_000;
  private readonly defaultTimeoutMs = 15 * 60_000;
  private readonly idleThresholdMs = 5 * 60_000;
  private readonly backlogThresholdMs = 3 * 60_000;
  private readonly escalationDedupeMs = 2 * 60_000;

  private unsubs: Array<() => void> = [];

  private constructor() {
    // Singleton - use getInstance().
  }

  /**
   * Attach service to orchestration/runtime components.
   *
   * This is safe to call multiple times; new attachments replace prior ones and
   * previous subscriptions are cleaned up.
   */
  public attach(input: {
    orchestrator: SwarmOrchestrator;
    terminalManager?: SwarmTerminalManager;
    fileOwnershipManager?: FileOwnershipManager;
    coordinatorAgentId?: string;
    messenger?: { sendToAgent: (agentId: string, message: string) => void };
  }): void {
    this.detach();

    this.orchestrator = input.orchestrator;
    this.terminalManager = input.terminalManager ?? null;
    this.fileOwnershipManager = input.fileOwnershipManager ?? FileOwnershipManager.getInstance();
    this.coordinatorAgentIdOverride = input.coordinatorAgentId ?? null;
    this.messenger = input.messenger ?? input.terminalManager ?? null;

    this.unsubs.push(
      this.orchestrator.on('task-created', ({ swarmId, task }) => {
        try {
          this.taskToSwarmId.set(task.id, swarmId);
        } catch (error) {
          this.logWarn('attach(task-created)', error);
        }
      })
    );

    this.unsubs.push(
      this.orchestrator.on('tasks-created', ({ swarmId, tasks }) => {
        try {
          for (const task of tasks) {
            this.taskToSwarmId.set(task.id, swarmId);
          }
        } catch (error) {
          this.logWarn('attach(tasks-created)', error);
        }
      })
    );

    this.unsubs.push(
      this.orchestrator.on('task-assigned', ({ swarmId, taskId, agentId }) => {
        try {
          this.taskToSwarmId.set(taskId, swarmId);
          const state = this.orchestrator?.getSwarmState(swarmId);
          const task = state?.tasks.get(taskId);
          if (task) {
            this.monitorTask(swarmId, task, this.timeoutForTask(task));
          }
        } catch (error) {
          this.logWarn('attach(task-assigned)', error);
        }
      })
    );

    this.unsubs.push(
      this.orchestrator.on('task-completed', ({ swarmId, taskId }) => {
        try {
          this.stopMonitoringTask(swarmId, taskId);
        } catch (error) {
          this.logWarn('attach(task-completed)', error);
        }
      })
    );

    this.unsubs.push(
      this.orchestrator.on('task-approved', ({ swarmId, taskId }) => {
        try {
          this.stopMonitoringTask(swarmId, taskId);
        } catch (error) {
          this.logWarn('attach(task-approved)', error);
        }
      })
    );

    this.unsubs.push(
      this.orchestrator.on('task-rejected', ({ swarmId, taskId, feedback }) => {
        try {
          const key = this.keyFor(swarmId, taskId);
          const next = (this.rejectionCounts.get(key) ?? 0) + 1;
          this.rejectionCounts.set(key, next);

          if (next >= 3) {
            const state = this.orchestrator?.getSwarmState(swarmId);
            const task = state?.tasks.get(taskId);
            const agentId = task?.tracking.assignedAgent || task?.fileOwnership.ownedBy || 'unknown';
            this.escalate({
              type: 'repeated-rejection',
              swarmId,
              taskId,
              agentId,
              reason: `Task rejected ${next} times by reviewer.`,
              suggestion: `Clarify acceptance criteria or rescope the task. Latest feedback: "${feedback}". Consider pairing builder with scout for patterns.`,
              severity: 'medium',
              details: this.buildDetails(state ?? null, task ?? null, {
                rejectionCount: next,
                latestFeedback: feedback
              })
            });
          }
        } catch (error) {
          this.logWarn('attach(task-rejected)', error);
        }
      })
    );

    this.unsubs.push(
      this.orchestrator.on('agent-blocked', ({ swarmId, agentId, taskId, reason, suggestedFix }) => {
        try {
          // If this is a timeout warning emitted by orchestrator's timers, a blocker escalation
          // will typically follow immediately. Avoid duplicate notifications here.
          if (reason.toLowerCase().includes('timeout')) {
            return;
          }
          const state = this.orchestrator?.getSwarmState(swarmId) ?? null;
          const task = state?.tasks.get(taskId) ?? null;
          // Treat agent-blocked as a warning signal; do not re-escalate into orchestrator here
          // because orchestrator timers may also escalate and we want to avoid duplicate state churn.
          this.report({
            type: 'message-backlog',
            swarmId,
            taskId,
            agentId,
            reason,
            suggestion: suggestedFix ?? 'Check agent terminal output, resend the last instruction, or reassign to another builder.',
            severity: 'high',
            details: this.buildDetails(state, task, { source: 'orchestrator.agent-blocked' })
          });
        } catch (error) {
          this.logWarn('attach(agent-blocked)', error);
        }
      })
    );

    this.unsubs.push(
      this.orchestrator.on('blocker-escalated', ({ swarmId, agentId, taskId, reason, suggestedFix }) => {
        try {
          if (this.consumeOrchestratorEcho(swarmId, taskId, reason)) {
            return;
          }
          const state = this.orchestrator?.getSwarmState(swarmId) ?? null;
          const task = state?.tasks.get(taskId) ?? null;
          const inferredType = this.inferBlockerTypeFromReason(reason);
          const severity = this.determineSeverityFromReason(reason);
          const suggestion = suggestedFix ?? this.generateSuggestion({ type: inferredType, reason, taskId, agentId });
          this.emitBlockerEvent({
            type: inferredType,
            swarmId,
            taskId,
            agentId,
            reason,
            suggestion,
            severity,
            details: this.buildDetails(state, task, { source: 'orchestrator.blocker-escalated' })
          });
          this.notifyCoordinator({
            type: inferredType,
            swarmId,
            taskId,
            agentId,
            reason,
            suggestion,
            severity,
            details: this.buildDetails(state, task, { source: 'orchestrator.blocker-escalated' })
          });
        } catch (error) {
          this.logWarn('attach(blocker-escalated)', error);
        }
      })
    );

    if (this.fileOwnershipManager) {
      this.unsubs.push(
        this.fileOwnershipManager.on('conflict-detected', ({ taskId, conflict, timestamp }) => {
          try {
            const swarmId = this.taskToSwarmId.get(taskId) ?? null;
            if (!swarmId) {
              console.warn(`[${new Date(timestamp).toISOString()}] [BLOCKER] conflict-detected for ${taskId} but swarmId is unknown`);
              return;
            }
            const state = this.orchestrator?.getSwarmState(swarmId) ?? null;
            const task = state?.tasks.get(taskId) ?? null;
            const agentId = task?.tracking.assignedAgent || task?.fileOwnership.ownedBy || 'unknown';
            const reason = `File ownership conflict detected for ${taskId}: ${conflict.error}`;
            const suggestion = `Rescope task files or sequence conflicting tasks. Overlapping: ${conflict.overlappingFiles.join(', ')}`;

            this.escalate({
              type: 'file-conflict',
              swarmId,
              taskId,
              agentId,
              reason,
              suggestion,
              severity: 'high',
              details: this.buildDetails(state, task, { conflict })
            });
          } catch (error) {
            this.logWarn('attach(fileOwnership.conflict-detected)', error);
          }
        })
      );
    }

    if (this.terminalManager) {
      this.unsubs.push(
        this.terminalManager.on('agent-crashed', ({ swarmId, agentId, exitCode, timestamp }) => {
          try {
            const state = this.orchestrator?.getSwarmState(swarmId) ?? null;
            const task = this.findCurrentTaskForAgent(state, agentId);
            if (!task) {
              // Still notify coordinator about crash, even if no task is associated.
              this.emitBlockerEvent({
                type: 'agent-crash',
                swarmId,
                taskId: 'TASK-000' as TaskId,
                agentId,
                reason: `Agent process crashed: ${agentId} exited with code ${exitCode}.`,
                suggestion: 'Restart the agent process and reassign any in-flight tasks.',
                severity: 'critical',
                details: { agentId, exitCode, timestamp }
              });
              return;
            }

            this.escalate({
              type: 'agent-crash',
              swarmId,
              taskId: task.id,
              agentId,
              reason: `Agent crash while working on ${task.id}: exit code ${exitCode}.`,
              suggestion: 'Restart the agent and reassign this task, or move task to another builder. Review PTY logs for the crash cause.',
              severity: 'critical',
              details: this.buildDetails(state, task, { exitCode })
            });
          } catch (error) {
            this.logWarn('attach(terminal.agent-crashed)', error);
          }
        })
      );

      this.unsubs.push(
        this.terminalManager.on('agent-activity', ({ swarmId, agentId, lastActivity }) => {
          try {
            // If we have pending message expectations, clear backlog if this agent becomes active.
            for (const [key, pending] of this.pendingMessages.entries()) {
              if (pending.toAgentId === agentId) {
                this.pendingMessages.delete(key);
              }
            }
          } catch (error) {
            this.logWarn('attach(terminal.agent-activity)', error);
          }
        })
      );
    }
  }

  /**
   * Detach all listeners and stop active timers.
   */
  public detach(): void {
    for (const unsub of this.unsubs) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    this.unsubs = [];
    this.orchestrator = null;
    this.terminalManager = null;
    this.fileOwnershipManager = null;
    this.messenger = null;
  }

  /**
   * Start monitoring a task for blockers.
   *
   * Use this when a task transitions into ASSIGNED/BUILDING/REVIEWING.
   * By default, uses a 15 minute timeout.
   */
  public monitorTask(swarmId: string, task: SwarmTask, timeoutMs: number = this.defaultTimeoutMs): void {
    const orchestrator = this.orchestrator;
    if (!orchestrator) return;

    const agentId = task.tracking.assignedAgent || task.fileOwnership.ownedBy;
    if (!agentId) return;

    const key = this.keyFor(swarmId, task.id);
    const startTime = task.tracking.assignedAt > 0 ? task.tracking.assignedAt : Date.now();

    this.taskTimers.set(key, { startTime, timeout: timeoutMs, agentId });

    // Interval checks.
    if (!this.taskChecks.has(key)) {
      const interval = setInterval(() => {
        try {
          const state = orchestrator.getSwarmState(swarmId);
          const latest = state.tasks.get(task.id);
          if (!latest) {
            this.stopMonitoringTask(swarmId, task.id);
            return;
          }
          if (latest.status === SwarmTaskStatus.DONE || latest.status === SwarmTaskStatus.BLOCKED) {
            this.stopMonitoringTask(swarmId, task.id);
            return;
          }
          if (latest.status === SwarmTaskStatus.ASSIGNED || latest.status === SwarmTaskStatus.BUILDING || latest.status === SwarmTaskStatus.REVIEWING) {
            this.checkTask(swarmId, latest, state);
          }
        } catch (error) {
          this.logWarn('monitorTask(interval)', error);
        }
      }, this.checkIntervalMs);
      this.taskChecks.set(key, interval);
    }

    // Hard timeout.
    if (!this.hardTimeouts.has(key)) {
      const hard = setTimeout(() => {
        try {
          const state = orchestrator.getSwarmState(swarmId);
          const latest = state.tasks.get(task.id);
          if (!latest) return;
          if (latest.status === SwarmTaskStatus.DONE || latest.status === SwarmTaskStatus.BLOCKED) return;

          const elapsed = Date.now() - startTime;
          this.escalate({
            type: 'timeout',
            swarmId,
            taskId: latest.id,
            agentId,
            reason: `Task timeout after ${Math.round(elapsed / 60_000)} minutes.`,
            suggestion: this.generateSuggestion({ type: 'timeout', timeElapsedMs: elapsed, timeoutMs }),
            severity: 'high',
            details: this.buildDetails(state, latest, { elapsedMs: elapsed, timeoutMs })
          });
        } catch (error) {
          this.logWarn('monitorTask(hardTimeout)', error);
        }
      }, Math.max(5_000, timeoutMs));
      this.hardTimeouts.set(key, hard);
    }
  }

  /**
   * Stop all monitoring timers for a task.
   */
  public stopMonitoringTask(swarmId: string, taskId: TaskId): void {
    const key = this.keyFor(swarmId, taskId);

    const interval = this.taskChecks.get(key);
    if (interval) {
      clearInterval(interval);
      this.taskChecks.delete(key);
    }

    const hard = this.hardTimeouts.get(key);
    if (hard) {
      clearTimeout(hard);
      this.hardTimeouts.delete(key);
    }

    this.taskTimers.delete(key);
    // Keep rejectionCounts to preserve history across retries.
  }

  /**
   * Check all relevant tasks in a swarm snapshot.
   *
   * This can be invoked by a periodic scheduler (e.g. every 30 seconds).
   */
  public checkAllTasks(swarmId: string, orchestrator: SwarmOrchestrator): void {
    try {
      const state = orchestrator.getSwarmState(swarmId);
      for (const task of state.tasks.values()) {
        if (task.status === SwarmTaskStatus.ASSIGNED || task.status === SwarmTaskStatus.BUILDING || task.status === SwarmTaskStatus.REVIEWING) {
          this.checkTask(swarmId, task, state);
        }
      }
    } catch (error) {
      this.logWarn('checkAllTasks', error);
    }
  }

  /**
   * Record an expectation that a message should receive a response (used for backlog detection).
   *
   * This is optional; if not used, backlog detection falls back to inactivity heuristics.
   */
  public recordPendingMessage(swarmId: string, fromAgentId: string, toAgentId: string, summary: string): void {
    const key = `${swarmId}:${fromAgentId}->${toAgentId}:${summary.slice(0, 24)}`;
    this.pendingMessages.set(key, { fromAgentId, toAgentId, createdAt: Date.now(), summary });
  }

  /**
   * Clear pending message expectations for a pair of agents.
   */
  public clearPendingMessages(swarmId: string, toAgentId: string): void {
    for (const [key, pending] of this.pendingMessages.entries()) {
      if (key.startsWith(`${swarmId}:`) && pending.toAgentId === toAgentId) {
        this.pendingMessages.delete(key);
      }
    }
  }

  private checkTask(swarmId: string, task: SwarmTask, state: SwarmState): void {
    const timer = this.taskTimers.get(this.keyFor(swarmId, task.id));
    const now = Date.now();
    const assignedAt = task.tracking.assignedAt > 0 ? task.tracking.assignedAt : timer?.startTime ?? now;
    const elapsed = now - assignedAt;

    // Timeout check (soft) - only if we have timer config.
    if (timer && elapsed > timer.timeout) {
      this.escalate({
        type: 'timeout',
        swarmId,
        taskId: task.id,
        agentId: timer.agentId,
        reason: `Task exceeded timeout (${Math.round(elapsed / 60_000)}m > ${Math.round(timer.timeout / 60_000)}m).`,
        suggestion: this.generateSuggestion({ type: 'timeout', timeElapsedMs: elapsed, timeoutMs: timer.timeout }),
        severity: 'high',
        details: this.buildDetails(state, task, { elapsedMs: elapsed, timeoutMs: timer.timeout })
      });
      return;
    }

    // Dependency blocker: task running while dependencies not DONE (should not normally happen).
    const deps = task.fileOwnership.dependencies;
    if (deps.length > 0) {
      const unmet = deps.filter((depId) => state.tasks.get(depId)?.status !== SwarmTaskStatus.DONE);
      if (unmet.length > 0 && (task.status === SwarmTaskStatus.ASSIGNED || task.status === SwarmTaskStatus.BUILDING)) {
        this.escalate({
          type: 'dependency',
          swarmId,
          taskId: task.id,
          agentId: task.tracking.assignedAgent || timer?.agentId,
          reason: `Task started before dependencies completed: ${unmet.join(', ')}`,
          suggestion: this.generateSuggestion({ type: 'dependency', blockedBy: unmet }),
          severity: 'medium',
          details: this.buildDetails(state, task, { unmetDependencies: unmet })
        });
        return;
      }
    }

    // Backlog detection: pending directed messages not answered for too long.
    for (const [key, pending] of this.pendingMessages.entries()) {
      if (!key.startsWith(`${swarmId}:`)) continue;
      if (now - pending.createdAt > this.backlogThresholdMs) {
        const agentId = pending.toAgentId;
        const affectedTaskId = task.id;
        this.escalate({
          type: 'message-backlog',
          swarmId,
          taskId: affectedTaskId,
          agentId,
          reason: `No response from ${pending.toAgentId} to ${pending.fromAgentId} for ${(now - pending.createdAt) / 1000}s (pending: ${pending.summary}).`,
          suggestion: 'Check agent terminal; resend the question/context, or reassign to another agent if unresponsive.',
          severity: 'medium',
          details: this.buildDetails(state, task, { pending })
        });
        this.pendingMessages.delete(key);
        return;
      }
    }

    // Idle worker check: active agent with no activity update for too long.
    const assignedAgentId = task.tracking.assignedAgent;
    if (assignedAgentId) {
      const agent = state.agents.get(assignedAgentId);
      if (agent && (agent.status === AgentRuntimeStatus.ACTIVE || agent.status === AgentRuntimeStatus.THINKING)) {
        const idleMs = now - agent.lastActivity;
        if (idleMs > this.idleThresholdMs) {
          this.escalate({
            type: 'message-backlog',
            swarmId,
            taskId: task.id,
            agentId: assignedAgentId,
            reason: `Agent idle for ${(idleMs / 60_000).toFixed(1)}m while task ${task.id} is ${task.status}.`,
            suggestion: 'Check terminal output; ask for status update, resend task context, or restart/reassign the agent.',
            severity: 'high',
            details: this.buildDetails(state, task, { agentIdleMs: idleMs })
          });
        }
      }
    }
  }

  private escalate(input: BlockerEscalationInput): void {
    if (this.isRecentlyEscalated(input.swarmId, input.taskId, input.type)) {
      return;
    }

    const now = Date.now();
    console.log(`[${new Date(now).toISOString()}] [BLOCKER ESCALATED] ${input.type} on ${input.taskId}`, {
      swarmId: input.swarmId,
      agentId: input.agentId,
      reason: input.reason
    });

    // Best-effort: mark blocked in orchestrator state.
    try {
      if (this.orchestrator && input.agentId && this.isRealTaskId(input.taskId)) {
        this.rememberOrchestratorEcho(input.swarmId, input.taskId, input.reason);
        this.orchestrator.escalateBlocker(input.swarmId, {
          agentId: input.agentId,
          taskId: input.taskId,
          reason: input.reason,
          suggestedFix: input.suggestion
        });
      }
    } catch (error) {
      this.logWarn('escalate(orchestrator.escalateBlocker)', error);
    }

    // Emit event + notify coordinator.
    this.emitBlockerEvent(input);
    this.notifyCoordinator(input);
  }

  private report(input: BlockerEscalationInput): void {
    if (this.isRecentlyEscalated(input.swarmId, input.taskId, input.type)) {
      return;
    }
    this.emitBlockerEvent(input);
    this.notifyCoordinator(input);
  }

  private emitBlockerEvent(input: BlockerEscalationInput): void {
    try {
      if (!input.agentId) {
        // BlockerEscalatedEvent requires agentId; use best-effort.
        const state = this.orchestrator?.getSwarmState(input.swarmId);
        const resolved = this.resolveCoordinatorAgentId(state ?? null) ?? 'unknown';
        swarmEventBus.emit({
          type: 'blocker-escalated',
          swarmId: input.swarmId,
          agentId: resolved,
          taskId: input.taskId,
          blockReason: input.reason,
          severity: input.severity,
          suggestion: input.suggestion,
          details: input.details,
          timestamp: Date.now()
        });
        return;
      }

      swarmEventBus.emit({
        type: 'blocker-escalated',
        swarmId: input.swarmId,
        agentId: input.agentId,
        taskId: input.taskId,
        blockReason: input.reason,
        severity: input.severity,
        suggestion: input.suggestion,
        details: input.details,
        timestamp: Date.now()
      });
    } catch (error) {
      this.logWarn('emitBlockerEvent', error);
    }
  }

  private notifyCoordinator(input: BlockerEscalationInput): void {
    const messenger = this.messenger;
    if (!messenger) return;

    const state = this.orchestrator?.getSwarmState(input.swarmId) ?? null;
    const coordinatorId = this.coordinatorAgentIdOverride ?? this.resolveCoordinatorAgentId(state);
    if (!coordinatorId) {
      return;
    }

    const lines: string[] = [];
    lines.push('[SWARM RELAY]');
    lines.push('BLOCKER DETECTED');
    lines.push(`Type: ${input.type}`);
    lines.push(`Swarm: ${input.swarmId}`);
    lines.push(`Task: ${input.taskId}`);
    if (input.agentId) {
      lines.push(`Agent: ${input.agentId}`);
    }
    lines.push(`Severity: ${input.severity}`);
    lines.push(`Reason: ${input.reason}`);
    lines.push(`Suggestion: ${input.suggestion}`);

    const debug = this.formatDebugDetails(input.details);
    if (debug) {
      lines.push('');
      lines.push('DEBUG INFO:');
      lines.push(debug);
    }

    lines.push('');
    lines.push('Coordinator actions:');
    lines.push('- Restart agent and retry task');
    lines.push('- Extend timeout if close to completion');
    lines.push('- Reassign task to another builder');
    lines.push('- Rescope/split the task if too large');

    try {
      messenger.sendToAgent(coordinatorId, lines.join('\n'));
    } catch (error) {
      this.logWarn(`notifyCoordinator(sendToAgent ${coordinatorId})`, error);
    }
  }

  private formatDebugDetails(details: BlockerDetails): string {
    const safe: Record<string, string> = {};
    for (const [k, v] of Object.entries(details)) {
      const str = typeof v === 'string' ? v : JSON.stringify(v);
      if (str && str.length <= 600) {
        safe[k] = str;
      } else if (str) {
        safe[k] = `${str.slice(0, 600)}…`;
      }
    }
    const keys = Object.keys(safe);
    if (keys.length === 0) return '';
    return keys
      .slice(0, 20)
      .map((k) => `${k}: ${safe[k]}`)
      .join('\n');
  }

  private keyFor(swarmId: string, taskId: TaskId): MonitorKey {
    return `${swarmId}:${taskId}`;
  }

  private isRecentlyEscalated(swarmId: string, taskId: TaskId, type: BlockerType): boolean {
    const key = `${swarmId}:${taskId}:${type}`;
    const last = this.lastEscalationAt.get(key) ?? 0;
    const now = Date.now();
    if (now - last < this.escalationDedupeMs) {
      return true;
    }
    this.lastEscalationAt.set(key, now);
    return false;
  }

  private rememberOrchestratorEcho(swarmId: string, taskId: TaskId, reason: string): void {
    const key = `${swarmId}:${taskId}:${reason}`;
    this.orchestratorEchoes.set(key, Date.now());
    // Best-effort cleanup of old entries.
    if (this.orchestratorEchoes.size > 2000) {
      const cutoff = Date.now() - 10 * 60_000;
      for (const [k, ts] of this.orchestratorEchoes.entries()) {
        if (ts < cutoff) {
          this.orchestratorEchoes.delete(k);
        }
      }
    }
  }

  private consumeOrchestratorEcho(swarmId: string, taskId: TaskId, reason: string): boolean {
    const key = `${swarmId}:${taskId}:${reason}`;
    const ts = this.orchestratorEchoes.get(key);
    if (!ts) return false;
    this.orchestratorEchoes.delete(key);
    return true;
  }

  private timeoutForTask(task: SwarmTask): number {
    // Default 15 minutes; allow a little extra for long estimated tasks, but cap.
    const estimateMs = Math.max(5 * 60_000, task.estimatedMinutes * 60_000);
    return Math.max(this.defaultTimeoutMs, Math.min(2 * 60 * 60_000, estimateMs));
  }

  private generateSuggestion(input: unknown): string {
    if (typeof input !== 'object' || input === null) {
      return 'Check logs for details, then restart/reassign if needed.';
    }
    const record = input as Record<string, unknown>;
    const type = record.type;

    switch (type) {
      case 'timeout': {
        const timeElapsedMs = typeof record.timeElapsedMs === 'number' ? record.timeElapsedMs : 0;
        const timeoutMs = typeof record.timeoutMs === 'number' ? record.timeoutMs : 0;
        const elapsedM = Math.round(timeElapsedMs / 60_000);
        const budgetM = Math.max(1, Math.round(timeoutMs / 60_000));
        return `Task exceeded expected duration (${elapsedM}m > ${budgetM}m). Check agent terminal/logs, extend timeout if close, or restart/reassign/split the task.`;
      }
      case 'dependency': {
        const blockedBy = Array.isArray(record.blockedBy) ? record.blockedBy.filter((x) => typeof x === 'string') : [];
        return blockedBy.length > 0
          ? `Task blocked by incomplete dependencies: ${blockedBy.join(', ')}. Wait/fix dependencies, or reorder tasks to enforce sequencing.`
          : 'Task appears blocked by dependency. Verify task ordering and dependency statuses.';
      }
      case 'file-conflict':
        return 'File ownership conflict detected. Rescope task files, split tasks by file boundaries, or sequence tasks that must touch the same files.';
      case 'agent-crash':
        return 'Agent crashed unexpectedly. Restart the agent PTY and reassign the task; inspect crash logs for root cause.';
      case 'message-backlog':
        return 'Agent appears unresponsive. Check terminal output, resend last message, or restart/reassign if the session is stuck.';
      case 'repeated-rejection':
        return 'Task rejected multiple times. Clarify acceptance criteria and code patterns, or rescope/split task into smaller verifiable steps.';
      default:
        return 'Check logs for details, then restart/reassign if needed.';
    }
  }

  private inferBlockerTypeFromReason(reason: string): BlockerType {
    const r = reason.toLowerCase();
    if (r.includes('timeout')) return 'timeout';
    if (r.includes('conflict') || r.includes('ownership')) return 'file-conflict';
    if (r.includes('crash') || r.includes('exited')) return 'agent-crash';
    if (r.includes('reject')) return 'repeated-rejection';
    if (r.includes('dependency') || r.includes('depends')) return 'dependency';
    return 'message-backlog';
  }

  private determineSeverityFromReason(reason: string): ErrorSeverity {
    const r = reason.toLowerCase();
    if (r.includes('crash') || r.includes('fatal')) return 'critical';
    if (r.includes('timeout') || r.includes('conflict')) return 'high';
    if (r.includes('dependency') || r.includes('blocked')) return 'medium';
    return 'medium';
  }

  private buildDetails(state: SwarmState | null, task: SwarmTask | null, extra: BlockerDetails): BlockerDetails {
    const base: Record<string, unknown> = { ...extra };
    if (task) {
      base.taskStatus = task.status;
      base.assignedAgent = task.tracking.assignedAgent;
      base.assignedAt = task.tracking.assignedAt;
      base.files = Array.from(task.fileOwnership.files);
      base.dependencies = [...task.fileOwnership.dependencies];
      base.priority = task.priority;
      base.estimatedMinutes = task.estimatedMinutes;
      base.latestFeedback = task.tracking.feedback;
    }
    if (state && task?.tracking.assignedAgent) {
      const agent = state.agents.get(task.tracking.assignedAgent);
      if (agent) {
        base.agentStatus = agent.status;
        base.agentLastActivity = agent.lastActivity;
        base.agentBlockReason = agent.blockReason;
      }
    }
    return base;
  }

  private findCurrentTaskForAgent(state: SwarmState | null, agentId: string): SwarmTask | null {
    if (!state) return null;
    const agent = state.agents.get(agentId);
    if (agent?.currentTask) {
      return state.tasks.get(agent.currentTask) ?? null;
    }
    for (const task of state.tasks.values()) {
      if (task.tracking.assignedAgent === agentId && task.status !== SwarmTaskStatus.DONE) {
        return task;
      }
    }
    return null;
  }

  private resolveCoordinatorAgentId(state: SwarmState | null): string | null {
    if (!state) {
      return null;
    }
    for (const agent of state.agents.values()) {
      if (agent.role === AgentRole.COORDINATOR) {
        return agent.agentId;
      }
    }
    // Common default.
    if (state.agents.has('coordinator-1')) return 'coordinator-1';
    const fallback = Array.from(state.agents.keys()).find((id) => id.toLowerCase().startsWith('coordinator'));
    return fallback ?? null;
  }

  private isRealTaskId(taskId: TaskId): boolean {
    return /^TASK-\d{3}$/.test(taskId);
  }

  private logWarn(context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[${new Date().toISOString()}] [BlockerDetectionService] ${context}: ${message}`);
  }
}

export const blockerDetectionService = BlockerDetectionService.getInstance();
