/**
 * QuanSwarm multi-agent orchestration data model.
 *
 * This file defines the core, in-memory TypeScript types used to coordinate a "swarm" of
 * cooperating agents working on a shared codebase. The model is intentionally structured
 * to support:
 * - Task decomposition and dependency management
 * - Explicit file ownership (to prevent parallel edit conflicts)
 * - Agent state tracking for monitoring and scheduling
 * - A shared coordination surface (state + context) that can be serialized if needed
 *
 * Notes on immutability:
 * - Most collections are typed as `Readonly*` to encourage immutable state updates.
 * - Runtime code may still use mutable `Map`/`Set` instances; treat them as read-only
 *   at the type boundary.
 */

/**
 * Milliseconds since Unix epoch (UTC).
 *
 * All timestamps in the swarm system use number-based epoch milliseconds to remain
 * transport-friendly and deterministic across processes.
 */
export type UnixTimestampMs = number;

/**
 * Unique identifier for a swarm (orchestration session).
 */
export type SwarmId = string;

/**
 * Unique identifier for an agent participating in a swarm.
 */
export type AgentId = string;

/**
 * Unique identifier for a task in a swarm (e.g. `TASK-001`).
 */
export type TaskId = string;

/**
 * A repository-relative file path.
 */
export type FilePath = string;

/**
 * Lifecycle state of a task within the swarm.
 */
export enum SwarmTaskStatus {
  QUEUED = 'QUEUED',
  ASSIGNED = 'ASSIGNED',
  BUILDING = 'BUILDING',
  REVIEWING = 'REVIEWING',
  DONE = 'DONE',
  BLOCKED = 'BLOCKED'
}

/**
 * Priority tier for scheduling and conflict resolution.
 */
export enum SwarmTaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

/**
 * Canonical agent roles in the swarm.
 */
export enum AgentRole {
  COORDINATOR = 'coordinator',
  BUILDER = 'builder',
  SCOUT = 'scout',
  REVIEWER = 'reviewer'
}

/**
 * Live/operational status of an agent in the swarm.
 */
export enum AgentRuntimeStatus {
  IDLE = 'IDLE',
  THINKING = 'THINKING',
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  WAITING = 'WAITING'
}

/**
 * Whether a dependency relationship forces sequential execution or allows parallelism.
 */
export enum TaskDependencyType {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel'
}

/**
 * File ownership metadata for a swarm task.
 *
 * Ownership is the mechanism that prevents two builder agents from editing overlapping
 * files at the same time. Conflicts are detected by comparing the `files` sets across tasks
 * and/or using the global `fileOwnershipMap` on {@link SwarmState}.
 */
export interface SwarmTaskFileOwnership {
  /**
   * Agent currently responsible for this task's edits.
   */
  readonly ownedBy: AgentId;

  /**
   * File paths owned by this task. Builders should only modify files in this set.
   */
  readonly files: ReadonlySet<FilePath>;

  /**
   * Task IDs this task depends on (must be completed or unblocked first).
   */
  readonly dependencies: readonly TaskId[];
}

/**
 * Context needed for a builder to execute the task without ambiguity.
 */
export interface SwarmTaskContext {
  /**
   * Single-sentence goal for the task.
   */
  readonly goal: string;

  /**
   * Concrete requirements the implementation must satisfy.
   */
  readonly requirements: readonly string[];

  /**
   * Clear acceptance criteria used by the reviewer role to approve/reject.
   */
  readonly acceptanceCriteria: readonly string[];

  /**
   * Known code patterns (APIs, conventions, reference implementations) to follow.
   */
  readonly codePatterns: string;

  /**
   * Explicit constraints the agent must not violate (e.g., "no new deps", "Windows-only").
   */
  readonly constraints: readonly string[];
}

/**
 * Assignment and review tracking metadata for a task.
 */
export interface SwarmTaskTracking {
  /**
   * Agent currently assigned to build this task.
   */
  readonly assignedAgent: AgentId;

  /**
   * When the task was assigned to the current agent (epoch ms).
   */
  readonly assignedAt: UnixTimestampMs;

  /**
   * When the task was completed (epoch ms).
   */
  readonly completedAt?: UnixTimestampMs;

  /**
   * Reviewer agent ID, if a review was performed.
   */
  readonly reviewedBy?: AgentId;

  /**
   * Review feedback, including rejection reasons or polish notes.
   */
  readonly feedback?: string;
}

/**
 * Execution routing metadata for a task.
 *
 * This allows the coordinator to assign tasks to the most appropriate agent role
 * (e.g. "write a review report" -> reviewer), instead of routing everything through builders.
 */
export interface SwarmTaskExecution {
  /**
   * Which role should execute this task.
   *
   * Note: the coordinator role decomposes work, but should not be assigned execution tasks.
   */
  readonly role: AgentRole;

  /**
   * Whether the task must go through an explicit reviewer gate after completion.
   *
   * Defaults:
   * - builder tasks: true
   * - reviewer/scout tasks: false
   */
  readonly reviewRequired?: boolean;
}

/**
 * A unit of work within a swarm. Tasks are designed to be schedulable, reviewable, and
 * enforceable with file ownership constraints.
 */
export interface SwarmTask {
  /**
   * Stable task identifier (e.g., `TASK-001`).
   */
  readonly id: TaskId;

