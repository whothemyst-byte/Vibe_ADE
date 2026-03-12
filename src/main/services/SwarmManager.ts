import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildCoordinatorPrompt } from '@main/prompts/CoordinatorPrompt';
import { buildScoutPrompt } from '@main/prompts/ScoutPrompt';
import { buildBuilderPrompt } from '@main/prompts/BuilderPrompt';
import { buildReviewerWorkPrompt } from '@main/prompts/ReviewerPrompt';
import { FileOwnershipManager } from '@main/services/FileOwnershipManager';
import { blockerDetectionService, type BlockerDetectionService } from '@main/services/BlockerDetectionService';
import { SwarmEventBus, swarmEventBus } from '@main/services/SwarmEventBus';
import { SwarmOrchestrator } from '@main/services/SwarmOrchestrator';
import { SwarmTerminalManager } from '@main/services/SwarmTerminalManager';
import type { AgentRoleName, CliProvider } from '@main/services/AgentProcess';
import { AgentRole, type AgentState, type SwarmState, type SwarmTask, type TaskId } from '@main/types/SwarmOrchestration';

export type SwarmAgentConfig = Readonly<{
  agentId: string;
  role: AgentRoleName;
  cliProvider: CliProvider;
}>;

export type InitializeSwarmConfig = Readonly<{
  swarmId: string;
  goal: string;
  codebaseRoot: string;
  agents: readonly SwarmAgentConfig[];
}>;

type SwarmRuntime = {
  rootDir: string;
  agents: readonly SwarmAgentConfig[];
  stopRequested: boolean;
  loopRunning: boolean;
};

/**
 * SwarmManager wires together all core services and provides a single entrypoint
 * for initializing and running a multi-agent QuanSwarm session.
 *
 * Responsibilities:
 * - Initialize swarm state and shared context
 * - Start isolated agent PTY sessions
 * - Kick off coordinator decomposition and task assignment loop
 * - Bridge orchestrator + terminal + ownership events into {@link SwarmEventBus}
 * - Start blocker detection and escalation notifications
 */
export class SwarmManager {
  private readonly orchestrator: SwarmOrchestrator;
  private readonly fileOwnershipManager: FileOwnershipManager;
  private readonly terminalManager: SwarmTerminalManager;
  private readonly blockerDetection: BlockerDetectionService;
  private readonly eventBus: SwarmEventBus;

  // Shared emitter between terminal manager and message router for "review-requested" etc.
  private readonly relayEmitter: EventEmitter;

  private readonly runtime: Map<string, SwarmRuntime> = new Map();

  // Track which reviewer was asked to review which task.
  private readonly reviewerByTask: Map<string, string> = new Map();

  // Throttle agent status updates to UI.
  private readonly lastAgentStatusEmitAt: Map<string, number> = new Map();

  constructor() {
    this.orchestrator = SwarmOrchestrator.getInstance();
    this.fileOwnershipManager = FileOwnershipManager.getInstance();
    this.eventBus = swarmEventBus;
    this.relayEmitter = new EventEmitter();
    this.relayEmitter.setMaxListeners(200);
    this.terminalManager = new SwarmTerminalManager(this.orchestrator, this.relayEmitter);
    this.blockerDetection = blockerDetectionService;

    this.wireEventBridges();

    this.blockerDetection.attach({
      orchestrator: this.orchestrator,
      terminalManager: this.terminalManager,
      fileOwnershipManager: this.fileOwnershipManager,
      messenger: this.terminalManager,
      coordinatorAgentId: 'coordinator-1'
    });
  }

