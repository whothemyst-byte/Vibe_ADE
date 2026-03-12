import { EventEmitter } from 'node:events';
import type { FileOwnershipConflict, FilePath, SwarmTask, TaskId, UnixTimestampMs } from '@main/types/SwarmOrchestration';

/**
 * Access log entry used for debugging and monitoring ownership enforcement decisions.
 */
export interface AccessLogEntry {
  /** When the access event occurred (epoch ms). */
  readonly timestamp: UnixTimestampMs;
  /** Agent attempting the action. */
  readonly agentId: string;
  /** Task the action is associated with. */
  readonly taskId: TaskId;
  /** File path involved in the action. */
  readonly filePath: FilePath;
  /** Action being performed. */
  readonly action: 'ASSIGN' | 'VALIDATE' | 'RELEASE' | 'CONFLICT_CHECK';
  /** Outcome of the action. */
  readonly outcome: 'ALLOW' | 'DENY' | 'ERROR';
  /** Optional detail for debugging. */
  readonly message?: string;
}

/**
 * Error thrown when a task attempts to claim files already owned by a different agent/task.
 */
export class FileOwnershipConflictError extends Error {
  public readonly conflictingTasks: readonly string[];
  public readonly overlappingFiles: readonly string[];

  constructor(input: { conflictingTasks: readonly string[]; overlappingFiles: readonly string[]; message: string }) {
    super(input.message);
    this.name = 'FileOwnershipConflictError';
    this.conflictingTasks = input.conflictingTasks;
    this.overlappingFiles = input.overlappingFiles;
  }
}

/**
 * Error thrown when an agent attempts to access/modify a file it does not own.
 */
export class FileAccessDeniedError extends Error {
  public readonly agentId: string;
  public readonly filePath: string;
  public readonly actualOwner: string;

  constructor(input: { agentId: string; filePath: string; actualOwner: string; message?: string }) {
    super(input.message ?? `Agent "${input.agentId}" does not own "${input.filePath}" (owned by "${input.actualOwner}").`);
    this.name = 'FileAccessDeniedError';
    this.agentId = input.agentId;
    this.filePath = input.filePath;
    this.actualOwner = input.actualOwner;
  }
}

/**
 * Error thrown when attempting to validate access for a file that has no recorded owner.
 */
export class FileOwnerNotFoundError extends Error {
  public readonly filePath: string;

  constructor(input: { filePath: string; message?: string }) {
    super(input.message ?? `File "${input.filePath}" has no owner assigned.`);
    this.name = 'FileOwnerNotFoundError';
    this.filePath = input.filePath;
  }
}

type FileOwnershipEventPayloads = {
  'file-locked': { filePath: FilePath; agentId: string; taskId: TaskId; timestamp: UnixTimestampMs };
  'file-released': { filePath: FilePath; taskId: TaskId; timestamp: UnixTimestampMs; reason?: string };
  'conflict-detected': { taskId: TaskId; conflict: FileOwnershipConflict; timestamp: UnixTimestampMs };
};

/**
 * Centralized file ownership enforcement for QuanSwarm.
 *
 * Responsibilities:
 * - Ensure at most one agent owns a file at any time
 * - Validate file access for an agent/task before modifications
 * - Detect conflicts without mutating state (preflight)
 * - Release ownership deterministically on task completion
 * - Emit events for UI observability and provide resolution hints
 */
export class FileOwnershipManager {
  private static instance: FileOwnershipManager | null = null;

  /**
   * Singleton accessor.
   */
  public static getInstance(): FileOwnershipManager {
    if (!FileOwnershipManager.instance) {
      FileOwnershipManager.instance = new FileOwnershipManager();
    }
    return FileOwnershipManager.instance;
  }

  private readonly emitter = new EventEmitter();

  /**
   * Map of `filePath -> agentId`.
   */
  private ownershipMap: Map<string, string> = new Map();

  /**
   * Map of `taskId -> files` owned by that task.
   */
  private taskFileMap: Map<string, Set<string>> = new Map();

  /**
   * Access log for debugging. This may be bounded in the future.
   */
  private accessLog: AccessLogEntry[] = [];

