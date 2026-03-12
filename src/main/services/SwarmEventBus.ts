import type {
  AgentState,
  AgentRuntimeStatus,
  AgentRole,
  SwarmSharedContext,
  SwarmState,
  SwarmTask,
  SwarmTaskPriority,
  SwarmTaskStatus
} from '@main/types/SwarmOrchestration';
import type {
  AgentUiStatus,
  SwarmEvent,
  SwarmEventFilter,
  SwarmEventListener,
  SwarmUiBridge
} from '@main/types/SwarmEvents';

type ListenerEntry = Readonly<{
  listener: SwarmEventListener;
  filter?: SwarmEventFilter;
}>;

type ListenerMap = Map<SwarmEventListener, SwarmEventFilter | undefined>;

/**
 * Central event dispatcher for QuanSwarm real-time synchronization.
 *
 * Design goals:
 * - Type-safe, discriminated events
 * - Efficient fan-out with optional per-listener filters
 * - Order-preserving history with bounded size
 * - No memory leaks: all subscriptions return unsubscribe functions
 * - Optional UI bridge support for broadcasting updates to renderer
 */
export class SwarmEventBus {
  private readonly listeners: Map<string, ListenerMap> = new Map();
  private eventHistory: SwarmEvent[] = [];
  private readonly maxHistorySize: number = 1000;

  private uiBridge: SwarmUiBridge | null = null;

  // Best-effort, incremental state projection for UI/state-change listeners.
  private readonly projections: Map<string, SwarmState> = new Map();

  // Event dedupe: ignore identical fingerprints within a short window.
  private readonly recentFingerprints: Map<string, number> = new Map();
  private readonly dedupeWindowMs = 250;
  private readonly maxRecentFingerprints = 2000;

  /**
   * Attach or replace the UI bridge.
   */
  public attachUiBridge(bridge: SwarmUiBridge | null): void {
    this.uiBridge = bridge;
  }

  /**
   * Subscribe to an event type.
   *
   * Use `"*"` to subscribe to all events.
   */
  public on(eventType: string, listener: SwarmEventListener, filter?: SwarmEventFilter): () => void {
    const type = eventType.trim();
    if (!type) {
      throw new Error('eventType must be non-empty.');
    }

    const map = this.listeners.get(type) ?? new Map();
    map.set(listener, filter);
    this.listeners.set(type, map);

    return () => this.off(type, listener);
  }

  /**
   * Unsubscribe a listener from an event type.
   */
  public off(eventType: string, listener: SwarmEventListener): void {
    const map = this.listeners.get(eventType);
    if (!map) return;
    map.delete(listener);
    if (map.size === 0) {
      this.listeners.delete(eventType);
    }
  }

  /**
   * Subscribe once and resolve the returned promise when the event fires.
   */
  public once(eventType: string, listener: SwarmEventListener): Promise<SwarmEvent> {
    return new Promise((resolve) => {
      const unsubscribe = this.on(eventType, (event) => {
        try {
          listener(event);
        } finally {
          unsubscribe();
          resolve(event);
        }
      });
    });
  }

  /**
   * Emit a single event.
   */
  public emit(event: SwarmEvent): void {
    const validated = this.validateEvent(event);
    if (!validated.ok) {
      console.warn(`[SwarmEventBus] Dropping invalid event type=${event?.type ?? 'unknown'}: ${validated.error}`);
      return;
    }

    if (this.isDuplicate(event)) {
      return;
    }

    this.eventHistory = [...this.eventHistory, event].slice(-this.maxHistorySize);

    const nextProjection = this.applyToProjection(event);
    if (nextProjection) {
      this.projections.set(event.swarmId, nextProjection);
    }

    this.deliver(event);
    this.broadcastToUi(event, nextProjection);
    this.logEvent(event);
  }

  /**
   * Emit multiple events in order.
   */
  public broadcast(events: SwarmEvent[]): void {
    for (const event of events) {
      this.emit(event);
    }
  }

