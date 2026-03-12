/**
 * QuanSwarm structured message protocol.
 *
 * Messages are represented as a discriminated union using the `type` field.
 * This allows exhaustive `switch` handling and consistent transport between the
 * coordinator and other agent roles.
 */

import type { AgentId, FileOwnershipConflict, SwarmState, SwarmTask, TaskId, UnixTimestampMs } from './SwarmOrchestration';

/**
 * All message discriminator values used by the swarm.
 */
export enum SwarmMessageType {
  // Parsing/relay (agent terminal output)
  COORDINATOR_OUTPUT = 'COORDINATOR_OUTPUT',
  BUILDER_COMPLETION = 'BUILDER_COMPLETION',
  BUILDER_QUESTION = 'BUILDER_QUESTION',
  SCOUT_RESPONSE = 'SCOUT_RESPONSE',
  SYSTEM_LOG = 'SYSTEM_LOG',

  // Coordinator
  TASK_CREATED = 'TASK_CREATED',
  STATUS_UPDATE = 'STATUS_UPDATE',
  AGENT_UNBLOCKED = 'AGENT_UNBLOCKED',

  // Builder
  SCOUT_QUESTION = 'SCOUT_QUESTION',
  TASK_COMPLETED = 'TASK_COMPLETED',
  TASK_FAILED = 'TASK_FAILED',

  // Scout
  CODEBASE_ANALYZED = 'CODEBASE_ANALYZED',
  SCOUT_ANSWER = 'SCOUT_ANSWER',

  // Reviewer
  REVIEW_DECISION = 'REVIEW_DECISION',

  // System
  AGENT_BLOCKED = 'AGENT_BLOCKED',
  AGENT_IDLE_TOO_LONG = 'AGENT_IDLE_TOO_LONG',
  FILE_CONFLICT_DETECTED = 'FILE_CONFLICT_DETECTED',
  TASK_TIMEOUT = 'TASK_TIMEOUT'
}

/**
 * Reviewer decision outcomes.
 */
export enum ReviewDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT'
}

/**
 * Coordinator terminal output containing raw task plan blocks.
 *
 * This message is intended to be routed into task decomposition (`decomposeTasks`) and then task creation.
 */
export interface CoordinatorOutputMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.COORDINATOR_OUTPUT;
  /** Coordinator agent identifier (if known). */
  readonly fromAgent: string;
  /** Raw plan text containing TASK blocks. */
  readonly plan: string;
  /** When the output was parsed/emitted (epoch ms). */
  readonly timestamp: number;
}

/**
 * Builder completion signal extracted from terminal output.
 */
export interface BuilderCompletionMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.BUILDER_COMPLETION;
  /** Task that was completed. */
  readonly taskId: string;
  /** Builder agent identifier. */
  readonly fromAgent: string;
  /** Optional summary (may be empty if not provided). */
  readonly summary: string;
  /** Files modified (best-effort extracted; may be empty). */
  readonly filesModified: readonly string[];
  /** When completion was parsed/emitted (epoch ms). */
  readonly timestamp: number;
}

/**
 * Builder-directed question to scout extracted from terminal output.
 */
export interface BuilderQuestionMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.BUILDER_QUESTION;
  /** Builder agent identifier. */
  readonly fromAgent: string;
  /** Target scout agent identifier (logical target; router may resolve to actual agent). */
  readonly toAgent: string;
  /** Optional task context (router may fill from agent state). */
  readonly taskId?: string;
  /** Question text. */
  readonly question: string;
  /** Optional context block/snippet. */
  readonly context?: string;
  /** When question was parsed/emitted (epoch ms). */
  readonly timestamp: number;
}

/**
 * Scout-directed response to a builder extracted from terminal output.
 */
export interface ScoutResponseMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.SCOUT_RESPONSE;
  /** Scout agent identifier. */
  readonly fromAgent: string;
  /** Target builder agent identifier. */
  readonly toAgent: string;
  /** Response content. */
  readonly answer: string;
  /** Optional sources (file paths) referenced. */
  readonly sources?: readonly string[];
  /** Optional additional context. */
  readonly context?: string;
  /** When response was parsed/emitted (epoch ms). */
  readonly timestamp: number;
}

/**
 * Generic system log/event extracted from terminal output.
 */
export interface SystemLogMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.SYSTEM_LOG;
  /** Severity level. */
  readonly level: 'INFO' | 'WARN' | 'ERROR';
  /** Human-readable message. */
  readonly message: string;
  /** Optional agent identifier related to the event. */
  readonly agentId?: string;
  /** Optional task identifier related to the event. */
  readonly taskId?: string;
  /** When event was parsed/emitted (epoch ms). */
  readonly timestamp: number;
}

/**
 * Coordinator -> swarm: tasks were created (or re-announced) as a batch.
 */
export interface TaskCreatedMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.TASK_CREATED;
  /** Newly created tasks. */
  readonly tasks: readonly SwarmTask[];
  /** When the message was emitted (epoch ms). */
  readonly timestamp: UnixTimestampMs;
}

/**
 * Coordinator -> swarm: high-level status update snapshot.
 */
export interface StatusUpdateMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.STATUS_UPDATE;
  /** Full swarm state snapshot at the time of update. */
  readonly swarmState: SwarmState;
  /** Human-readable summary of what changed. */
  readonly summary: string;
}

/**
 * Coordinator -> swarm: agent was unblocked for a task (dependency resolved, clarification given, etc.).
 */
export interface AgentUnblockedMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.AGENT_UNBLOCKED;
  /** Agent being unblocked. */
  readonly agentId: AgentId;
  /** Task being resumed. */
  readonly taskId: TaskId;
  /** Reason and/or remediation that unblocked the agent. */
  readonly reason: string;
}