  /**
   * Initialize a swarm, start agents, and trigger coordinator decomposition.
   */
  public async initializeSwarm(config: InitializeSwarmConfig): Promise<SwarmState> {
    console.log(`[SWARM INIT] Starting swarm: ${config.swarmId}`);

    const codebaseStructure = await this.analyzeCodebase(config.codebaseRoot);
    const swarmState = this.orchestrator.createSwarm(config.swarmId, config.goal, codebaseStructure);

    this.runtime.set(config.swarmId, {
      rootDir: config.codebaseRoot,
      agents: config.agents,
      stopRequested: false,
      loopRunning: false
    });

    this.eventBus.emit({
      type: 'swarm-created',
      swarmId: config.swarmId,
      goal: config.goal,
      timestamp: Date.now()
    });

    const coordinator = config.agents.find((a) => a.role === 'coordinator');
    if (!coordinator) {
      throw new Error('No coordinator agent found');
    }

    // Ensure blocker notifications target the active coordinator agent ID for this swarm.
    this.blockerDetection.attach({
      orchestrator: this.orchestrator,
      terminalManager: this.terminalManager,
      fileOwnershipManager: this.fileOwnershipManager,
      messenger: this.terminalManager,
      coordinatorAgentId: coordinator.agentId
    });

    // Start agents in a resilient order:
    // 1) Scout (optional) to begin analysis early
    // 2) Coordinator next, and inject decomposition prompt immediately after it starts
    // 3) Remaining agents
    const scouts = config.agents.filter((a) => a.role === 'scout');
    const others = config.agents.filter((a) => a.role !== 'scout' && a.agentId !== coordinator.agentId);

    for (const agent of scouts) {
      await this.startAgent(config.swarmId, agent, config.codebaseRoot);
    }

    await this.startAgent(config.swarmId, coordinator, config.codebaseRoot);

    const coordinatorContext = buildCoordinatorPrompt(config.goal, codebaseStructure, config.agents.length);
    this.terminalManager.sendToAgent(coordinator.agentId, `${coordinatorContext}\r\n`);

    for (const agent of others) {
      await this.startAgent(config.swarmId, agent, config.codebaseRoot);
    }

    // Do NOT block swarm:create on coordinator output.
    // Task decomposition can take time depending on provider startup (models, MCP, etc).
    // Instead, start a background waiter that kicks off the scheduler loop when tasks appear.
    void this.eventBus
      .waitFor('tasks-decomposed', 120_000)
      .then(() => {
        const runtime = this.runtime.get(config.swarmId);
        if (!runtime || runtime.stopRequested) {
          return;
        }
        void this.runSwarmLoop(config.swarmId);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.eventBus.emit({
          type: 'error-occurred',
          swarmId: config.swarmId,
          severity: 'high',
          message: `Coordinator did not decompose tasks in time. ${message}`,
          component: 'SwarmManager.initializeSwarm',
          timestamp: Date.now()
        });
      });

    console.log(`[SWARM INIT] Agents started; awaiting task decomposition: ${config.swarmId}`);
    return swarmState;
  }

  /**
   * Stop a running swarm: stops its agents and halts the scheduling loop.
   */
  public async stopSwarm(swarmId: string): Promise<void> {
    const runtime = this.runtime.get(swarmId);
    if (!runtime) {
      return;
    }
    runtime.stopRequested = true;

    const agentIds = runtime.agents.map((a) => a.agentId);
    await Promise.all(agentIds.map((id) => this.terminalManager.stopAgent(id)));
    this.runtime.delete(swarmId);
  }

  /**
   * Get the latest orchestrator snapshot for a swarm.
   */
  public getSwarmState(swarmId: string): SwarmState {
    return this.orchestrator.getSwarmState(swarmId);
  }

  /**
   * Get recent events for UI/debugging.
   */
  public getRecentEvents(swarmId: string, count = 10) {
    return this.eventBus.getRecentEvents(swarmId, count);
  }

  public getSwarmStatus(swarmId: string) {
    return this.orchestrator.getSwarmStatus(swarmId);
  }

  /**
   * Subscribe to raw agent output for a swarm (used by renderer terminal view).
   */
  public onAgentOutput(
    listener: (payload: { swarmId: string; agentId: string; role: AgentRoleName; data: string; timestamp: number }) => void
  ): () => void {
    return this.terminalManager.on('agent-output', listener);
  }