  /**
   * Listen to swarm state changes for a specific swarm ID.
   *
   * This uses the event projection maintained by the bus.
   */
  public onSwarmStateChange(swarmId: string, listener: (state: SwarmState) => void): () => void {
    const filter: SwarmEventFilter = (event) => event.swarmId === swarmId;
    const handler: SwarmEventListener = (event) => {
      const state = this.projections.get(event.swarmId);
      if (state) {
        listener(state);
      }
    };

    // Emit current projection immediately if available.
    const existing = this.projections.get(swarmId);
    if (existing) {
      listener(existing);
    }

    return this.on('*', handler, filter);
  }

  /**
   * Get full event history for a swarm, optionally filtered.
   */
  public getEventHistory(swarmId: string, filter?: SwarmEventFilter): SwarmEvent[] {
    const events = this.eventHistory.filter((e) => e.swarmId === swarmId);
    return filter ? events.filter(filter) : events;
  }

  /**
   * Get recent N events for a swarm.
   */
  public getRecentEvents(swarmId: string, count: number = 10): SwarmEvent[] {
    const safeCount = Math.max(0, Math.min(count, 1000));
    const events = this.eventHistory.filter((e) => e.swarmId === swarmId);
    return events.slice(-safeCount);
  }

  /**
   * Clear history for a given swarm, or clear everything if no swarmId is provided.
   */
  public clearHistory(swarmId?: string): void {
    if (!swarmId) {
      this.eventHistory = [];
      this.projections.clear();
      return;
    }
    this.eventHistory = this.eventHistory.filter((e) => e.swarmId !== swarmId);
    this.projections.delete(swarmId);
  }

