import { ipcMain, type WebContents } from 'electron';
import path from 'node:path';
import { swarmManager } from '@main/services/SwarmManager';
import { swarmEventBus } from '@main/services/SwarmEventBus';
import type { SwarmEvent } from '@main/types/SwarmEvents';
import type { AgentState, SwarmState, SwarmTask } from '@main/types/SwarmOrchestration';
import type { SwarmReviewStrictness } from '@shared/ipc';
import { assertExistingPath, assertNonEmptyString } from './shared/validators';

type SwarmCreateAgent = {
  agentId: string;
  role: 'coordinator' | 'builder' | 'scout' | 'reviewer';
  cliProvider: 'claude' | 'codex' | 'gemini';
  personaLabel?: string;
  personality?: string;
  specialization?: string;
  promptOverride?: string;
  reviewStrictness?: SwarmReviewStrictness;
};
type SwarmCreateConfig = { swarmId: string; goal: string; codebaseRoot: string; agents: SwarmCreateAgent[] };

function validateSwarmCreateConfig(input: unknown): SwarmCreateConfig {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid swarm:create config');
  }
  const obj = input as Record<string, unknown>;
  assertNonEmptyString(obj.swarmId, 'swarmId');
  assertNonEmptyString(obj.goal, 'goal');
  assertNonEmptyString(obj.codebaseRoot, 'codebaseRoot');
  assertExistingPath(obj.codebaseRoot, 'codebaseRoot', 'dir');
  if (!Array.isArray(obj.agents) || obj.agents.length === 0) {
    throw new Error('Invalid agents');
  }

  const agents: SwarmCreateAgent[] = [];
  for (const raw of obj.agents) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid agents');
    }
    const a = raw as Record<string, unknown>;
    assertNonEmptyString(a.agentId, 'agentId');
    if (typeof a.role !== 'string' || !['coordinator', 'builder', 'scout', 'reviewer'].includes(a.role)) {
      throw new Error('Invalid agent role');
    }
    if (typeof a.cliProvider !== 'string' || !['claude', 'codex', 'gemini'].includes(a.cliProvider)) {
      throw new Error('Invalid cliProvider');
    }
    const optionalString = (value: unknown, field: string): string | undefined => {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }
      if (typeof value !== 'string') {
        throw new Error(`Invalid ${field}`);
      }
      return value;
    };
    const reviewStrictness = optionalString(a.reviewStrictness, 'reviewStrictness');
    if (reviewStrictness && !['balanced', 'strict', 'critical'].includes(reviewStrictness)) {
      throw new Error('Invalid reviewStrictness');
    }
    agents.push({
      agentId: a.agentId,
      role: a.role as SwarmCreateAgent['role'],
      cliProvider: a.cliProvider as SwarmCreateAgent['cliProvider'],
      personaLabel: optionalString(a.personaLabel, 'personaLabel'),
      personality: optionalString(a.personality, 'personality'),
      specialization: optionalString(a.specialization, 'specialization'),
      promptOverride: optionalString(a.promptOverride, 'promptOverride'),
      reviewStrictness: reviewStrictness as SwarmReviewStrictness | undefined
    });
  }

  return {
    swarmId: obj.swarmId,
    goal: obj.goal,
    codebaseRoot: path.resolve(obj.codebaseRoot),
    agents
  };
}

function serializeSwarmTask(task: SwarmTask): unknown {
  return {
    ...task,
    fileOwnership: {
      ...task.fileOwnership,
      files: Array.from(task.fileOwnership.files)
    }
  };
}