  /**
   * Get a bounded snapshot of recent output per agent for a swarm.
   */
  public getAgentOutputSnapshot(swarmId: string, maxLinesPerAgent = 200): Array<{ agentId: string; role: AgentRoleName; lines: string[] }> {
    const runtime = this.runtime.get(swarmId);
    if (!runtime) {
      return [];
    }
    return runtime.agents.map((a) => ({
      agentId: a.agentId,
      role: a.role,
      lines: this.terminalManager.getAgentOutput(a.agentId, maxLinesPerAgent)
    }));
  }

  private async startAgent(swarmId: string, agentConfig: SwarmAgentConfig, codebaseRoot: string): Promise<void> {
    console.log(`[AGENT STARTUP] ${agentConfig.agentId} (${agentConfig.role})`);

    // Start PTY process.
    await this.terminalManager.startAgent({
      swarmId,
      agentId: agentConfig.agentId,
      role: agentConfig.role,
      cliProvider: agentConfig.cliProvider,
      workspaceDir: codebaseRoot,
      initialContext: ''
    });

    // Register agent with the orchestrator for role-aware routing/monitoring.
    this.orchestrator.registerAgent(swarmId, agentConfig.agentId, toAgentRoleEnum(agentConfig.role));

    // Start Scout analysis early (best-effort, no hard wait).
    if (agentConfig.role === 'scout') {
      const scoutPrompt = buildScoutPrompt(codebaseRoot);
      this.terminalManager.sendToAgent(agentConfig.agentId, `${scoutPrompt}\r\n`);
    }
  }

  /**
   * Main scheduler loop: assigns ready tasks to available builders.
   *
   * This loop is intentionally conservative: it assigns at most one task per builder
   * per iteration and yields frequently.
   */
  public async runSwarmLoop(swarmId: string): Promise<void> {
    const runtime = this.runtime.get(swarmId);
    if (!runtime) {
      throw new Error(`Swarm "${swarmId}" is not initialized.`);
    }
    if (runtime.loopRunning) {
      return;
    }
    runtime.loopRunning = true;

    try {
      while (!runtime.stopRequested) {
        const swarm = this.orchestrator.getSwarmState(swarmId);
        const status = this.orchestrator.getSwarmStatus(swarmId);

        if (status.totalTasks > 0 && status.completed === status.totalTasks) {
          // Completed; allow orchestrator to emit swarm-complete and exit.
          return;
        }

        const readyTasks = this.orchestrator.getReadyTasks(swarmId);
        if (readyTasks.length === 0) {
          this.blockerDetection.checkAllTasks(swarmId, this.orchestrator);
          await sleep(5_000);
          continue;
        }

        const availableByRole = this.getAvailableAgentsByRole(swarm, runtime.agents);
        if (availableByRole.size === 0) {
          this.blockerDetection.checkAllTasks(swarmId, this.orchestrator);
          await sleep(5_000);
          continue;
        }

        for (const task of readyTasks) {
          const role = task.execution?.role ?? AgentRole.BUILDER;
          const pool = availableByRole.get(role) ?? [];
          const next = pool.shift();
          if (!next) {
            // If no agent exists for this role at all, emit a high-signal error once and keep going.
            if (!runtime.agents.some((a) => toAgentRoleEnum(a.role) === role)) {
              this.eventBus.emit({
                type: 'error-occurred',
                swarmId,
                severity: 'high',
                message: `No agents configured for ROLE=${role}, but ready task ${task.id} requires it.`,
                component: 'SwarmManager.runSwarmLoop',
                timestamp: Date.now()
              });
            }
            continue;
          }
          await this.assignTaskToAgent(swarmId, task.id as TaskId, next.agentId);
        }

        this.blockerDetection.checkAllTasks(swarmId, this.orchestrator);
        await sleep(5_000);
      }
    } finally {
      const finalRuntime = this.runtime.get(swarmId);
      if (finalRuntime) {
        finalRuntime.loopRunning = false;
      }
    }
  }

