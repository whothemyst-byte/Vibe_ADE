/**
 * QuanSwarm agent role definitions and canonical workflows.
 *
 * These types describe the responsibilities and constraints expected of each agent role.
 * The runtime system can use these for validation, UI display, and coordination policy.
 */

import type { AgentId, AgentRole, AgentRuntimeStatus, TaskId } from './SwarmOrchestration';

/**
 * Common capability labels used by the scout role.
 */
export enum ScoutCapability {
  CODEBASE_MAPPING = 'codebase-mapping',
  PATTERN_DETECTION = 'pattern-detection',
  REAL_TIME_QA = 'real-time-qa'
}

/**
 * Output formats used for structured analysis payloads.
 */
export enum AnalysisOutputFormat {
  STRUCTURED = 'structured'
}

/**
 * Base interface for any agent participating in a swarm.
 */
export interface Agent {
  /**
   * Unique agent identifier.
   */
  readonly agentId: AgentId;

  /**
   * Role discriminator.
   */
  readonly role: AgentRole;

  /**
   * Operational status.
   */
  readonly status: AgentRuntimeStatus;

  /**
   * Current task ID, if the agent is actively working.
   */
  readonly currentTask?: TaskId;

  /**
   * Declared capabilities (skills/tools) used for scheduling and delegation.
   */
  readonly capabilities: readonly string[];

  /**
   * Hard constraints the agent must follow (policy, scope, tool limitations).
   */
  readonly constraints: readonly string[];
}

/**
 * Coordinator agent: decomposes goals into tasks, assigns ownership, and maintains the swarm state.
 */
export interface CoordinatorAgent extends Agent {
  /** Role discriminator. */
  readonly role: AgentRole.COORDINATOR;

  /**
   * Coordinator responsibilities (high-level task categories).
   */
  readonly responsibilities: readonly string[];

  /**
   * Canonical coordinator workflow.
   *
   * Keep these steps stable so the UI and logging can reference consistent phases.
   */
  readonly workflow: {
    readonly step1: string;
    readonly step2: string;
    readonly step3: string;
    readonly step4: string;
    readonly step5: string;
    readonly step6: string;
  };

  /**
   * Constraints and limits on task decomposition.
   */
  readonly decompositionCapability: {
    readonly maxTasksPerGoal: number;
    readonly maxDependencies: number;
    readonly fileOwnershipValidation: boolean;
  };
}

/**
 * Builder agent: implements tasks by modifying owned files and producing reviewable changes.
 */
export interface BuilderAgent extends Agent {
  /** Role discriminator. */
  readonly role: AgentRole.BUILDER;

  /**
   * Builder responsibilities (implementation-focused categories).
   */
  readonly responsibilities: readonly string[];

  /**
   * Canonical builder workflow (5–6 steps).
   */
  readonly workflow: {
    readonly step1: string;
    readonly step2: string;
    readonly step3: string;
    readonly step4: string;
    readonly step5: string;
    readonly step6?: string;
  };

  /**
   * Constraints specific to builders (file ownership enforcement, pattern matching, etc.).
   *
   * This duplicates {@link Agent.constraints} but is kept explicit here for role-specific policy UI.
   */
  readonly constraints: readonly string[];

  /**
   * Declared skills (languages/frameworks/domains) used for task routing.
   */
  readonly skills: readonly string[];
}

/**
 * Scout agent: maps the codebase, detects patterns/risks, and answers builder questions quickly.
 */
export interface ScoutAgent extends Agent {
  /** Role discriminator. */
  readonly role: AgentRole.SCOUT;

  /**
   * Scout responsibilities.
   */
  readonly responsibilities: readonly string[];

  /**
   * Canonical scout workflow (5 steps).
   */
  readonly workflow: {
    readonly step1: string;
    readonly step2: string;
    readonly step3: string;
    readonly step4: string;
    readonly step5: string;
  };

  /**
   * Scout capabilities are fixed and well-known for scheduling.
   */
  readonly capabilities: readonly [
    ScoutCapability.CODEBASE_MAPPING,
    ScoutCapability.PATTERN_DETECTION,
    ScoutCapability.REAL_TIME_QA
  ];

  /**
   * Limits and output expectations for scout analysis.
   */
  readonly analysisCapability: {
    readonly maxFilesToAnalyze: number;
    readonly outputFormat: AnalysisOutputFormat.STRUCTURED;
  };
}

/**
 * Reviewer agent: verifies acceptance criteria, patterns, security, and ownership compliance.
 */
export interface ReviewerAgent extends Agent {
  /** Role discriminator. */
  readonly role: AgentRole.REVIEWER;

  /**
   * Reviewer responsibilities.
   */
  readonly responsibilities: readonly string[];

  /**
   * Canonical reviewer workflow (5 steps).
   */
  readonly workflow: {
    readonly step1: string;
    readonly step2: string;
    readonly step3: string;
    readonly step4: string;
    readonly step5: string;
  };

  /**
   * Human-readable review checklist items shown in UI.
   */
  readonly reviewChecklist: readonly string[];

  /**
   * Boolean quality gates that must be satisfied to approve a task.
   */
  readonly qualityGates: {
    readonly acceptanceCriteria: boolean;
    readonly patternMatching: boolean;
    readonly security: boolean;
    readonly errorHandling: boolean;
    readonly fileOwnershipOnly: boolean;
  };
}

/**
 * Union of all known agent role configurations.
 */
export type AnyAgentRole =
  | CoordinatorAgent
  | BuilderAgent
  | ScoutAgent
  | ReviewerAgent;