  /**
   * Maximum age for a lock before it is considered stale (default: 30 minutes).
   */
  private lockTimeout: number = 1_800_000;

  /**
   * Internal: track lock assignment time per file to support stale-lock release.
   */
  private readonly assignedAtMap: Map<string, UnixTimestampMs> = new Map();

  /**
   * Internal: task registry used to generate better conflict resolution suggestions.
   *
   * This is best-effort and may not contain every task in the system.
   */
  private readonly taskRegistry: Map<TaskId, SwarmTask> = new Map();

  private constructor() {
    // Singleton - use getInstance().
    this.emitter.setMaxListeners(50);
  }

  /**
   * Subscribe to ownership lifecycle events for UI/monitoring.
   */
  public on<EventName extends keyof FileOwnershipEventPayloads>(
    event: EventName,
    listener: (payload: FileOwnershipEventPayloads[EventName]) => void
  ): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }

  /**
   * Assign file ownership for a task to an agent.
   *
   * Prevents two agents from owning the same file. If a conflict is detected, throws
   * {@link FileOwnershipConflictError} with details and does not partially assign ownership.
   */
  public assignOwnership(task: SwarmTask, agentId: string): void {
    const now = Date.now();
    const files = Array.from(task.fileOwnership.files);

    // Preflight: detect conflicts first so we avoid partial state updates.
    const conflict = this.detectConflictsForAgent(task, agentId, now);
    if (conflict !== null) {
      this.log({
        timestamp: now,
        agentId,
        taskId: task.id,
        filePath: conflict.overlappingFiles[0] ?? '',
        action: 'ASSIGN',
        outcome: 'DENY',
        message: conflict.error
      });

      this.emitter.emit('conflict-detected', { taskId: task.id, conflict, timestamp: now } satisfies FileOwnershipEventPayloads['conflict-detected']);

      throw new FileOwnershipConflictError({
        conflictingTasks: conflict.conflictingTasks,
        overlappingFiles: conflict.overlappingFiles,
        message: conflict.error
      });
    }

    // Assign.
    const nextTaskFiles = new Set<string>(files);
    this.taskFileMap.set(task.id, nextTaskFiles);
    this.taskRegistry.set(task.id, task);

    for (const filePath of files) {
      this.ownershipMap.set(filePath, agentId);
      this.assignedAtMap.set(filePath, now);
      console.log(`${this.ts(now)} [FILE_OWNERSHIP] Assigned ${filePath} to ${agentId} for ${task.id}`);
      this.emitter.emit('file-locked', { filePath, agentId, taskId: task.id, timestamp: now } satisfies FileOwnershipEventPayloads['file-locked']);
      this.log({
        timestamp: now,
        agentId,
        taskId: task.id,
        filePath,
        action: 'ASSIGN',
        outcome: 'ALLOW'
      });
    }

    // Integrity check after mutation.
    if (!this.validateIntegrity()) {
      console.error('[FILE_OWNERSHIP] Integrity check failed after assignment; ownership state may be corrupted.');
    }
  }

  /**
   * Validate that an agent is allowed to access/modify a file for a given task.
   *
   * @throws {@link FileOwnerNotFoundError} if the file is unowned.
   * @throws {@link FileAccessDeniedError} if the file is owned by a different agent.
   */
  public validateFileAccess(filePath: string, agentId: string, taskId: string): boolean {
    const now = Date.now();
    this.releaseExpiredLockIfNeeded(filePath, now);

    const owner = this.ownershipMap.get(filePath);
    if (!owner) {
      console.warn(`${this.ts(now)} [FILE_OWNERSHIP] DENY access to ${filePath} by ${agentId} for ${taskId} (no owner assigned)`);
      this.log({
        timestamp: now,
        agentId,
        taskId,
        filePath,
        action: 'VALIDATE',
        outcome: 'ERROR',
        message: 'File has no owner assigned'
      });
      throw new FileOwnerNotFoundError({ filePath });
    }

    if (owner !== agentId) {
      console.warn(`${this.ts(now)} [FILE_OWNERSHIP] DENY access to ${filePath} by ${agentId} for ${taskId} (owned by ${owner})`);
      this.log({
        timestamp: now,
        agentId,
        taskId,
        filePath,
        action: 'VALIDATE',
        outcome: 'DENY',
        message: `Owned by ${owner}`
      });
      throw new FileAccessDeniedError({ agentId, filePath, actualOwner: owner });
    }

    console.log(`${this.ts(now)} [FILE_OWNERSHIP] ALLOW access to ${filePath} by ${agentId} for ${taskId}`);
    this.log({
      timestamp: now,
      agentId,
      taskId,
      filePath,
      action: 'VALIDATE',
      outcome: 'ALLOW'
    });
    return true;
  }

  /**
   * Release all files owned by a task.
   *
   * This is intended to be called when a task reaches DONE (or is explicitly unassigned).
   * It is safe to call multiple times.
   */
  public releaseOwnership(task: SwarmTask): void {
    const now = Date.now();
    const files = Array.from(task.fileOwnership.files);

    for (const filePath of files) {
      this.releaseFileLock(filePath, task.id, now, 'task_complete');
      console.log(`${this.ts(now)} [FILE_OWNERSHIP] Released ${filePath} (${task.id} done)`);
      this.log({
        timestamp: now,
        agentId: task.fileOwnership.ownedBy,
        taskId: task.id,
        filePath,
        action: 'RELEASE',
        outcome: 'ALLOW'
      });
    }

    // Remove reverse mapping entry and verify.
    this.taskFileMap.delete(task.id);
    this.taskRegistry.delete(task.id);
    const stillOwned = files.filter((filePath) => this.ownershipMap.has(filePath));
    if (stillOwned.length > 0) {
      console.error(`${this.ts(now)} [FILE_OWNERSHIP] Release verification failed for ${task.id}; still owned: ${stillOwned.join(', ')}`);
    }

    if (!this.validateIntegrity()) {
      console.error(`${this.ts(now)} [FILE_OWNERSHIP] Integrity check failed after release; ownership state may be corrupted.`);
    }
  }

  /**
   * Detect conflicts for a new task without mutating ownership state.
   *
   * Conflicts occur when any of the task's files are already owned by another agent/task.
   */
  public detectConflicts(newTask: SwarmTask): FileOwnershipConflict | null {
    const now = Date.now();
    const overlappingFiles: string[] = [];
    const conflictingTaskIds = new Set<string>();

    for (const filePath of newTask.fileOwnership.files) {
      this.releaseExpiredLockIfNeeded(filePath, now);
      const currentOwner = this.ownershipMap.get(filePath);
      if (!currentOwner) {
        continue;
      }
      if (currentOwner === newTask.fileOwnership.ownedBy) {
        // Same agent already owns it (e.g., re-entrant assignment); not a conflict.
        continue;
      }

      overlappingFiles.push(filePath);
      for (const taskId of this.findTasksOwningFile(filePath)) {
        conflictingTaskIds.add(taskId);
      }
    }

    if (overlappingFiles.length === 0) {
      return null;
    }

    const conflict: FileOwnershipConflict = {
      conflictingTasks: Array.from(conflictingTaskIds),
      overlappingFiles,
      error: `File ownership conflict for ${newTask.id}: ${overlappingFiles.length} file(s) already owned by another agent/task.`
    };

    this.log({
      timestamp: now,
      agentId: newTask.fileOwnership.ownedBy,
      taskId: newTask.id,
      filePath: overlappingFiles[0] ?? '',
      action: 'CONFLICT_CHECK',
      outcome: 'DENY',
      message: conflict.error
    });

    return conflict;
  }

  /**
   * Get the current owner (agentId) for a file.
   */
  public getOwnerOfFile(filePath: string): string | undefined {
    this.releaseExpiredLockIfNeeded(filePath, Date.now());
    return this.ownershipMap.get(filePath);
  }

  /**
   * Get all files currently owned by an agent.
   */
  public getFilesOwnedByAgent(agentId: string): Set<string> {
    const now = Date.now();
    const owned = new Set<string>();
    for (const [filePath, owner] of this.ownershipMap.entries()) {
      this.releaseExpiredLockIfNeeded(filePath, now);
      if (owner === agentId) {
        owned.add(filePath);
      }
    }
    return owned;
  }

  /**
   * Get all files owned by a task.
   */
  public getFilesOwnedByTask(taskId: string): Set<string> {
    return new Set(this.taskFileMap.get(taskId) ?? []);
  }

  /**
   * Get a snapshot of all owned files (`filePath -> agentId`).
   */
  public getAllOwnedFiles(): Map<string, string> {
    const now = Date.now();
    for (const filePath of this.ownershipMap.keys()) {
      this.releaseExpiredLockIfNeeded(filePath, now);
    }
    return new Map(this.ownershipMap);
  }

  /**
   * Return true only if the agent owns *all* files in `filePaths`.
   *
   * This is intended for "preflight" checks before starting a multi-file operation.
   */
  public canAgentModifyFiles(agentId: string, filePaths: string[]): boolean {
    const now = Date.now();
    let allowed = true;

    for (const filePath of filePaths) {
      this.releaseExpiredLockIfNeeded(filePath, now);
      const owner = this.ownershipMap.get(filePath);
      if (!owner) {
        console.warn(`${this.ts(now)} [FILE_OWNERSHIP] DENY modify: ${agentId} -> ${filePath} (no owner assigned)`);
        this.log({
          timestamp: now,
          agentId,
          taskId: 'UNKNOWN',
          filePath,
          action: 'VALIDATE',
          outcome: 'DENY',
          message: 'File has no owner assigned'
        });
        allowed = false;
        continue;
      }
      if (owner !== agentId) {
        console.warn(`${this.ts(now)} [FILE_OWNERSHIP] DENY modify: ${agentId} -> ${filePath} (owned by ${owner})`);
        this.log({
          timestamp: now,
          agentId,
          taskId: 'UNKNOWN',
          filePath,
          action: 'VALIDATE',
          outcome: 'DENY',
          message: `Owned by ${owner}`
        });
        allowed = false;
      }
    }

    return allowed;
  }

  /**
   * Suggest conflict resolution strategies.
   *
   * This method is intentionally conservative: it does not mutate state. It returns
   * suggestions that a coordinator can apply.
   */
  public getConflictResolution(conflict: FileOwnershipConflict): {
    reassignTask?: SwarmTask;
    splitTask?: SwarmTask[];
    sequenceTask?: string[];
  } {
    const now = Date.now();

    const uniqueConflicting = Array.from(new Set(conflict.conflictingTasks));
    const inferredTaskId = this.inferTaskIdFromConflict(conflict);
    const inferredTask = inferredTaskId ? this.taskRegistry.get(inferredTaskId) : undefined;

    const sequenceTask = inferredTaskId
      ? [...uniqueConflicting, inferredTaskId]
      : uniqueConflicting.length > 0
        ? uniqueConflicting
        : undefined;

    // Option 1: Reassign (non-overlapping subset) so the task can proceed immediately.
    const reassignTask = inferredTask
      ? this.buildReassignedTask(inferredTask, conflict.overlappingFiles, now)
      : undefined;

    // Option 2: Split the inferred task into two tasks: non-overlapping (can proceed) + overlapping (blocked/queued).
    const splitTask = inferredTask
      ? this.buildSplitTasks(inferredTask, conflict.overlappingFiles, uniqueConflicting, now)
      : undefined;

    return { reassignTask, splitTask, sequenceTask };
  }

  /**
   * Pretty-print current ownership state for debugging.
   */
  public debugPrintOwnership(): void {
    const entries = Array.from(this.getAllOwnedFiles().entries()).sort(([a], [b]) => a.localeCompare(b));
    const byAgent = new Map<string, string[]>();
    for (const [filePath, agentId] of entries) {
      const list = byAgent.get(agentId) ?? [];
      list.push(filePath);
      byAgent.set(agentId, list);
    }

    console.log(`${this.ts(Date.now())} [FILE_OWNERSHIP] Current ownership:`);
    if (entries.length === 0) {
      console.log('  (no owned files)');
      return;
    }
    for (const [agentId, files] of Array.from(byAgent.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  ${agentId}:`);
      for (const filePath of files) {
        console.log(`    - ${filePath}`);
      }
    }
  }

  /**
   * Validate internal maps for consistency.
   *
   * Returns true if:
   * - No file appears in multiple task file sets
   * - Every file in a task file set exists in the ownership map
   * - Every file in the ownership map appears in exactly one task file set
   */
  public validateIntegrity(): boolean {
    const fileToTask = new Map<string, string>();
    let ok = true;

    for (const [taskId, files] of this.taskFileMap.entries()) {
      for (const filePath of files) {
        const existing = fileToTask.get(filePath);
        if (existing && existing !== taskId) {
          console.error(`[FILE_OWNERSHIP] Integrity: file "${filePath}" appears in multiple tasks: ${existing}, ${taskId}`);
          ok = false;
        } else {
          fileToTask.set(filePath, taskId);
        }

        if (!this.ownershipMap.has(filePath)) {
          console.error(`[FILE_OWNERSHIP] Integrity: file "${filePath}" is in taskFileMap(${taskId}) but missing from ownershipMap`);
          ok = false;
        }
      }
    }

    for (const filePath of this.ownershipMap.keys()) {
      if (!fileToTask.has(filePath)) {
        console.error(`[FILE_OWNERSHIP] Integrity: file "${filePath}" is in ownershipMap but missing from taskFileMap`);
        ok = false;
      }
    }

    return ok;
  }

  /**
   * Development/test helper to clear all state.
   *
   * This should only be used in tests or local debugging sessions.
   */
  public resetForTesting(): void {
    this.ownershipMap.clear();
    this.taskFileMap.clear();
    this.accessLog = [];
    this.assignedAtMap.clear();
    this.taskRegistry.clear();
    console.warn(`${this.ts(Date.now())} [FILE_OWNERSHIP] resetForTesting(): cleared all ownership state`);
  }

  /**
   * Get a snapshot of recent access log entries.
   *
   * This method is provided for monitoring/debugging; callers should treat it as read-only.
   */
  public getAccessLogSnapshot(limit = 200): readonly AccessLogEntry[] {
    const safeLimit = Math.max(0, Math.min(limit, 5_000));
    return this.accessLog.slice(-safeLimit);
  }

  private log(entry: AccessLogEntry): void {
    // Keep the log bounded to prevent unbounded memory growth.
    const MAX = 10_000;
    this.accessLog.push(entry);
    if (this.accessLog.length > MAX) {
      this.accessLog.splice(0, this.accessLog.length - MAX);
    }
  }

  private releaseFileLock(filePath: string, taskId: TaskId, timestamp: UnixTimestampMs, reason?: string): void {
    const hadOwner = this.ownershipMap.delete(filePath);
    this.assignedAtMap.delete(filePath);

    // Remove from any task file sets (defensive).
    for (const [tid, files] of this.taskFileMap.entries()) {
      if (files.delete(filePath) && files.size === 0) {
        this.taskFileMap.delete(tid);
      }
    }

    if (hadOwner) {
      this.emitter.emit('file-released', { filePath, taskId, timestamp, reason } satisfies FileOwnershipEventPayloads['file-released']);
    }
  }

  private releaseExpiredLockIfNeeded(filePath: string, now: UnixTimestampMs): void {
    const assignedAt = this.assignedAtMap.get(filePath);
    if (!assignedAt) {
      return;
    }
    if (now - assignedAt <= this.lockTimeout) {
      return;
    }

    const owner = this.ownershipMap.get(filePath);
    if (!owner) {
      this.assignedAtMap.delete(filePath);
      return;
    }

    console.warn(`${this.ts(now)} [FILE_OWNERSHIP] Releasing stale lock on ${filePath} (owner=${owner}, ageMs=${now - assignedAt})`);
    this.releaseFileLock(filePath, 'UNKNOWN' as TaskId, now, 'stale_lock_timeout');
  }

  private findTasksOwningFile(filePath: string): string[] {
    const owners: string[] = [];
    for (const [taskId, files] of this.taskFileMap.entries()) {
      if (files.has(filePath)) {
        owners.push(taskId);
      }
    }
    return owners;
  }

  private ts(now: UnixTimestampMs): string {
    return `[${new Date(now).toISOString()}]`;
  }

  private detectConflictsForAgent(task: SwarmTask, agentId: string, now: UnixTimestampMs): FileOwnershipConflict | null {
    const overlappingFiles: string[] = [];
    const conflictingTaskIds = new Set<string>();

    for (const filePath of task.fileOwnership.files) {
      this.releaseExpiredLockIfNeeded(filePath, now);
      const currentOwner = this.ownershipMap.get(filePath);
      if (!currentOwner) {
        continue;
      }
      if (currentOwner === agentId) {
        // Re-entrant assignment by same agent is not a conflict.
        continue;
      }

      overlappingFiles.push(filePath);
      for (const owningTaskId of this.findTasksOwningFile(filePath)) {
        conflictingTaskIds.add(owningTaskId);
      }
    }

    if (overlappingFiles.length === 0) {
      return null;
    }

    return {
      conflictingTasks: Array.from(conflictingTaskIds),
      overlappingFiles,
      error: `File ownership conflict for ${task.id}: ${overlappingFiles.length} file(s) already owned by another agent/task.`
    };
  }

  private inferTaskIdFromConflict(conflict: FileOwnershipConflict): TaskId | null {
    // Best-effort inference: conflict.error is produced by this manager and includes "for <taskId>".
    const match = conflict.error.match(/\bfor\s+([A-Za-z0-9_-]+)\b/);
    if (!match) {
      return null;
    }
    return match[1] as TaskId;
  }

  private buildReassignedTask(task: SwarmTask, overlappingFiles: readonly string[], now: UnixTimestampMs): SwarmTask | undefined {
    const overlap = new Set(overlappingFiles);
    const remaining = Array.from(task.fileOwnership.files).filter((filePath) => !overlap.has(filePath));
    if (remaining.length === 0) {
      return undefined;
    }

    return {
      ...task,
      // Keep ID stable; this is a suggested reassign variant to remove conflicts.
      description: `${task.description}\n\n[Auto-suggestion] Reassigned to remove ${overlappingFiles.length} conflicting file(s).`,
      fileOwnership: {
        ...task.fileOwnership,
        files: new Set(remaining)
      },
      tracking: {
        ...task.tracking,
        assignedAt: now
      }
    };
  }

  private buildSplitTasks(
    task: SwarmTask,
    overlappingFiles: readonly string[],
    conflictingTasks: readonly string[],
    now: UnixTimestampMs
  ): SwarmTask[] | undefined {
    const overlap = new Set(overlappingFiles);
    const allFiles = Array.from(task.fileOwnership.files);
    const overlapList = allFiles.filter((filePath) => overlap.has(filePath));
    const remainingList = allFiles.filter((filePath) => !overlap.has(filePath));

    if (overlapList.length === 0 || remainingList.length === 0) {
      return undefined;
    }

    const baseDeps = Array.from(task.fileOwnership.dependencies);
    const overlapDeps = Array.from(new Set([...baseDeps, ...conflictingTasks]));

    const overlapTask: SwarmTask = {
      ...task,
      id: `${task.id}-OVERLAP`,
      title: `${task.title} (overlap)`,
      description: `${task.description}\n\n[Auto-suggestion] Split: handles conflicting files only.`,
      status: task.status,
      fileOwnership: {
        ...task.fileOwnership,
        files: new Set(overlapList),
        dependencies: overlapDeps
      },
      tracking: {
        ...task.tracking,
        assignedAt: now
      }
    };

    const remainingTask: SwarmTask = {
      ...task,
      id: `${task.id}-REMAINING`,
      title: `${task.title} (remaining)`,
      description: `${task.description}\n\n[Auto-suggestion] Split: handles non-conflicting files.`,
      status: task.status,
      fileOwnership: {
        ...task.fileOwnership,
        files: new Set(remainingList),
        dependencies: baseDeps
      },
      tracking: {
        ...task.tracking,
        assignedAt: now
      }
    };

    return [remainingTask, overlapTask];
  }
}
