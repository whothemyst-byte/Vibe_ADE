import { EventEmitter } from 'node:events';
import { FileOwnershipManager } from '@main/services/FileOwnershipManager';
import {
  AgentRole,
  AgentRuntimeStatus,
  SwarmTaskPriority,
  SwarmTaskStatus,
  type AgentState,
  type SwarmSharedContext,
  type SwarmState,
  type SwarmTask,
  type TaskId,
  type UnixTimestampMs
} from '@main/types/SwarmOrchestration';
import { ReviewDecision } from '@main/types/SwarmMessages';

type CoordinatorContextPatch = Readonly<{
  conventions: string;
  patterns: string;
  security: string;
  testing: string;
}>;

type BlockerInput = Readonly<{
  agentId: string;
  taskId: TaskId;
  reason: string;
  suggestedFix?: string;
}>;

export type SwarmStatusSummary = Readonly<{
  goal: string;
  totalTasks: number;
  completed: number;
  inProgress: number;
  blocked: number;
  agents: readonly AgentState[];
  nextActions: readonly string[];
}>;

type SwarmOrchestratorEvents = {
  'task-created': { swarmId: string; task: SwarmTask; timestamp: UnixTimestampMs };
  'tasks-created': { swarmId: string; tasks: readonly SwarmTask[]; timestamp: UnixTimestampMs };
  'task-assigned': { swarmId: string; taskId: TaskId; agentId: string; timestamp: UnixTimestampMs };
  'task-completed': { swarmId: string; taskId: TaskId; agentId: string; summary: string; timestamp: UnixTimestampMs };
  'task-approved': { swarmId: string; taskId: TaskId; feedback: string; timestamp: UnixTimestampMs };
  'task-rejected': { swarmId: string; taskId: TaskId; feedback: string; timestamp: UnixTimestampMs };
  'agent-blocked': { swarmId: string; agentId: string; taskId: TaskId; reason: string; suggestedFix?: string; timestamp: UnixTimestampMs };
  'blocker-escalated': { swarmId: string; agentId: string; taskId: TaskId; reason: string; suggestedFix?: string; timestamp: UnixTimestampMs };
  'swarm-complete': { swarmId: string; timestamp: UnixTimestampMs };
};

/**
 * Central coordinator hub for QuanSwarm orchestration.
 *
 * Responsibilities:
 * - Maintain immutable {@link SwarmState} snapshots per swarm ID
 * - Decompose coordinator plans into structured {@link SwarmTask} objects
 * - Validate dependencies (DAG) and compute parallelizable task groups
 * - Coordinate agent assignment and progress tracking
 * - Enforce file ownership using {@link FileOwnershipManager}
 * - Detect and escalate blockers / timeouts via events
 */
export class SwarmOrchestrator {
  private static instance: SwarmOrchestrator | null = null;

  /**
   * Singleton accessor.
   */
  public static getInstance(): SwarmOrchestrator {
    if (!SwarmOrchestrator.instance) {
      SwarmOrchestrator.instance = new SwarmOrchestrator();
    }
    return SwarmOrchestrator.instance;
  }

  private swarms: Map<string, SwarmState> = new Map();
  private fileOwnershipManager: FileOwnershipManager;
  private taskTimers: Map<string, NodeJS.Timeout> = new Map();
  private eventEmitter: EventEmitter;

  /**
   * Debug history of state transitions for each swarm.
   * The latest state is always stored in {@link swarms}; this history stores prior snapshots.
   */
  private swarmHistory: Map<string, SwarmState[]> = new Map();