function serializeSwarmState(state: SwarmState): unknown {
  const tasks: Record<string, unknown> = {};
  for (const [id, task] of state.tasks.entries()) {
    tasks[id] = serializeSwarmTask(task);
  }

  const agents: Record<string, AgentState> = {};
  for (const [id, agent] of state.agents.entries()) {
    agents[id] = agent;
  }

  const ownership: Record<string, string> = {};
  for (const [filePath, taskId] of state.fileOwnershipMap.entries()) {
    ownership[filePath] = taskId;
  }

  const dependencies: Record<string, string[]> = {};
  for (const [taskId, deps] of state.dependencies.entries()) {
    dependencies[taskId] = [...deps];
  }

  return {
    swarmId: state.swarmId,
    overallGoal: state.overallGoal,
    createdAt: state.createdAt,
    tasks,
    agents,
    fileOwnershipMap: ownership,
    parallelGroups: state.parallelGroups.map((g) => [...g]),
    dependencies,
    sharedContext: state.sharedContext,
    mailbox: state.mailbox.map((entry) => ({ ...entry })),
    taskArtifacts: Object.fromEntries(Array.from(state.taskArtifacts.entries()).map(([taskId, artifacts]) => [taskId, artifacts.map((artifact) => ({ ...artifact }))]))
  };
}

function serializeSwarmEvent(event: SwarmEvent): unknown {
  if (event.type === 'task-created') {
    return { ...event, task: serializeSwarmTask(event.task) };
  }
  if (event.type === 'tasks-decomposed') {
    return { ...event, tasks: event.tasks.map((t) => serializeSwarmTask(t)) };
  }
  return event;
}

type TranscriptEventType =
  | 'swarm-started'
  | 'tasks-decomposed'
  | 'task-started'
  | 'task-completed'
  | 'task-evidence'
  | 'review-started'
  | 'review-approved'
  | 'review-rejected'
  | 'mailbox'
  | 'agent-ready'
  | 'agent-stopped'
  | 'agent-blocked'
  | 'error';

type TranscriptEvent = {
  id: string;
  timestamp: number;
  type: TranscriptEventType;
  message: string;
  meta?: Record<string, string>;
};

function toTranscriptEvent(event: SwarmEvent): TranscriptEvent | null {
  const id = `${event.type}:${event.timestamp}`;
  switch (event.type) {
    case 'swarm-created':
      return { id, timestamp: event.timestamp, type: 'swarm-started', message: 'Swarm started' };
    case 'tasks-decomposed':
      return {
        id,
        timestamp: event.timestamp,
        type: 'tasks-decomposed',
        message: `Tasks decomposed (${event.taskCount} tasks)`
      };
    case 'task-assigned':
    case 'task-started':
      return {
        id,
        timestamp: event.timestamp,
        type: 'task-started',
        message: `${event.agentId} started ${event.taskId}`,
        meta: { taskId: event.taskId, agentId: event.agentId }
      };
    case 'task-completed':
      return {
        id,
        timestamp: event.timestamp,
        type: 'task-completed',
        message: `${event.agentId} completed ${event.taskId}`,
        meta: { taskId: event.taskId, agentId: event.agentId }
      };
    case 'task-evidence-updated':
      return {
        id,
        timestamp: event.timestamp,
        type: 'task-evidence',
        message: `Evidence captured for ${event.taskId}`,
        meta: {
          taskId: event.taskId,
          observedFiles: String(event.evidence.observedFilesModified.length),
          ownershipViolations: String(event.evidence.ownershipViolations.length)
        }
      };
    case 'task-review-started':
      return {
        id,
        timestamp: event.timestamp,
        type: 'review-started',
        message: `${event.reviewerId} started review (${event.taskId})`,
        meta: { taskId: event.taskId, reviewerId: event.reviewerId }
      };
    case 'task-approved':
      return {
        id,
        timestamp: event.timestamp,
        type: 'review-approved',
        message: `Review approved ${event.taskId}`,
        meta: { taskId: event.taskId, reviewerId: event.reviewerId }
      };
    case 'task-rejected':
      return {
        id,
        timestamp: event.timestamp,
        type: 'review-rejected',
        message: `Review rejected ${event.taskId}`,
        meta: { taskId: event.taskId, reviewerId: event.reviewerId }
      };
    case 'mailbox-message-posted':
      return {
        id,
        timestamp: event.timestamp,
        type: 'mailbox',
        message: `${event.entry.fromAgentId} -> ${event.entry.toAgentId ?? 'all'}: ${event.entry.subject}`,
        meta: {
          taskId: event.entry.taskId ?? '',
          fromAgentId: event.entry.fromAgentId,
          toAgentId: event.entry.toAgentId ?? '',
          category: event.entry.category
        }
      };
    case 'agent-started':
      return {
        id,
        timestamp: event.timestamp,
        type: 'agent-ready',
        message: `Agent started: ${event.agentId} (${event.role})`,
        meta: { agentId: event.agentId, role: event.role }
      };
    case 'agent-stopped':
      return {
        id,
        timestamp: event.timestamp,
        type: 'agent-stopped',
        message: `Agent stopped: ${event.agentId}`,
        meta: { agentId: event.agentId }
      };
    case 'agent-blocked':
      return {
        id,
        timestamp: event.timestamp,
        type: 'agent-blocked',
        message: `Agent blocked: ${event.agentId} (${event.taskId})`,
        meta: { agentId: event.agentId, taskId: event.taskId }
      };
    case 'error-occurred':
      return {
        id,
        timestamp: event.timestamp,
        type: 'error',
        message: event.message,
        meta: { severity: event.severity, component: event.component }
      };
    default:
      return null;
  }
}