  /**
   * Wait for a specific event type, with an optional timeout.
   */
  public async waitFor(eventType: string, timeout: number = 30_000): Promise<SwarmEvent> {
    const type = eventType.trim();
    if (!type) {
      throw new Error('eventType must be non-empty.');
    }
    const safeTimeout = Math.max(0, Math.min(timeout, 10 * 60_000));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timed out waiting for event "${type}" after ${safeTimeout}ms.`));
      }, safeTimeout);

      const unsubscribe = this.on(type, (event) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(event);
      });
    });
  }

  /**
   * Subscribe to multiple event types at once.
   */
  public subscribeToMultiple(eventTypes: string[], listener: SwarmEventListener): () => void {
    const unsubs = eventTypes.map((type) => this.on(type, listener));
    return () => unsubs.forEach((u) => u());
  }

  private deliver(event: SwarmEvent): void {
    const typeListeners = this.listeners.get(event.type) ?? new Map();
    const wildcardListeners = this.listeners.get('*') ?? new Map();

    this.deliverToMap(typeListeners, event);
    this.deliverToMap(wildcardListeners, event);
  }

  private deliverToMap(map: ListenerMap, event: SwarmEvent): void {
    for (const [listener, filter] of map.entries()) {
      try {
        if (filter && !filter(event)) {
          continue;
        }
        listener(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[SwarmEventBus] Listener error for type=${event.type}: ${message}`);
      }
    }
  }

  private broadcastToUi(event: SwarmEvent, projection: SwarmState | null): void {
    if (!this.uiBridge) {
      return;
    }
    try {
      this.uiBridge.emitEvent(event);
      if (projection) {
        this.uiBridge.emitSwarmUpdate(event.swarmId, projection);
      }
      if (event.type === 'agent-status-changed') {
        const agent = projection?.agents.get(event.agentId);
        if (agent) {
          this.uiBridge.emitAgentStatus(event.swarmId, agent);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[SwarmEventBus] UI bridge failed: ${message}`);
    }
  }

  private validateEvent(event: SwarmEvent): { ok: true } | { ok: false; error: string } {
    const safeStr = (value: unknown, max = 200_000): value is string =>
      typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0');

    if (!event || typeof event !== 'object') return { ok: false, error: 'event must be an object' };
    if (!safeStr(event.type, 80)) return { ok: false, error: 'event.type must be a non-empty string' };
    if (!safeStr(event.swarmId, 128)) return { ok: false, error: 'event.swarmId must be a non-empty string' };
    if (!Number.isFinite(event.timestamp)) return { ok: false, error: 'event.timestamp must be a number' };

    // Spot-check a few common required fields depending on type.
    switch (event.type) {
      case 'swarm-created':
        return safeStr(event.goal, 10_000) ? { ok: true } : { ok: false, error: 'goal required' };
      case 'task-assigned':
      case 'task-started':
        return safeStr(event.taskId, 64) && safeStr(event.agentId, 64) ? { ok: true } : { ok: false, error: 'taskId/agentId required' };
      case 'task-completed':
        return safeStr(event.taskId, 64) && safeStr(event.agentId, 64) && safeStr(event.summary, 50_000) ? { ok: true } : { ok: false, error: 'taskId/agentId/summary required' };
      case 'error-occurred':
        return safeStr(event.message, 50_000) && safeStr(event.component, 256) ? { ok: true } : { ok: false, error: 'message/component required' };
      default:
        return { ok: true };
    }
  }

  private fingerprint(event: SwarmEvent): string {
    const base = `${event.type}|${event.swarmId}|${event.timestamp}`;
    switch (event.type) {
      case 'task-created':
        return `${base}|${event.task.id}`;
      case 'task-assigned':
      case 'task-started':
      case 'task-completed':
        return `${base}|${event.taskId}|${event.agentId}`;
      case 'agent-status-changed':
        return `${base}|${event.agentId}|${event.status}|${event.currentTask ?? ''}`;
      case 'error-occurred':
        return `${base}|${event.component}|${event.severity}|${event.message}`;
      default:
        return base;
    }
  }

  private isDuplicate(event: SwarmEvent): boolean {
    const key = this.fingerprint(event);
    const now = Date.now();

    const last = this.recentFingerprints.get(key);
    if (last && now - last <= this.dedupeWindowMs) {
      return true;
    }
    this.recentFingerprints.set(key, now);

    // Bound memory.
    if (this.recentFingerprints.size > this.maxRecentFingerprints) {
      const entries = Array.from(this.recentFingerprints.entries()).sort((a, b) => a[1] - b[1]);
      for (const [k] of entries.slice(0, Math.floor(this.maxRecentFingerprints * 0.2))) {
        this.recentFingerprints.delete(k);
      }
    }

    return false;
  }

  private logEvent(event: SwarmEvent): void {
    // Keep logs compact and consistent.
    const now = new Date(event.timestamp).toISOString();
    if (event.type === 'task-completed') {
      console.log(`[${now}] [EVENT] task-completed ${event.taskId} by ${event.agentId}`);
      return;
    }
    if (event.type === 'task-assigned') {
      console.log(`[${now}] [EVENT] task-assigned ${event.taskId} -> ${event.agentId}`);
      return;
    }
    console.log(`[${now}] [EVENT] ${event.type} swarm=${event.swarmId}`);
  }

  private applyToProjection(event: SwarmEvent): SwarmState | null {
    const current = this.projections.get(event.swarmId) ?? null;
    const next = current ? cloneSwarmState(current) : createEmptyProjection(event.swarmId);

    switch (event.type) {
      case 'swarm-created': {
        next.overallGoal = event.goal;
        next.createdAt = event.timestamp;
        break;
      }
      case 'tasks-decomposed': {
        for (const task of event.tasks) {
          next.tasks.set(task.id, task);
          // File ownership visualization: map each declared file to its owning task ID.
          for (const filePath of task.fileOwnership.files) {
            next.fileOwnershipMap.set(filePath, task.id);
          }
        }
        break;
      }
      case 'task-created': {
        next.tasks.set(event.task.id, event.task);
        for (const filePath of event.task.fileOwnership.files) {
          next.fileOwnershipMap.set(filePath, event.task.id);
        }
        break;
      }
      case 'task-assigned': {
        const task = ensureTask(next, event.taskId);
        next.tasks.set(event.taskId, {
          ...task,
          status: 'ASSIGNED' as SwarmTaskStatus,
          tracking: {
            ...task.tracking,
            assignedAgent: event.agentId,
            assignedAt: event.timestamp
          },
          fileOwnership: {
            ...task.fileOwnership,
            ownedBy: event.agentId
          }
        });
        const agent = ensureAgent(next, event.agentId);
        next.agents.set(event.agentId, {
          ...agent,
          status: 'ACTIVE' as AgentRuntimeStatus,
          currentTask: event.taskId,
          lastActivity: event.timestamp
        });
        break;
      }
      case 'task-started': {
        const task = ensureTask(next, event.taskId);
        next.tasks.set(event.taskId, { ...task, status: 'BUILDING' as SwarmTaskStatus });
        break;
      }
      case 'task-review-started': {
        const task = ensureTask(next, event.taskId);
        next.tasks.set(event.taskId, { ...task, status: 'REVIEWING' as SwarmTaskStatus, tracking: { ...task.tracking, reviewedBy: event.reviewerId } });
        break;
      }
      case 'task-completed': {
        const task = ensureTask(next, event.taskId);
        next.tasks.set(event.taskId, {
          ...task,
          status: 'REVIEWING' as SwarmTaskStatus,
          tracking: { ...task.tracking, completedAt: event.timestamp, feedback: task.tracking.feedback }
        });
        break;
      }
      case 'task-approved': {
        const task = ensureTask(next, event.taskId);
        next.tasks.set(event.taskId, {
          ...task,
          status: 'DONE' as SwarmTaskStatus,
          tracking: { ...task.tracking, reviewedBy: event.reviewerId, feedback: event.feedback }
        });
        break;
      }
      case 'task-rejected': {
        const task = ensureTask(next, event.taskId);
        next.tasks.set(event.taskId, {
          ...task,
          status: 'BUILDING' as SwarmTaskStatus,
          tracking: { ...task.tracking, reviewedBy: event.reviewerId, feedback: event.feedback }
        });
        break;
      }
      case 'agent-started': {
        const agent = ensureAgent(next, event.agentId);
        next.agents.set(event.agentId, {
          ...agent,
          role: event.role,
          status: 'IDLE' as AgentRuntimeStatus,
          lastActivity: event.timestamp
        });
        break;
      }
      case 'agent-status-changed': {
        const agent = ensureAgent(next, event.agentId);
        next.agents.set(event.agentId, {
          ...agent,
          status: toRuntimeStatus(event.status),
          currentTask: event.currentTask ?? agent.currentTask,
          lastActivity: event.timestamp
        });
        break;
      }
      case 'agent-blocked': {
        const agent = ensureAgent(next, event.agentId);
        next.agents.set(event.agentId, {
          ...agent,
          status: 'BLOCKED' as AgentRuntimeStatus,
          currentTask: event.taskId,
          blockReason: event.reason,
          lastActivity: event.timestamp
        });
        const task = ensureTask(next, event.taskId);
        next.tasks.set(event.taskId, { ...task, status: 'BLOCKED' as SwarmTaskStatus, blockedBy: task.blockedBy ?? [] });
        break;
      }
      case 'agent-stopped': {
        const agent = ensureAgent(next, event.agentId);
        next.agents.set(event.agentId, { ...agent, status: 'WAITING' as AgentRuntimeStatus, lastActivity: event.timestamp });
        break;
      }
      case 'file-ownership-assigned': {
        for (const filePath of event.files) {
          next.fileOwnershipMap.set(filePath, event.taskId);
        }
        break;
      }
      case 'blocker-escalated': {
        const agent = ensureAgent(next, event.agentId);
        next.agents.set(event.agentId, { ...agent, status: 'BLOCKED' as AgentRuntimeStatus, blockReason: event.blockReason, lastActivity: event.timestamp });
        const task = ensureTask(next, event.taskId);
        next.tasks.set(event.taskId, { ...task, status: 'BLOCKED' as SwarmTaskStatus, tracking: { ...task.tracking, feedback: event.blockReason } });
        break;
      }
      case 'swarm-completed': {
        // No structural change required; completion can be derived from task statuses.
        break;
      }
      case 'error-occurred': {
        // No structural change required for the state model.
        break;
      }
      default:
        break;
    }

    return freezeProjection(next);
  }
}

/**
 * Export a singleton instance for global use.
 */
export const swarmEventBus = new SwarmEventBus();

// ---- Projection helpers ----

type MutableSwarmState = {
  swarmId: string;
  overallGoal: string;
  createdAt: number;
  tasks: Map<string, SwarmTask>;
  fileOwnershipMap: Map<string, string>;
  agents: Map<string, AgentState>;
  parallelGroups: string[][];
  dependencies: Map<string, string[]>;
  sharedContext: SwarmSharedContext;
};

function createEmptyProjection(swarmId: string): MutableSwarmState {
  return {
    swarmId,
    overallGoal: '',
    createdAt: Date.now(),
    tasks: new Map(),
    fileOwnershipMap: new Map(),
    agents: new Map(),
    parallelGroups: [],
    dependencies: new Map(),
    sharedContext: {
      codebaseStructure: '',
      conventions: '',
      existingPatterns: '',
      security: '',
      testing: ''
    }
  };
}

function cloneSwarmState(state: SwarmState): MutableSwarmState {
  return {
    swarmId: state.swarmId,
    overallGoal: state.overallGoal,
    createdAt: state.createdAt,
    tasks: new Map(state.tasks),
    fileOwnershipMap: new Map(state.fileOwnershipMap),
    agents: new Map(state.agents),
    parallelGroups: state.parallelGroups.map((g) => [...g]),
    dependencies: new Map(Array.from(state.dependencies.entries()).map(([k, v]) => [k, [...v]])),
    sharedContext: { ...state.sharedContext }
  };
}

function freezeProjection(state: MutableSwarmState): SwarmState {
  return {
    swarmId: state.swarmId,
    overallGoal: state.overallGoal,
    createdAt: state.createdAt,
    tasks: new Map(state.tasks),
    fileOwnershipMap: new Map(state.fileOwnershipMap),
    agents: new Map(state.agents),
    parallelGroups: state.parallelGroups.map((g) => [...g]),
    dependencies: new Map(Array.from(state.dependencies.entries()).map(([k, v]) => [k, [...v]])),
    sharedContext: { ...state.sharedContext }
  };
}

function ensureTask(state: MutableSwarmState, taskId: string): SwarmTask {
  const existing = state.tasks.get(taskId);
  if (existing) return existing;
  const nowIso = new Date().toISOString();
  const placeholder: SwarmTask = {
    id: taskId,
    title: taskId,
    description: '',
    status: 'QUEUED' as SwarmTaskStatus,
    fileOwnership: {
      ownedBy: 'unassigned',
      files: new Set(),
      dependencies: []
    },
    context: {
      goal: '',
      requirements: [],
      acceptanceCriteria: [],
      codePatterns: '',
      constraints: []
    },
    tracking: {
      assignedAgent: '',
      assignedAt: 0
    },
    priority: 'medium' as SwarmTaskPriority,
    estimatedMinutes: 15,
    blockedBy: undefined
  };
  state.tasks.set(taskId, placeholder);
  return placeholder;
}

function ensureAgent(state: MutableSwarmState, agentId: string): AgentState {
  const existing = state.agents.get(agentId);
  if (existing) return existing;
  const placeholder: AgentState = {
    agentId,
    role: 'builder' as AgentRole,
    status: 'IDLE' as AgentRuntimeStatus,
    currentTask: undefined,
    assignedTasks: [],
    lastActivity: Date.now(),
    lastMessage: undefined,
    blockReason: undefined,
    responseTime: 0
  };
  state.agents.set(agentId, placeholder);
  return placeholder;
}

function toRuntimeStatus(status: AgentUiStatus): AgentRuntimeStatus {
  if (status === 'IDLE') return 'IDLE' as AgentRuntimeStatus;
  if (status === 'ACTIVE') return 'ACTIVE' as AgentRuntimeStatus;
  if (status === 'THINKING') return 'THINKING' as AgentRuntimeStatus;
  if (status === 'BLOCKED') return 'BLOCKED' as AgentRuntimeStatus;
  return 'WAITING' as AgentRuntimeStatus;
}
