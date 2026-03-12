import type { AgentState, FileOwnershipConflict, SwarmState, SwarmTask } from './SwarmOrchestration';

/**
 * All swarm events use epoch-millisecond timestamps.
 */
export type SwarmEventTimestamp = number;

/**
 * Kebab-case event type discriminator.
 */
export type SwarmEventType =
  | 'swarm-created'
  | 'tasks-decomposed'
  | 'task-created'
  | 'task-assigned'
  | 'task-started'
  | 'task-completed'
  | 'task-review-started'
  | 'task-approved'
  | 'task-rejected'
  | 'agent-started'
  | 'agent-status-changed'
  | 'agent-blocked'
  | 'agent-stopped'
  | 'message-parsed'
  | 'file-ownership-assigned'
  | 'file-conflict-detected'
  | 'blocker-escalated'
  | 'swarm-completed'
  | 'error-occurred';

/**
 * Base shape shared by all swarm events.
 */
export interface SwarmEventBase {
  readonly type: SwarmEventType;
  readonly swarmId: string;
  readonly timestamp: SwarmEventTimestamp;
}

export interface SwarmCreatedEvent extends SwarmEventBase {
  readonly type: 'swarm-created';
  readonly goal: string;
}

export interface TasksDecomposedEvent extends SwarmEventBase {
  readonly type: 'tasks-decomposed';
  readonly taskCount: number;
  readonly tasks: readonly SwarmTask[];
}

export interface TaskCreatedEvent extends SwarmEventBase {
  readonly type: 'task-created';
  readonly task: SwarmTask;
}

export interface TaskAssignedEvent extends SwarmEventBase {
  readonly type: 'task-assigned';
  readonly taskId: string;
  readonly agentId: string;
}

export interface TaskStartedEvent extends SwarmEventBase {
  readonly type: 'task-started';
  readonly taskId: string;
  readonly agentId: string;
}

export interface TaskCompletedEvent extends SwarmEventBase {
  readonly type: 'task-completed';
  readonly taskId: string;
  readonly agentId: string;
  readonly summary: string;
}

export interface TaskReviewStartedEvent extends SwarmEventBase {
  readonly type: 'task-review-started';
  readonly taskId: string;
  readonly reviewerId: string;
}

export interface TaskApprovedEvent extends SwarmEventBase {
  readonly type: 'task-approved';
  readonly taskId: string;
  readonly reviewerId: string;
  readonly feedback: string;
}

export interface TaskRejectedEvent extends SwarmEventBase {
  readonly type: 'task-rejected';
  readonly taskId: string;
  readonly reviewerId: string;
  readonly feedback: string;
  readonly blockers: readonly string[];
}

export interface AgentStartedEvent extends SwarmEventBase {
  readonly type: 'agent-started';
  readonly agentId: string;
  readonly role: AgentState['role'];
}

export type AgentUiStatus = 'IDLE' | 'ACTIVE' | 'THINKING' | 'BLOCKED' | 'OFFLINE';

export interface AgentStatusChangedEvent extends SwarmEventBase {
  readonly type: 'agent-status-changed';
  readonly agentId: string;
  readonly status: AgentUiStatus;
  readonly currentTask?: string;
}

export interface AgentBlockedEvent extends SwarmEventBase {
  readonly type: 'agent-blocked';
  readonly agentId: string;
  readonly taskId: string;
  readonly reason: string;
  readonly suggestedFix?: string;
}

export interface AgentStoppedEvent extends SwarmEventBase {
  readonly type: 'agent-stopped';
  readonly agentId: string;
}

export interface MessageParsedEvent extends SwarmEventBase {
  readonly type: 'message-parsed';
  readonly sourceAgentId: string;
  readonly messageType: string;
  readonly rawSnippet?: string;
}

export interface FileOwnershipAssignedEvent extends SwarmEventBase {
  readonly type: 'file-ownership-assigned';
  readonly taskId: string;
  readonly agentId: string;
  readonly files: readonly string[];
}

export interface FileConflictDetectedEvent extends SwarmEventBase {
  readonly type: 'file-conflict-detected';
  readonly conflict: FileOwnershipConflict;
}

export interface BlockerEscalatedEvent extends SwarmEventBase {
  readonly type: 'blocker-escalated';
  readonly agentId: string;
  readonly taskId: string;
  readonly blockReason: string;
  readonly severity: ErrorSeverity;
  readonly suggestion: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface SwarmCompletedEvent extends SwarmEventBase {
  readonly type: 'swarm-completed';
  readonly totalTasks: number;
  readonly timeElapsed: number;
}

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorOccurredEvent extends SwarmEventBase {
  readonly type: 'error-occurred';
  readonly severity: ErrorSeverity;
  readonly message: string;
  readonly component: string;
}

/**
 * Discriminated union of all swarm events.
 */
export type SwarmEvent =
  | SwarmCreatedEvent
  | TasksDecomposedEvent
  | TaskCreatedEvent
  | TaskAssignedEvent
  | TaskStartedEvent
  | TaskCompletedEvent
  | TaskReviewStartedEvent
  | TaskApprovedEvent
  | TaskRejectedEvent
  | AgentStartedEvent
  | AgentStatusChangedEvent
  | AgentBlockedEvent
  | AgentStoppedEvent
  | MessageParsedEvent
  | FileOwnershipAssignedEvent
  | FileConflictDetectedEvent
  | BlockerEscalatedEvent
  | SwarmCompletedEvent
  | ErrorOccurredEvent;

/**
 * Listener signature for swarm events.
 */
export type SwarmEventListener = (event: SwarmEvent) => void;

/**
 * Optional filter applied before delivering an event to a listener.
 */
export type SwarmEventFilter = (event: SwarmEvent) => boolean;

/**
 * Optional UI bridge interface for emitting real-time updates to the renderer layer.
 *
 * In Electron main process, an implementation typically forwards to `webContents.send(...)`,
 * and the preload/renderer can then dispatch DOM events (e.g. `vibe:swarm-update`).
 */
export interface SwarmUiBridge {
  emitEvent: (event: SwarmEvent) => void;
  emitSwarmUpdate: (swarmId: string, state: SwarmState) => void;
  emitAgentStatus: (swarmId: string, agent: AgentState) => void;
}