/**
 * Builder -> scout: request clarification or codebase insight.
 */
export interface ScoutQuestionMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.SCOUT_QUESTION;
  /** Builder agent ID initiating the question. */
  readonly fromAgent: AgentId;
  /** Task the question relates to. */
  readonly taskId: TaskId;
  /** Question text. */
  readonly question: string;
  /** Optional additional context for the scout (stack traces, snippet, etc.). */
  readonly context?: string;
}

/**
 * Builder -> coordinator/reviewer: task finished successfully.
 */
export interface TaskCompletedMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.TASK_COMPLETED;
  /** Task that was completed. */
  readonly taskId: TaskId;
  /** Builder agent ID that completed the task. */
  readonly fromAgent: AgentId;
  /** Files modified while completing the task. */
  readonly filesModified: readonly string[];
  /** Human-readable completion summary. */
  readonly summary: string;
  /** When completion was reported (epoch ms). */
  readonly timestamp: UnixTimestampMs;
}

/**
 * Builder -> coordinator: task failed.
 */
export interface TaskFailedMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.TASK_FAILED;
  /** Task that failed. */
  readonly taskId: TaskId;
  /** Builder agent ID reporting failure. */
  readonly fromAgent: AgentId;
  /** Error details (message or summarized stack trace). */
  readonly error: string;
  /** When failure was reported (epoch ms). */
  readonly timestamp: UnixTimestampMs;
}

/**
 * Scout -> coordinator: a structured analysis of the codebase (or a subset) is available.
 */
export interface CodebaseAnalyzedMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.CODEBASE_ANALYZED;
  /** Structured analysis output. */
  readonly analysis: {
    readonly keyFiles: readonly string[];
    readonly namingConventions: string;
    readonly libraries: readonly string[];
    readonly patterns: readonly string[];
    readonly risks: readonly string[];
  };
}

/**
 * Scout -> builder: answer to a previously asked question.
 */
export interface ScoutAnswerMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.SCOUT_ANSWER;
  /** Direct answer. */
  readonly answer: string;
  /** File paths used as sources for the answer. */
  readonly sources: readonly string[];
  /** Additional context or rationale for the answer. */
  readonly context: string;
}

/**
 * Reviewer -> coordinator/builder: approve or reject a completed task.
 */
export interface ReviewDecisionMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.REVIEW_DECISION;
  /** Task under review. */
  readonly taskId: TaskId;
  /** Approval decision. */
  readonly decision: ReviewDecision;
  /** Review feedback (required for both approve and reject; keep concise). */
  readonly feedback: string;
  /** When the review decision was emitted (epoch ms). */
  readonly timestamp: UnixTimestampMs;
  /** Checklist used for structured review gating. */
  readonly checklist: {
    readonly acceptanceCriteriaMet: boolean;
    readonly patternMatch: boolean;
    readonly securityOK: boolean;
    readonly errorHandling: boolean;
    readonly noUnrelatedChanges: boolean;
  };
}

/**
 * System -> coordinator: an agent is blocked and requires intervention.
 */
export interface AgentBlockedMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.AGENT_BLOCKED;
  /** Blocked agent ID. */
  readonly agentId: AgentId;
  /** Human-readable block reason. */
  readonly blockReason: string;
  /** Optional suggested fix or next step. */
  readonly suggestedFix?: string;
}

/**
 * System -> coordinator: an agent has been idle beyond a threshold.
 */
export interface AgentIdleTooLongMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.AGENT_IDLE_TOO_LONG;
  /** Idle agent ID. */
  readonly agentId: AgentId;
  /** Idle duration in seconds. */
  readonly duration: number;
}

/**
 * System -> coordinator: a file ownership conflict was detected.
 */
export interface FileConflictDetectedMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.FILE_CONFLICT_DETECTED;
  /** Conflict details. */
  readonly conflict: FileOwnershipConflict;
}

/**
 * System -> coordinator: a task exceeded its allotted time budget.
 */
export interface TaskTimeoutMessage {
  /** Discriminator. */
  readonly type: SwarmMessageType.TASK_TIMEOUT;
  /** Timed out task ID. */
  readonly taskId: TaskId;
  /** Agent currently assigned to the task. */
  readonly agent: AgentId;
  /** Time elapsed in milliseconds. */
  readonly timeElapsed: number;
}

/**
 * All coordinator-originated messages.
 */
export type CoordinatorMessages =
  | CoordinatorOutputMessage
  | TaskCreatedMessage
  | StatusUpdateMessage
  | AgentUnblockedMessage;

/**
 * All builder-originated messages.
 */
export type BuilderMessages =
  | BuilderCompletionMessage
  | BuilderQuestionMessage
  | ScoutQuestionMessage
  | TaskCompletedMessage
  | TaskFailedMessage;

/**
 * All scout-originated messages.
 */
export type ScoutMessages =
  | CodebaseAnalyzedMessage
  | ScoutResponseMessage
  | ScoutAnswerMessage;

/**
 * All reviewer-originated messages.
 */
export type ReviewerMessages = ReviewDecisionMessage;

/**
 * All system-originated messages.
 */
export type SystemMessages =
  | AgentBlockedMessage
  | AgentIdleTooLongMessage
  | FileConflictDetectedMessage
  | SystemLogMessage
  | TaskTimeoutMessage;

/**
 * Discriminated union of all swarm messages.
 *
 * Consumers should `switch (message.type)` to ensure exhaustive handling.
 */
export type SwarmMessage =
  | CoordinatorMessages
  | BuilderMessages
  | ScoutMessages
  | ReviewerMessages
  | SystemMessages;