interface Deps {
  webContents: WebContents;
}

export function registerSwarmHandlers({ webContents }: Deps): void {
  swarmEventBus.attachUiBridge({
    emitEvent: (event) => {
      const transcript = toTranscriptEvent(event);
      if (!transcript) return;
      webContents.send('swarm:event', { swarmId: event.swarmId, event: transcript });
    },
    emitSwarmUpdate: (swarmId, state) => {
      webContents.send('swarm:update', { swarmId, state: serializeSwarmState(state) });
    },
    emitAgentStatus: (swarmId, agent) => {
      webContents.send('swarm:agent-status', { swarmId, agent });
    }
  });

  swarmManager.onAgentOutput((payload) => {
    webContents.send('swarm:agent-output', payload);
  });

  ipcMain.handle('swarm:create', async (_event, config: unknown) => {
    try {
      const validated = validateSwarmCreateConfig(config);
      const state = await swarmManager.initializeSwarm(validated);
      return { success: true, swarmState: serializeSwarmState(state) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('swarm:status', async (_event, swarmId: unknown) => {
    assertNonEmptyString(swarmId, 'swarmId');
    return swarmManager.getSwarmStatus(swarmId);
  });

  ipcMain.handle('swarm:state', async (_event, swarmId: unknown) => {
    assertNonEmptyString(swarmId, 'swarmId');
    const state = swarmManager.getSwarmState(swarmId);
    return serializeSwarmState(state);
  });

  ipcMain.handle('swarm:events', async (_event, swarmId: unknown, count: unknown = 10) => {
    assertNonEmptyString(swarmId, 'swarmId');
    const n = typeof count === 'number' && Number.isFinite(count) ? count : 10;
    const events = swarmManager.getRecentEvents(swarmId, n);
    return events.map((e) => serializeSwarmEvent(e));
  });

  ipcMain.handle('swarm:agentOutput', async (_event, swarmId: unknown, maxLines: unknown = 200) => {
    assertNonEmptyString(swarmId, 'swarmId');
    const n = typeof maxLines === 'number' && Number.isFinite(maxLines) ? maxLines : 200;
    return swarmManager.getAgentOutputSnapshot(swarmId, n);
  });

  ipcMain.handle('swarm:stop', async (_event, swarmId: unknown) => {
    assertNonEmptyString(swarmId, 'swarmId');
    await swarmManager.stopSwarm(swarmId);
    return { success: true };
  });
}