  private async assignTaskToAgent(swarmId: string, taskId: TaskId, agentId: string): Promise<void> {
    console.log(`[TASK ASSIGN] ${taskId}  ${agentId}`);

    this.orchestrator.assignTaskToAgent(swarmId, taskId, agentId);
    const state = this.orchestrator.getSwarmState(swarmId);
    const task = state.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task "${taskId}" missing after assignment.`);
    }

    // Emit "task-started" for UI purposes (orchestrator uses ASSIGNED internally).
    this.eventBus.emit({
      type: 'task-started',
      swarmId,
      taskId,
      agentId,
      timestamp: Date.now()
    });

    // Send task prompt (role-aware).
    const executionRole = task.execution?.role ?? AgentRole.BUILDER;
    const prompt =
      executionRole === AgentRole.REVIEWER
        ? buildReviewerWorkPrompt(task, state.sharedContext)
        : buildBuilderPrompt(task, state.sharedContext);
    this.terminalManager.sendToAgent(agentId, `${prompt}\r\n`);
  }

  private getAvailableAgentsByRole(swarm: SwarmState, agents: readonly SwarmAgentConfig[]): Map<AgentRole, SwarmAgentConfig[]> {
    const busy = new Set<string>();
    for (const task of swarm.tasks.values()) {
      const owner = task.tracking.assignedAgent;
      if (!owner) continue;
      if (task.status === 'ASSIGNED' || task.status === 'BUILDING' || task.status === 'BLOCKED') {
        busy.add(owner);
      }
    }

    const byRole = new Map<AgentRole, SwarmAgentConfig[]>();
    for (const agent of agents) {
      if (busy.has(agent.agentId)) continue;
      const role = toAgentRoleEnum(agent.role);
      const prev = byRole.get(role) ?? [];
      byRole.set(role, [...prev, agent]);
    }
    return byRole;
  }

  private wireEventBridges(): void {
    // Orchestrator -> SwarmEventBus.
    this.orchestrator.on('task-created', ({ swarmId, task, timestamp }) => {
      this.eventBus.emit({ type: 'task-created', swarmId, task, timestamp });
    });
    this.orchestrator.on('tasks-created', ({ swarmId, tasks, timestamp }) => {
      this.eventBus.emit({ type: 'tasks-decomposed', swarmId, taskCount: tasks.length, tasks, timestamp });
    });
    this.orchestrator.on('task-assigned', ({ swarmId, taskId, agentId, timestamp }) => {
      this.eventBus.emit({ type: 'task-assigned', swarmId, taskId, agentId, timestamp });
      this.eventBus.emit({
        type: 'agent-status-changed',
        swarmId,
        agentId,
        status: 'ACTIVE',
        currentTask: taskId,
        timestamp
      });
    });
    this.orchestrator.on('task-completed', ({ swarmId, taskId, agentId, summary, timestamp }) => {
      this.eventBus.emit({ type: 'task-completed', swarmId, taskId, agentId, summary, timestamp });
      this.eventBus.emit({
        type: 'agent-status-changed',
        swarmId,
        agentId,
        status: 'IDLE',
        currentTask: undefined,
        timestamp
      });
    });
    this.orchestrator.on('task-approved', ({ swarmId, taskId, feedback, timestamp }) => {
      const reviewerId = this.reviewerByTask.get(`${swarmId}:${taskId}`) ?? 'reviewer-1';
      this.eventBus.emit({ type: 'task-approved', swarmId, taskId, reviewerId, feedback, timestamp });
    });
    this.orchestrator.on('task-rejected', ({ swarmId, taskId, feedback, timestamp }) => {
      const reviewerId = this.reviewerByTask.get(`${swarmId}:${taskId}`) ?? 'reviewer-1';
      this.eventBus.emit({ type: 'task-rejected', swarmId, taskId, reviewerId, feedback, blockers: [], timestamp });
    });
    this.orchestrator.on('agent-blocked', ({ swarmId, agentId, taskId, reason, suggestedFix, timestamp }) => {
      this.eventBus.emit({ type: 'agent-blocked', swarmId, agentId, taskId, reason, suggestedFix, timestamp });
      this.eventBus.emit({ type: 'agent-status-changed', swarmId, agentId, status: 'BLOCKED', currentTask: taskId, timestamp });
    });
    this.orchestrator.on('swarm-complete', ({ swarmId, timestamp }) => {
      try {
        const state = this.orchestrator.getSwarmState(swarmId);
        const totalTasks = state.tasks.size;
        const timeElapsed = timestamp - state.createdAt;
        this.eventBus.emit({ type: 'swarm-completed', swarmId, totalTasks, timeElapsed, timestamp });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.eventBus.emit({
          type: 'error-occurred',
          swarmId,
          severity: 'medium',
          message: `Failed computing swarm completion details: ${message}`,
          component: 'SwarmManager',
          timestamp: Date.now()
        });
      }
    });

    // Terminal lifecycle -> SwarmEventBus.
    this.terminalManager.on('agent-started', ({ swarmId, agentId, role, timestamp }) => {
      this.eventBus.emit({ type: 'agent-started', swarmId, agentId, role: role as AgentState['role'], timestamp });
    });
    this.terminalManager.on('agent-ready', ({ swarmId, agentId, role, timestamp }) => {
      this.eventBus.emit({
        type: 'agent-status-changed',
        swarmId,
        agentId,
        status: 'IDLE',
        currentTask: undefined,
        timestamp
      });
    });
    this.terminalManager.on('agent-stopped', ({ swarmId, agentId, timestamp }) => {
      this.eventBus.emit({ type: 'agent-stopped', swarmId, agentId, timestamp });
      this.eventBus.emit({ type: 'agent-status-changed', swarmId, agentId, status: 'OFFLINE', currentTask: undefined, timestamp });
    });
    this.terminalManager.on('agent-crashed', ({ swarmId, agentId, exitCode, timestamp }) => {
      this.eventBus.emit({
        type: 'error-occurred',
        swarmId,
        severity: 'critical',
        message: `Agent crashed: ${agentId} exitCode=${exitCode}`,
        component: 'SwarmTerminalManager',
        timestamp
      });
      this.eventBus.emit({ type: 'agent-status-changed', swarmId, agentId, status: 'OFFLINE', currentTask: undefined, timestamp });
    });
    this.terminalManager.on('agent-activity', ({ swarmId, agentId, lastActivity }) => {
      // Throttle activity-driven status refreshes to reduce event spam.
      const key = `${swarmId}:${agentId}`;
      const now = Date.now();
      const last = this.lastAgentStatusEmitAt.get(key) ?? 0;
      if (now - last < 2_000) return;
      this.lastAgentStatusEmitAt.set(key, now);

      const state = this.safeGetSwarmState(swarmId);
      const agent = state?.agents.get(agentId) ?? null;
      const currentTask = agent?.currentTask;
      const status = agent ? toUiStatus(agent.status) : 'IDLE';
      this.eventBus.emit({
        type: 'agent-status-changed',
        swarmId,
        agentId,
        status,
        currentTask: currentTask ?? undefined,
        timestamp: lastActivity
      });
    });

    // File ownership -> SwarmEventBus.
    this.fileOwnershipManager.on('file-locked', ({ filePath, agentId, taskId, timestamp }) => {
      const swarmId = this.findSwarmIdForTask(taskId);
      if (swarmId === 'unknown') {
        return;
      }
      this.eventBus.emit({
        type: 'file-ownership-assigned',
        swarmId,
        taskId,
        agentId,
        files: [filePath],
        timestamp
      });
    });
    this.fileOwnershipManager.on('conflict-detected', ({ taskId, conflict, timestamp }) => {
      const swarmId = this.findSwarmIdForTask(taskId);
      if (swarmId === 'unknown') {
        return;
      }
      this.eventBus.emit({
        type: 'file-conflict-detected',
        swarmId,
        conflict,
        timestamp
      });
    });

    // Router events (via shared emitter) -> SwarmEventBus.
    this.relayEmitter.on('review-requested', (payload: { swarmId: string; taskId: string; reviewerId: string; timestamp: number }) => {
      this.reviewerByTask.set(`${payload.swarmId}:${payload.taskId}`, payload.reviewerId);
      this.eventBus.emit({
        type: 'task-review-started',
        swarmId: payload.swarmId,
        taskId: payload.taskId,
        reviewerId: payload.reviewerId,
        timestamp: payload.timestamp
      });
    });

    this.relayEmitter.on('message-routed', (payload: { swarmId: string; messageType: string; timestamp: number }) => {
      this.eventBus.emit({
        type: 'message-parsed',
        swarmId: payload.swarmId,
        sourceAgentId: 'unknown',
        messageType: payload.messageType,
        timestamp: payload.timestamp
      });
    });

    this.relayEmitter.on('message-routing-failed', (payload: { swarmId: string; messageType: string; error: string; timestamp: number }) => {
      this.eventBus.emit({
        type: 'error-occurred',
        swarmId: payload.swarmId,
        severity: 'high',
        message: `Message routing failed type=${payload.messageType}: ${payload.error}`,
        component: 'MessageRouter',
        timestamp: payload.timestamp
      });
    });
  }

  private safeGetSwarmState(swarmId: string): SwarmState | null {
    try {
      return this.orchestrator.getSwarmState(swarmId);
    } catch {
      return null;
    }
  }

  private resolveRole(agentId: string, swarmId: string): AgentRoleName | null {
    const runtime = this.runtime.get(swarmId);
    if (!runtime) return null;
    return runtime.agents.find((a) => a.agentId === agentId)?.role ?? null;
  }

  private findSwarmIdForTask(taskId: TaskId): string {
    for (const [swarmId] of this.runtime.entries()) {
      try {
        const state = this.orchestrator.getSwarmState(swarmId);
        if (state.tasks.has(taskId)) {
          return swarmId;
        }
      } catch {
        // ignore
      }
    }
    return 'unknown';
  }

  private async analyzeCodebase(rootDir: string): Promise<string> {
    const stat = await fs.stat(rootDir).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      throw new Error(`codebaseRoot is not a directory: ${rootDir}`);
    }

    const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.turbo', '.cache']);
    const maxDepth = 4;
    const maxEntries = 5_000;
    let entries = 0;

    const walk = async (dir: string, depth: number): Promise<string[]> => {
      if (depth > maxDepth) {
        return [];
      }
      const rel = path.relative(rootDir, dir) || '.';
      const lines: string[] = depth === 0 ? [rel] : [];
      const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      const sorted = items.sort((a, b) => a.name.localeCompare(b.name));
      for (const item of sorted) {
        if (entries >= maxEntries) {
          lines.push(`${'  '.repeat(depth + 1)}… (truncated)`);
          return lines;
        }
        if (ignored.has(item.name)) {
          continue;
        }
        entries += 1;
        const prefix = `${'  '.repeat(depth + 1)}- ${item.name}`;
        if (item.isDirectory()) {
          lines.push(`${prefix}/`);
          const childDir = path.join(dir, item.name);
          const childLines = await walk(childDir, depth + 1);
          lines.push(...childLines.map((l) => `${'  '.repeat(depth + 1)}${l}`));
        } else {
          lines.push(prefix);
        }
      }
      return lines;
    };

    const lines = await walk(rootDir, 0);
    return lines.join('\n');
  }
}

export const swarmManager = new SwarmManager();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toUiStatus(runtime: AgentState['status']): 'IDLE' | 'ACTIVE' | 'THINKING' | 'BLOCKED' | 'OFFLINE' {
  if (runtime === 'IDLE') return 'IDLE';
  if (runtime === 'ACTIVE') return 'ACTIVE';
  if (runtime === 'THINKING') return 'THINKING';
  if (runtime === 'BLOCKED') return 'BLOCKED';
  return 'IDLE';
}

function toAgentRoleEnum(role: AgentRoleName): AgentRole {
  if (role === 'coordinator') return AgentRole.COORDINATOR;
  if (role === 'scout') return AgentRole.SCOUT;
  if (role === 'reviewer') return AgentRole.REVIEWER;
  return AgentRole.BUILDER;
}