  private constructor() {
    this.fileOwnershipManager = FileOwnershipManager.getInstance();
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);
  }

  /**
   * Subscribe to orchestrator events (used by coordinator agent and UI).
   */
  public on<EventName extends keyof SwarmOrchestratorEvents>(
    event: EventName,
    listener: (payload: SwarmOrchestratorEvents[EventName]) => void
  ): () => void {
    this.eventEmitter.on(event, listener);
    return () => this.eventEmitter.off(event, listener);
  }

  /**
   * Read-only access to the latest swarm state snapshot.
   *
   * This is used by message routing and UI surfaces. Callers must treat the returned
   * object as immutable and avoid mutating contained Maps/Sets directly.
   */
  public getSwarmState(swarmId: string): SwarmState {
    return this.getSwarmOrThrow(swarmId);
  }

  /**
   * Create a new swarm session with an overall goal and initial codebase structure snapshot.
   */
  public createSwarm(swarmId: string, overallGoal: string, codebaseStructure: string): SwarmState {
    const now = Date.now();
    const sharedContext: SwarmSharedContext = {
      codebaseStructure,
      conventions: '',
      existingPatterns: '',
      security: '',
      testing: ''
    };

    const state: SwarmState = {
      swarmId,
      overallGoal,
      createdAt: now,
      tasks: new Map(),
      fileOwnershipMap: new Map(),
      agents: new Map(),
      parallelGroups: [],
      dependencies: new Map(),
      sharedContext
    };

    this.swarms.set(swarmId, state);
    this.swarmHistory.set(swarmId, [state]);
    console.log(`[${new Date(now).toISOString()}] [SWARM CREATED] ${swarmId} with goal: ${overallGoal}`);
    return state;
  }

  /**
   * Merge coordinator/scout-provided intelligence into the swarm shared context.
   */
  public addCoordinatorContext(swarmId: string, context: CoordinatorContextPatch): void {
    const now = Date.now();
    const current = this.getSwarmOrThrow(swarmId);
    const next: SwarmState = {
      ...current,
      sharedContext: {
        ...current.sharedContext,
        conventions: context.conventions,
        existingPatterns: context.patterns,
        security: context.security,
        testing: context.testing
      }
    };
    this.setSwarmState(swarmId, next, `addCoordinatorContext @ ${now}`);
  }

  /**
   * Register an agent in the swarm runtime state.
   *
   * The terminal layer can start/stop agents independently of task assignment; registering agents
   * here ensures the orchestrator always has an accurate role map for routing, monitoring, and UI.
   */
  public registerAgent(swarmId: string, agentId: string, role: AgentRole): void {
    const now = Date.now();
    const swarm = this.getSwarmOrThrow(swarmId);

    const existing = swarm.agents.get(agentId);
    const nextAgent: AgentState = existing
      ? {
          ...existing,
          role,
          status: existing.status ?? AgentRuntimeStatus.IDLE,
          lastActivity: now
        }
      : {
          agentId,
          role,
          status: AgentRuntimeStatus.IDLE,
          currentTask: undefined,
          assignedTasks: [],
          lastActivity: now,
          lastMessage: undefined,
          blockReason: undefined,
          responseTime: 0
        };

    const nextAgents = new Map<string, AgentState>(swarm.agents);
    nextAgents.set(agentId, nextAgent);
    this.setSwarmState(swarmId, { ...swarm, agents: nextAgents }, `registerAgent(${agentId}, ${role}) @ ${now}`);
  }

  /**
   * Decompose a coordinator's textual plan into structured swarm tasks.
   *
   * Expected format per task block:
   * ```
   * TASK: TASK-001
   * TITLE: Authentication Types
   * DESCRIPTION: Create auth type definitions
   * FILES_TO_MODIFY: [src/auth/types.ts, src/auth/schema.ts]
   * DEPENDENCIES: []
   * ACCEPTANCE_CRITERIA:
   * - All types are documented
   * - Matches existing patterns
   * ```
   *
   * This method validates:
   * - Unique task IDs in the plan
   * - No file conflicts within the plan
   *
   * It does not mutate swarm state; use {@link createTasks} to commit tasks into the swarm.
   */
  public decomposeTasks(swarmId: string, coordinatorPlan: string): SwarmTask[] {
    const now = Date.now();
    const swarm = this.getSwarmOrThrow(swarmId);
    const tasks = this.parseCoordinatorPlan(coordinatorPlan, swarm.sharedContext, now);

    const ids = new Set<string>();
    for (const task of tasks) {
      if (ids.has(task.id)) {
        throw new Error(`Duplicate task ID "${task.id}" in coordinator plan.`);
      }
      ids.add(task.id);
    }

    const fileToTask = new Map<string, string>();
    const conflicts: Array<{ filePath: string; a: string; b: string }> = [];
    for (const task of tasks) {
      for (const filePath of task.fileOwnership.files) {
        const previous = fileToTask.get(filePath);
        if (!previous) {
          fileToTask.set(filePath, task.id);
        } else if (previous !== task.id) {
          conflicts.push({ filePath, a: previous, b: task.id });
        }
      }
    }

    if (conflicts.length > 0) {
      const message = conflicts
        .slice(0, 20)
        .map((c) => `- ${c.filePath} claimed by ${c.a} and ${c.b}`)
        .join('\n');
      throw new Error(`Coordinator plan contains file ownership conflicts:\n${message}`);
    }

    console.log(`[${new Date(now).toISOString()}] [TASKS DECOMPOSED] ${swarmId} created ${tasks.length} tasks`);
    return tasks;
  }

  /**
   * Commit tasks into the swarm state.
   *
   * This validates:
   * - Task IDs unique within the swarm
   * - No file ownership conflicts across tasks
   * - Dependencies form a valid DAG
   *
   * It also reserves file ownership per task to prevent conflicts "before they happen".
   */
  public createTasks(swarmId: string, tasks: SwarmTask[]): void {
    const now = Date.now();
    const swarm = this.getSwarmOrThrow(swarmId);

    const existingTaskIds = new Set<string>(Array.from(swarm.tasks.keys()));
    const incomingIds = new Set<string>();
    for (const task of tasks) {
      if (existingTaskIds.has(task.id)) {
        throw new Error(`Task ID "${task.id}" already exists in swarm "${swarmId}".`);
      }
      if (incomingIds.has(task.id)) {
        throw new Error(`Duplicate task ID "${task.id}" in createTasks() input.`);
      }
      incomingIds.add(task.id);
    }

    // Validate file conflicts among incoming tasks.
    const fileToTask = new Map<string, string>();
    const duplicates: Array<{ filePath: string; a: string; b: string }> = [];
    for (const task of tasks) {
      for (const filePath of task.fileOwnership.files) {
        const prev = fileToTask.get(filePath);
        if (!prev) {
          fileToTask.set(filePath, task.id);
        } else if (prev !== task.id) {
          duplicates.push({ filePath, a: prev, b: task.id });
        }
      }
    }
    if (duplicates.length > 0) {
      const details = duplicates.slice(0, 20).map((d) => `- ${d.filePath}: ${d.a} vs ${d.b}`).join('\n');
      throw new Error(`File conflicts detected between tasks:\n${details}`);
    }

    const nextTasks = new Map<string, SwarmTask>(swarm.tasks);
    const nextDependencies = new Map<string, readonly string[]>(swarm.dependencies);
    const nextFileOwnershipMap = new Map<string, string>(swarm.fileOwnershipMap);

    // Atomicity: if any reservation fails, roll back reservations created in this method.
    const reservedInThisCall: SwarmTask[] = [];
    try {
      for (const task of tasks) {
        const reservedOwner = this.reservedOwnerForTask(swarmId, task.id);

        const queued: SwarmTask = {
          ...task,
          status: SwarmTaskStatus.QUEUED,
          fileOwnership: {
            ...task.fileOwnership,
            ownedBy: reservedOwner
          },
          tracking: {
            ...task.tracking,
            assignedAgent: '',
            assignedAt: 0,
            completedAt: undefined,
            reviewedBy: undefined,
            feedback: undefined
          }
        };

        this.fileOwnershipManager.assignOwnership(queued, reservedOwner);
        reservedInThisCall.push(queued);

        nextTasks.set(queued.id, queued);
        nextDependencies.set(queued.id, queued.fileOwnership.dependencies);
        for (const filePath of queued.fileOwnership.files) {
          nextFileOwnershipMap.set(filePath, queued.id);
        }

        console.log(`[${new Date(now).toISOString()}] [TASK CREATED] ${queued.id}: ${queued.title}`);
        this.emit('task-created', { swarmId, task: queued, timestamp: now });
      }
    } catch (error) {
      for (const reserved of reservedInThisCall) {
        try {
          this.fileOwnershipManager.releaseOwnership(reserved);
        } catch (releaseError) {
          console.error(`[${new Date(Date.now()).toISOString()}] [TASK CREATE ROLLBACK] Failed releasing reserved locks for ${reserved.id}:`, releaseError);
        }
      }
      throw error;
    }

    this.assertValidDAG(nextDependencies, nextTasks);
    const parallelGroups = this.calculateParallelGroups(Array.from(nextTasks.values()));

    const nextState: SwarmState = {
      ...swarm,
      tasks: nextTasks,
      dependencies: nextDependencies,
      fileOwnershipMap: nextFileOwnershipMap,
      parallelGroups
    };

    this.setSwarmState(swarmId, nextState, `createTasks(${tasks.length}) @ ${now}`);
    this.emit('tasks-created', { swarmId, tasks: tasks.map((t) => nextTasks.get(t.id)!).filter(Boolean), timestamp: now });
  }

  /**
   * Assign a queued task to an agent and enforce file ownership.
   */
  public assignTaskToAgent(swarmId: string, taskId: string, agentId: string): void {
    const now = Date.now();
    const swarm = this.getSwarmOrThrow(swarmId);
    const task = this.getTaskOrThrow(swarm, taskId);

    if (task.status !== SwarmTaskStatus.QUEUED) {
      throw new Error(`Task ${taskId} is not QUEUED; cannot assign (current=${task.status}).`);
    }

    const deps = swarm.dependencies.get(taskId) ?? task.fileOwnership.dependencies;
    const unmet = deps.filter((depId) => {
      const dep = swarm.tasks.get(depId);
      return !dep || dep.status !== SwarmTaskStatus.DONE;
    });
    if (unmet.length > 0) {
      throw new Error(`Task ${taskId} cannot be assigned; unmet dependencies: ${unmet.join(', ')}`);
    }

    this.fileOwnershipManager.releaseOwnership(task);

    const updatedTask: SwarmTask = {
      ...task,
      status: SwarmTaskStatus.ASSIGNED,
      fileOwnership: {
        ...task.fileOwnership,
        ownedBy: agentId
      },
      tracking: {
        ...task.tracking,
        assignedAgent: agentId,
        assignedAt: now
      }
    };

    try {
      this.fileOwnershipManager.assignOwnership(updatedTask, agentId);
    } catch (error) {
      // Best-effort: restore the prior reservation so the system doesn't silently unlock files.
      try {
        this.fileOwnershipManager.assignOwnership(task, task.fileOwnership.ownedBy);
      } catch (restoreError) {
        console.error(`[${new Date(Date.now()).toISOString()}] [TASK ASSIGN ROLLBACK] Failed restoring reservation for ${task.id}:`, restoreError);
      }
      throw error;
    }

    const nextTasks = new Map<string, SwarmTask>(swarm.tasks);
    nextTasks.set(taskId, updatedTask);

    const nextAgents = new Map<string, AgentState>(swarm.agents);
    const existingAgent = nextAgents.get(agentId);
    const nextAgent: AgentState = {
      agentId,
      role: existingAgent?.role ?? AgentRole.BUILDER,
      status: AgentRuntimeStatus.ACTIVE,
      currentTask: taskId,
      assignedTasks: this.addUnique(existingAgent?.assignedTasks ?? [], taskId),
      lastActivity: now,
      lastMessage: existingAgent?.lastMessage,
      blockReason: undefined,
      responseTime: existingAgent?.responseTime ?? 0
    };
    nextAgents.set(agentId, nextAgent);

    const nextState: SwarmState = {
      ...swarm,
      tasks: nextTasks,
      agents: nextAgents
    };

    this.setSwarmState(swarmId, nextState, `assignTaskToAgent(${taskId}, ${agentId}) @ ${now}`);
    this.startTaskTimer(swarmId, taskId, agentId, updatedTask.estimatedMinutes);

    this.emit('task-assigned', { swarmId, taskId, agentId, timestamp: now });
    console.log(`[${new Date(now).toISOString()}] [TASK ASSIGNED] ${taskId}  ${agentId}`);
  }

  /**
   * Mark a task as completed by a builder; moves it into REVIEWING for reviewer action.
   */
  public taskCompleted(swarmId: string, taskId: string, agentId: string, summary: string): void {
    const now = Date.now();
    const swarm = this.getSwarmOrThrow(swarmId);
    const task = this.getTaskOrThrow(swarm, taskId);

    if (task.tracking.assignedAgent !== agentId) {
      throw new Error(`Task ${taskId} is assigned to "${task.tracking.assignedAgent}", not "${agentId}".`);
    }

    if (task.status !== SwarmTaskStatus.ASSIGNED && task.status !== SwarmTaskStatus.BUILDING) {
      throw new Error(`Task ${taskId} cannot be completed from status ${task.status}.`);
    }

    const reviewRequired = task.execution?.reviewRequired ?? (task.execution?.role ?? AgentRole.BUILDER) === AgentRole.BUILDER;
    const hasReviewer = Array.from(swarm.agents.values()).some((a) => a.role === AgentRole.REVIEWER);
    const shouldReview = reviewRequired && hasReviewer;

    const updated: SwarmTask = {
      ...task,
      status: shouldReview ? SwarmTaskStatus.REVIEWING : SwarmTaskStatus.DONE,
      tracking: {
        ...task.tracking,
        completedAt: now,
        feedback: shouldReview ? task.tracking.feedback : summary
      }
    };

    const nextTasks = new Map<string, SwarmTask>(swarm.tasks);
    nextTasks.set(taskId, updated);

    const nextAgents = new Map<string, AgentState>(swarm.agents);
    const existingAgent = nextAgents.get(agentId);
    if (existingAgent) {
      nextAgents.set(agentId, {
        ...existingAgent,
        status: shouldReview ? AgentRuntimeStatus.WAITING : AgentRuntimeStatus.IDLE,
        currentTask: shouldReview ? existingAgent.currentTask : undefined,
        lastActivity: now,
        lastMessage: summary
      });
    }

    // If no review is required (or no reviewer exists), treat completion as an auto-approval.
    if (!shouldReview) {
      this.fileOwnershipManager.releaseOwnership(updated);
      const unblocked = this.unblockReadyTasks(swarm, nextTasks);
      for (const t of unblocked) {
        nextTasks.set(t.id, t);
        this.emit('task-created', { swarmId, task: t, timestamp: now });
      }
    }

    const nextState: SwarmState = { ...swarm, tasks: nextTasks, agents: nextAgents };
    this.setSwarmState(swarmId, nextState, `taskCompleted(${taskId}) @ ${now}`);

    this.stopTaskTimer(taskId);
    this.emit('task-completed', { swarmId, taskId, agentId, summary, timestamp: now });
    console.log(`[${new Date(now).toISOString()}] [TASK COMPLETED] ${taskId} by ${agentId}: ${summary}`);

    if (!shouldReview) {
      this.emit('task-approved', { swarmId, taskId, feedback: summary, timestamp: now });
      console.log(`[${new Date(now).toISOString()}] [TASK AUTO-APPROVED] ${taskId}: ${summary}`);

      if (this.isSwarmComplete(nextState)) {
        this.emit('swarm-complete', { swarmId, timestamp: now });
        console.log(`[${new Date(now).toISOString()}] [SWARM COMPLETE] ${swarmId}`);
      }
    }
  }

  /**
   * Apply a reviewer decision to a task.
   */
  public taskReviewed(swarmId: string, taskId: string, decision: ReviewDecision, feedback: string): void {
    const now = Date.now();
    const swarm = this.getSwarmOrThrow(swarmId);
    const task = this.getTaskOrThrow(swarm, taskId);

    if (task.status !== SwarmTaskStatus.REVIEWING) {
      throw new Error(`Task ${taskId} is not REVIEWING; cannot apply review decision (current=${task.status}).`);
    }

    const nextTasks = new Map<string, SwarmTask>(swarm.tasks);

    if (decision === ReviewDecision.APPROVE) {
      const approved: SwarmTask = {
        ...task,
        status: SwarmTaskStatus.DONE,
        tracking: {
          ...task.tracking,
          reviewedBy: 'reviewer',
          feedback
        }
      };
      nextTasks.set(taskId, approved);
      this.fileOwnershipManager.releaseOwnership(approved);

      const unblocked = this.unblockReadyTasks(swarm, nextTasks);
      for (const t of unblocked) {
        nextTasks.set(t.id, t);
        this.emit('task-created', { swarmId, task: t, timestamp: now });
      }

      this.emit('task-approved', { swarmId, taskId, feedback, timestamp: now });
      console.log(`[${new Date(now).toISOString()}] [TASK APPROVED] ${taskId}: ${feedback}`);
    } else {
      const rejected: SwarmTask = {
        ...task,
        status: SwarmTaskStatus.BUILDING,
        tracking: {
          ...task.tracking,
          feedback
        }
      };
      nextTasks.set(taskId, rejected);
      this.emit('task-rejected', { swarmId, taskId, feedback, timestamp: now });
      console.log(`[${new Date(now).toISOString()}] [TASK REJECTED] ${taskId}: ${feedback}`);
    }

    const nextState: SwarmState = { ...swarm, tasks: nextTasks };
    this.setSwarmState(swarmId, nextState, `taskReviewed(${taskId}, ${decision}) @ ${now}`);

    if (this.isSwarmComplete(nextState)) {
      this.emit('swarm-complete', { swarmId, timestamp: now });
      console.log(`[${new Date(now).toISOString()}] [SWARM COMPLETE] ${swarmId}`);
    }
  }

  public getBlockedTasks(swarmId: string): SwarmTask[] {
    const swarm = this.getSwarmOrThrow(swarmId);
    return Array.from(swarm.tasks.values()).filter((task) => task.status === SwarmTaskStatus.BLOCKED);
  }

  public getReadyTasks(swarmId: string): SwarmTask[] {
    const swarm = this.getSwarmOrThrow(swarmId);
    const tasks = Array.from(swarm.tasks.values()).filter((task) => task.status === SwarmTaskStatus.QUEUED);
    return tasks.filter((task) => this.dependenciesSatisfied(swarm, task.id));
  }

  public getParallelizableGroups(swarmId: string): string[][] {
    const swarm = this.getSwarmOrThrow(swarmId);
    return swarm.parallelGroups.map((group) => [...group]);
  }

  public monitorAgentProgress(swarmId: string, agentId: string): void {
    const now = Date.now();
    const swarm = this.getSwarmOrThrow(swarmId);
    const agent = swarm.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found in swarm "${swarmId}".`);
    }

    const idleMs = now - agent.lastActivity;
    const idleTooLong = idleMs > 5 * 60_000;

    if (idleTooLong && agent.currentTask) {
      const reason = `Agent idle for ${(idleMs / 1000).toFixed(0)}s while assigned to ${agent.currentTask}.`;
      this.emit('agent-blocked', { swarmId, agentId, taskId: agent.currentTask, reason, timestamp: now });
    }

    if (agent.currentTask) {
      const task = swarm.tasks.get(agent.currentTask);
      if (task && task.tracking.assignedAt > 0) {
        const elapsed = now - task.tracking.assignedAt;
        const budget = Math.max(10 * 60_000, task.estimatedMinutes * 60_000);
        if (elapsed > budget) {
          const reason = `Task appears stuck: ${agent.currentTask} running for ${(elapsed / 60_000).toFixed(1)}m (budget ${(budget / 60_000).toFixed(1)}m).`;
          this.emit('agent-blocked', { swarmId, agentId, taskId: agent.currentTask, reason, timestamp: now });
        }
      }
    }
  }

  public getSwarmStatus(swarmId: string): SwarmStatusSummary {
    const swarm = this.getSwarmOrThrow(swarmId);
    const tasks = Array.from(swarm.tasks.values());
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === SwarmTaskStatus.DONE).length;
    const blocked = tasks.filter((t) => t.status === SwarmTaskStatus.BLOCKED).length;
    const inProgress = tasks.filter((t) =>
      t.status === SwarmTaskStatus.ASSIGNED || t.status === SwarmTaskStatus.BUILDING || t.status === SwarmTaskStatus.REVIEWING
    ).length;

    const nextActions: string[] = [];
    const ready = tasks.filter((t) => t.status === SwarmTaskStatus.QUEUED && this.dependenciesSatisfied(swarm, t.id));
    if (ready.length > 0) {
      nextActions.push(`Assign next task: ${ready[0]!.id}`);
    }
    if (blocked > 0) {
      const firstBlocked = tasks.find((t) => t.status === SwarmTaskStatus.BLOCKED);
      if (firstBlocked) {
        nextActions.push(`Investigate blocker: ${firstBlocked.id}`);
      }
    }
    if (total > 0 && completed === total) {
      nextActions.push('Swarm complete; summarize results and close out.');
    }

    return {
      goal: swarm.overallGoal,
      totalTasks: total,
      completed,
      inProgress,
      blocked,
      agents: Array.from(swarm.agents.values()),
      nextActions
    };
  }

  public escalateBlocker(swarmId: string, blocker: BlockerInput): void {
    const now = Date.now();
    const swarm = this.getSwarmOrThrow(swarmId);
    const task = this.getTaskOrThrow(swarm, blocker.taskId);

    const updatedTask: SwarmTask = {
      ...task,
      status: SwarmTaskStatus.BLOCKED,
      blockedBy: task.blockedBy ?? [],
      tracking: {
        ...task.tracking,
        feedback: blocker.reason
      }
    };

    const nextTasks = new Map<string, SwarmTask>(swarm.tasks);
    nextTasks.set(task.id, updatedTask);

    const nextAgents = new Map<string, AgentState>(swarm.agents);
    const existingAgent = nextAgents.get(blocker.agentId);
    const updatedAgent: AgentState = existingAgent
      ? {
          ...existingAgent,
          status: AgentRuntimeStatus.BLOCKED,
          blockReason: blocker.reason,
          lastActivity: now
        }
      : {
          agentId: blocker.agentId,
          role: AgentRole.BUILDER,
          status: AgentRuntimeStatus.BLOCKED,
          currentTask: blocker.taskId,
          assignedTasks: [blocker.taskId],
          lastActivity: now,
          lastMessage: blocker.reason,
          blockReason: blocker.reason,
          responseTime: 0
        };
    nextAgents.set(blocker.agentId, updatedAgent);

    const nextState: SwarmState = { ...swarm, tasks: nextTasks, agents: nextAgents };
    this.setSwarmState(swarmId, nextState, `escalateBlocker(${blocker.taskId}) @ ${now}`);

    this.emit('blocker-escalated', {
      swarmId,
      agentId: blocker.agentId,
      taskId: blocker.taskId,
      reason: blocker.reason,
      suggestedFix: blocker.suggestedFix,
      timestamp: now
    });
    console.log(`[${new Date(now).toISOString()}] [BLOCKER ESCALATED] ${blocker.agentId} blocked on ${blocker.taskId}: ${blocker.reason}`);
  }

  private emit<EventName extends keyof SwarmOrchestratorEvents>(event: EventName, payload: SwarmOrchestratorEvents[EventName]): void {
    this.eventEmitter.emit(event, payload);
  }

  private getSwarmOrThrow(swarmId: string): SwarmState {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm "${swarmId}" not found.`);
    }
    return swarm;
  }

  private setSwarmState(swarmId: string, next: SwarmState, reason: string): void {
    const history = this.swarmHistory.get(swarmId) ?? [];
    const MAX = 500;
    const nextHistory = [...history, next].slice(-MAX);
    this.swarmHistory.set(swarmId, nextHistory);
    this.swarms.set(swarmId, next);
    console.log(`[${new Date(Date.now()).toISOString()}] [SWARM STATE] ${swarmId} updated: ${reason}`);
  }

  private getTaskOrThrow(swarm: SwarmState, taskId: TaskId): SwarmTask {
    const task = swarm.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" not found in swarm "${swarm.swarmId}".`);
    }
    return task;
  }

  private dependenciesSatisfied(swarm: SwarmState, taskId: TaskId): boolean {
    const deps = swarm.dependencies.get(taskId) ?? swarm.tasks.get(taskId)?.fileOwnership.dependencies ?? [];
    return deps.every((depId) => swarm.tasks.get(depId)?.status === SwarmTaskStatus.DONE);
  }

  private isSwarmComplete(swarm: SwarmState): boolean {
    const tasks = Array.from(swarm.tasks.values());
    return tasks.length > 0 && tasks.every((t) => t.status === SwarmTaskStatus.DONE);
  }

  private reservedOwnerForTask(swarmId: string, taskId: TaskId): string {
    return `reserved:${swarmId}:${taskId}`;
  }

  private startTaskTimer(swarmId: string, taskId: TaskId, agentId: string, estimatedMinutes: number): void {
    this.stopTaskTimer(taskId);
    const budgetMs = Math.max(10 * 60_000, Math.min(12 * 60 * 60_000, estimatedMinutes * 60_000));
    const timer = setTimeout(() => {
      const now = Date.now();
      this.emit('agent-blocked', {
        swarmId,
        agentId,
        taskId,
        reason: `Task timeout: ${taskId} exceeded ${(budgetMs / 60_000).toFixed(1)}m budget.`,
        suggestedFix: 'Coordinator should check logs, reduce scope, or split task.',
        timestamp: now
      });
      this.escalateBlocker(swarmId, {
        agentId,
        taskId,
        reason: `Task timeout after ${Math.round(budgetMs / 60_000)} minutes.`,
        suggestedFix: 'Split task or sequence conflicting dependencies.'
      });
    }, budgetMs);
    this.taskTimers.set(taskId, timer);
  }

  private stopTaskTimer(taskId: TaskId): void {
    const timer = this.taskTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.taskTimers.delete(taskId);
    }
  }

  private addUnique(list: readonly string[], value: string): string[] {
    return list.includes(value) ? [...list] : [...list, value];
  }

  private calculateParallelGroups(tasks: readonly SwarmTask[]): readonly (readonly TaskId[])[] {
    const groups: Array<{ ids: TaskId[]; files: Set<string> }> = [];
    const sorted = [...tasks].sort((a, b) => a.id.localeCompare(b.id));

    for (const task of sorted) {
      const taskFiles = new Set(Array.from(task.fileOwnership.files));
      let placed = false;
      for (const group of groups) {
        if (!this.setsOverlap(group.files, taskFiles)) {
          group.ids.push(task.id);
          for (const f of taskFiles) group.files.add(f);
          placed = true;
          break;
        }
      }
      if (!placed) {
        groups.push({ ids: [task.id], files: taskFiles });
      }
    }

    return groups.map((g) => g.ids);
  }

  private setsOverlap(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
    for (const value of a) {
      if (b.has(value)) {
        return true;
      }
    }
    return false;
  }

  private unblockReadyTasks(original: SwarmState, nextTasks: ReadonlyMap<string, SwarmTask>): SwarmTask[] {
    const unblocked: SwarmTask[] = [];
    for (const task of original.tasks.values()) {
      const candidate = nextTasks.get(task.id) ?? task;
      if (candidate.status !== SwarmTaskStatus.BLOCKED) {
        continue;
      }
      const deps = original.dependencies.get(candidate.id) ?? candidate.fileOwnership.dependencies;
      const ready = deps.every((depId) => (nextTasks.get(depId) ?? original.tasks.get(depId))?.status === SwarmTaskStatus.DONE);
      if (!ready) {
        continue;
      }
      unblocked.push({
        ...candidate,
        status: SwarmTaskStatus.QUEUED,
        blockedBy: []
      });
    }
    return unblocked;
  }

  private assertValidDAG(dependencies: ReadonlyMap<string, readonly string[]>, tasks: ReadonlyMap<string, SwarmTask>): void {
    for (const [taskId, deps] of dependencies.entries()) {
      for (const depId of deps) {
        if (!tasks.has(depId)) {
          throw new Error(`Task ${taskId} depends on missing task ${depId}.`);
        }
      }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (node: string, stack: string[]): void => {
      if (visited.has(node)) return;
      if (visiting.has(node)) {
        const cycleStart = stack.indexOf(node);
        const cycle = [...stack.slice(cycleStart), node];
        throw new Error(`Dependency cycle detected: ${cycle.join(' -> ')}`);
      }
      visiting.add(node);
      const deps = dependencies.get(node) ?? [];
      for (const dep of deps) {
        visit(dep, [...stack, node]);
      }
      visiting.delete(node);
      visited.add(node);
    };

    for (const taskId of tasks.keys()) {
      visit(taskId, []);
    }
  }

  private parseCoordinatorPlan(plan: string, sharedContext: SwarmSharedContext, now: UnixTimestampMs): SwarmTask[] {
    const lines = plan.split(/\r?\n/);
    const blocks: string[][] = [];
    let current: string[] = [];

    const pushCurrent = () => {
      const cleaned = current.map((l) => l.trimEnd());
      const hasContent = cleaned.some((l) => l.trim().length > 0);
      if (hasContent) blocks.push(cleaned);
      current = [];
    };

    for (const line of lines) {
      if (line.trim().startsWith('TASK:')) {
        pushCurrent();
      }
      current.push(line);
    }
    pushCurrent();

    const tasks: SwarmTask[] = [];
    for (const block of blocks) {
      const parsed = this.parseTaskBlock(block);
      const executionRole = parsed.role ?? AgentRole.BUILDER;
      const reviewRequired = parsed.reviewRequired ?? executionRole === AgentRole.BUILDER;
      tasks.push({
        id: parsed.id,
        title: parsed.title,
        description: parsed.description,
        status: SwarmTaskStatus.QUEUED,
        fileOwnership: {
          ownedBy: 'unassigned',
          files: new Set(parsed.files),
          dependencies: parsed.dependencies
        },
        context: {
          goal: parsed.title,
          requirements: [],
          acceptanceCriteria: parsed.acceptanceCriteria,
          codePatterns: sharedContext.existingPatterns,
          constraints: []
        },
        tracking: {
          assignedAgent: '',
          assignedAt: 0
        },
        execution: {
          role: executionRole,
          reviewRequired
        },
        priority: SwarmTaskPriority.MEDIUM,
        estimatedMinutes: 30
      });
    }

    console.log(`[${new Date(now).toISOString()}] [TASK PLAN PARSED] Parsed ${tasks.length} tasks`);
    return tasks;
  }

  private parseTaskBlock(block: readonly string[]): {
    id: TaskId;
    title: string;
    description: string;
    files: string[];
    dependencies: string[];
    acceptanceCriteria: string[];
    role?: AgentRole;
    reviewRequired?: boolean;
  } {
    const findLineValue = (prefix: string): string | null => {
      const line = block.find((l) => l.trimStart().startsWith(prefix));
      if (!line) return null;
      return line.slice(line.indexOf(prefix) + prefix.length).trim();
    };

    const id = findLineValue('TASK:') ?? '';
    const title = findLineValue('TITLE:') ?? '';
    const roleRaw = findLineValue('ROLE:') ?? '';
    const description = findLineValue('DESCRIPTION:') ?? '';

    if (!id) throw new Error('Invalid plan: missing TASK:');
    if (!title) throw new Error(`Invalid plan for ${id}: missing TITLE:`);
    if (!description) throw new Error(`Invalid plan for ${id}: missing DESCRIPTION:`);

    const role = roleRaw ? this.parseRoleValue(roleRaw, id) : undefined;

    const filesRaw = findLineValue('FILES_TO_MODIFY:') ?? '[]';
    const files = this.parseBracketList(filesRaw);
    const executionRole = role ?? AgentRole.BUILDER;
    const requiresFiles = executionRole === AgentRole.BUILDER;
    if (requiresFiles && files.length === 0) {
      throw new Error(`Invalid plan for ${id}: FILES_TO_MODIFY must contain at least one file.`);
    }

    const depsRaw = findLineValue('DEPENDENCIES:') ?? '[]';
    const dependencies = this.parseBracketList(depsRaw);

    const acceptanceCriteria: string[] = [];
    const startIdx = block.findIndex((l) => l.trimStart().startsWith('ACCEPTANCE_CRITERIA:'));
    if (startIdx >= 0) {
      for (let i = startIdx + 1; i < block.length; i += 1) {
        const line = block[i] ?? '';
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^[A-Z_]+:/.test(trimmed) && !trimmed.startsWith('-')) {
          break;
        }
        if (trimmed.startsWith('-')) {
          acceptanceCriteria.push(trimmed.replace(/^-+\s*/, '').trim());
        }
      }
    }

    const reviewRequired = role ? role === AgentRole.BUILDER : undefined;
    return { id, title, role, reviewRequired, description, files, dependencies, acceptanceCriteria };
  }

  private parseRoleValue(raw: string, taskId: string): AgentRole {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'builder') return AgentRole.BUILDER;
    if (normalized === 'scout') return AgentRole.SCOUT;
    if (normalized === 'reviewer') return AgentRole.REVIEWER;
    if (normalized === 'coordinator') {
      throw new Error(`Invalid plan for ${taskId}: ROLE must not be "coordinator". Use builder|scout|reviewer.`);
    }
    throw new Error(`Invalid plan for ${taskId}: unknown ROLE "${raw}". Use builder|scout|reviewer.`);
  }

  private parseBracketList(raw: string): string[] {
    const trimmed = raw.trim();
    const match = trimmed.match(/^\[(.*)\]$/);
    if (!match) {
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const inner = match[1] ?? '';
    return inner
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/^['"]|['"]$/g, ''));
  }
}