  /**
   * Short title suitable for dashboards.
   */
  readonly title: string;

  /**
   * Detailed description of the work.
   */
  readonly description: string;

  /**
   * Current lifecycle status.
   */
  readonly status: SwarmTaskStatus;

  /**
   * File ownership surface for conflict prevention and dependency wiring.
   */
  readonly fileOwnership: SwarmTaskFileOwnership;

  /**
   * Execution context shared with the agent.
   */
  readonly context: SwarmTaskContext;

  /**
   * Assignment / completion / review tracking metadata.
   */
  readonly tracking: SwarmTaskTracking;

  /**
   * Optional execution routing metadata (role + review gate).
   *
   * If omitted, tasks are treated as builder-executed and review-gated by default.
   */
  readonly execution?: SwarmTaskExecution;

  /**
   * Scheduling priority.
   */
  readonly priority: SwarmTaskPriority;

  /**
   * Estimated wall-clock time in minutes for planning.
   */
  readonly estimatedMinutes: number;

  /**
   * Optional list of task IDs currently blocking this task.
   */
  readonly blockedBy?: readonly TaskId[];
}

/**
 * The live state of an agent participating in the swarm.
 *
 * This is operational state used for coordination, monitoring, and scheduling decisions.
 */
export interface AgentState {
  /**
   * Unique agent identifier.
   */
  readonly agentId: AgentId;

  /**
   * Agent role (coordinator/builder/scout/reviewer).
   */
  readonly role: AgentRole;

  /**
   * Current operational status.
   */
  readonly status: AgentRuntimeStatus;

  /**
   * Currently active task ID, if any.
   */
  readonly currentTask?: TaskId;

  /**
   * All tasks assigned to this agent (including completed ones).
   */
  readonly assignedTasks: readonly TaskId[];

  /**
   * Last observed activity time (epoch ms).
   */
  readonly lastActivity: UnixTimestampMs;

  /**
   * Last message produced by the agent (human-readable).
   */
  readonly lastMessage?: string;

  /**
   * If blocked, a concise reason explaining what needs to change to unblock.
   */
  readonly blockReason?: string;

  /**
   * Rolling response time in milliseconds for monitoring/alerting.
   */
  readonly responseTime: number;
}

/**
 * Shared, human-readable context about the codebase and expectations.
 *
 * This is authored/updated by the coordinator and scout roles and should be treated
 * as the "single source of truth" for conventions during a swarm run.
 */
export interface SwarmSharedContext {
  /**
   * Directory tree / repo map and where key subsystems live.
   */
  readonly codebaseStructure: string;

  /**
   * Naming conventions and style rules.
   */
  readonly conventions: string;

  /**
   * Existing architectural patterns that should be followed.
   */
  readonly existingPatterns: string;

  /**
   * Security practices or requirements.
   */
  readonly security: string;

  /**
   * Testing approaches and verification expectations.
   */
  readonly testing: string;
}

/**
 * Full swarm coordination surface.
 *
 * This state is typically owned by the coordinator and can be broadcast to agents for
 * visibility and decision-making.
 */
export interface SwarmState {
  /**
   * Swarm/session identifier.
   */
  readonly swarmId: SwarmId;

  /**
   * High-level overall goal for the swarm run.
   */
  readonly overallGoal: string;

  /**
   * When this swarm was created (epoch ms).
   */
  readonly createdAt: UnixTimestampMs;

  /**
   * Task map keyed by task ID.
   */
  readonly tasks: ReadonlyMap<TaskId, SwarmTask>;

  /**
   * Global file ownership index mapping `filePath -> taskId`.
   *
   * The coordinator uses this to quickly detect overlaps and enforce "one writer per file".
   */
  readonly fileOwnershipMap: ReadonlyMap<FilePath, TaskId>;

  /**
   * Agent map keyed by agent ID.
   */
  readonly agents: ReadonlyMap<AgentId, AgentState>;

  /**
   * Groups of task IDs that can be executed concurrently.
   */
  readonly parallelGroups: readonly (readonly TaskId[])[];

  /**
   * Dependency map keyed by task ID.
   *
   * Each entry lists the task IDs that the key task depends on.
   */
  readonly dependencies: ReadonlyMap<TaskId, readonly TaskId[]>;

  /**
   * Shared coordination context for the swarm (codebase map + conventions).
   */
  readonly sharedContext: SwarmSharedContext;
}

/**
 * A normalized view of dependency relationships for a single task.
 */
export interface TaskDependency {
  /**
   * Task the dependency record refers to.
   */
  readonly taskId: TaskId;

  /**
   * Tasks that must be completed first.
   */
  readonly dependsOn: readonly TaskId[];

  /**
   * Tasks currently blocking execution (e.g., failed prerequisites).
   */
  readonly blockedBy: readonly TaskId[];

  /**
   * Whether the relationship is sequential or can be parallelized.
   */
  readonly type: TaskDependencyType;
}

/**
 * A detected file ownership conflict between tasks.
 */
export type FileOwnershipConflict = Readonly<{
  /**
   * Task IDs that conflict with each other.
   */
  conflictingTasks: readonly TaskId[];

  /**
   * Repository-relative file paths that overlap across tasks.
   */
  overlappingFiles: readonly FilePath[];

  /**
   * Human-readable error describing the conflict and suggested remediation.
   */
  error: string;
}>;
