import {
  AgentRole,
  SwarmTaskPriority,
  SwarmTaskStatus,
  type SwarmSharedContext,
  type SwarmTask,
  type TaskId
} from '@main/types/SwarmOrchestration';
import type { SwarmReviewStrictness } from '@shared/ipc';

type CoordinatorAgentProfile = Readonly<{
  agentId: string;
  role: string;
  cliProvider: string;
  personaLabel?: string;
  personality?: string;
  specialization?: string;
  reviewStrictness?: SwarmReviewStrictness;
}>;

/**
 * Build the Coordinator role prompt for goal decomposition.
 */
export function buildCoordinatorPrompt(
  goal: string,
  codebaseStructure: string,
  agents: readonly CoordinatorAgentProfile[],
  sharedContext?: SwarmSharedContext,
  promptOverride?: string
): string {
  const structure = truncateLines(codebaseStructure || '', 60);
  const roster = agents.map((agent) => {
    const details = [
      agent.role,
      agent.cliProvider,
      agent.specialization ? `specialty=${agent.specialization}` : null,
      agent.personality ? `personality=${agent.personality}` : null,
      agent.reviewStrictness ? `review=${agent.reviewStrictness}` : null
    ].filter(Boolean).join(', ');
    return `- ${agent.agentId}: ${details}`;
  }).join('\n');
  const context = sharedContext
    ? [
        `CONVENTIONS: ${sharedContext.conventions || '(not yet populated)'}`,
        `EXISTING PATTERNS: ${sharedContext.existingPatterns || '(not yet populated)'}`,
        `SECURITY: ${sharedContext.security || '(not yet populated)'}`,
        `TESTING: ${sharedContext.testing || '(not yet populated)'}`,
        `SCOUT FINDINGS: ${sharedContext.scoutFindings || '(not yet populated)'}`
      ].join('\n')
    : 'CONVENTIONS: (not yet populated)\nEXISTING PATTERNS: (not yet populated)\nSECURITY: (not yet populated)\nTESTING: (not yet populated)\nSCOUT FINDINGS: (not yet populated)';
  return `
YOU ARE THE QUANSWARM COORDINATOR.
Return only task blocks. No analysis. No preamble. No summaries.

Goal: break the user request into 3-5 parallel-safe tasks with explicit file ownership.

Rules:
- Output only task blocks in the exact format below
- DO NOT OUTPUT REPORTS, SUMMARIES, RECOMMENDATIONS, OR SHIP/NO-SHIP LANGUAGE
- Never assign ROLE: coordinator
- Allowed roles: builder, scout, reviewer
- No two tasks may modify the same file
- File paths must be relative to project root
- Builder tasks must include at least one file in FILES_TO_MODIFY
- If the repo/target is greenfield, propose the initial files to create
- Prefer builder tasks; use scout/reviewer only when clearly useful
- Keep tasks concrete and finishable in about 5-15 minutes

Exact format:
TASK: TASK-001
TITLE: Short task title
ROLE: builder
DESCRIPTION: 2-3 sentence description.
FILES_TO_MODIFY: [path1, path2]
DEPENDENCIES: []
ACCEPTANCE_CRITERIA:
- criterion 1
- criterion 2
- criterion 3

[GREENFIELD WEBSITE EXAMPLE]
TASK: TASK-001
TITLE: Create website shell
ROLE: builder
DESCRIPTION: Create the initial landing page files and base shell.
FILES_TO_MODIFY: [index.html, styles.css]
DEPENDENCIES: []
ACCEPTANCE_CRITERIA:
- index.html exists
- styles.css is linked
- base shell renders

CURRENT PROJECT STRUCTURE:
${structure || '(unavailable)'}

ACTIVE AGENT ROSTER:
${roster || '(unavailable)'}

CURRENT SHARED CONTEXT:
${context}

USER GOAL:
${goal}

COORDINATOR OVERRIDE:
${promptOverride?.trim() || '(NONE)'}

Output 3-5 tasks now.
`.trim();
}

/**
 * Parse a coordinator's task definitions into {@link SwarmTask} objects.
 *
 * This parser is intentionally strict: it rejects any output that doesn't match the required format.
 */
export function parseCoordinatorOutput(output: string): SwarmTask[] {
  const text = output.replace(/\r\n/g, '\n').trim();
  if (!text) {
    throw new Error('Coordinator output is empty.');
  }

  const nonEmptyLines = text.split('\n').filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length === 0 || !nonEmptyLines[0]!.startsWith('TASK:')) {
    throw new Error('Coordinator output must start with "TASK:" and contain only task blocks.');
  }

  const blocks = splitTaskBlocks(text);
  const tasks = blocks.map((block) => parseTaskBlock(block));

  // Validate uniqueness and no shared files across tasks.
  const taskIds = new Set<string>();
  const fileToTask = new Map<string, string>();

  for (const task of tasks) {
    if (taskIds.has(task.id)) {
      throw new Error(`Duplicate TASK id detected: "${task.id}".`);
    }
    taskIds.add(task.id);

    for (const filePath of task.fileOwnership.files) {
      const prev = fileToTask.get(filePath);
      if (!prev) {
        fileToTask.set(filePath, task.id);
      } else if (prev !== task.id) {
        throw new Error(`File ownership conflict: "${filePath}" appears in both ${prev} and ${task.id}.`);
      }
    }
  }

  return tasks;
}

function splitTaskBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const joined = current.join('\n').trim();
    if (joined) blocks.push(joined);
    current = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('TASK:')) {
      flush();
    }
    current.push(line);
  }
  flush();

  return blocks;
}

function parseTaskBlock(block: string): SwarmTask {
  const lines = block.split('\n').map((l) => l.trimEnd());

  const id = readRequiredLineValue(lines, 'TASK:') as TaskId;
  const title = readRequiredLineValue(lines, 'TITLE:');
  const roleRaw = readOptionalLineValue(lines, 'ROLE:');
  const description = readRequiredLineValue(lines, 'DESCRIPTION:');

  const filesRaw = readRequiredLineValue(lines, 'FILES_TO_MODIFY:');
  const dependenciesRaw = readRequiredLineValue(lines, 'DEPENDENCIES:');
  const files = parseBracketList(filesRaw, 'FILES_TO_MODIFY');
  const dependencies = parseBracketList(dependenciesRaw, 'DEPENDENCIES');

  const acceptanceCriteria = parseAcceptanceCriteria(lines);
  if (acceptanceCriteria.length === 0) {
    throw new Error(`Task ${id} must include at least 1 acceptance criterion under ACCEPTANCE_CRITERIA.`);
  }

  const executionRole = parseRole(roleRaw ?? 'builder', id);
  const reviewRequired = executionRole === AgentRole.BUILDER;

  return {
    id,
    title,
    description,
    status: SwarmTaskStatus.QUEUED,
    fileOwnership: {
      ownedBy: 'unassigned',
      files: new Set(files),
      dependencies
    },
    context: {
      goal: title,
      requirements: [],
      acceptanceCriteria,
      codePatterns: '',
      constraints: []
    },
    tracking: {
      assignedAgent: '',
      assignedAt: 0
    },
    execution: { role: executionRole, reviewRequired },
    priority: SwarmTaskPriority.MEDIUM,
    estimatedMinutes: 15
  };
}

function readRequiredLineValue(lines: readonly string[], prefix: string): string {
  const line = lines.find((l) => l.trimStart().startsWith(prefix));
  if (!line) {
    throw new Error(`Missing required line "${prefix}" in task block.`);
  }
  const value = line.slice(line.indexOf(prefix) + prefix.length).trim();
  if (!value) {
    throw new Error(`Line "${prefix}" must have a value.`);
  }
  return value;
}

function readOptionalLineValue(lines: readonly string[], prefix: string): string | null {
  const line = lines.find((l) => l.trimStart().startsWith(prefix));
  if (!line) return null;
  const value = line.slice(line.indexOf(prefix) + prefix.length).trim();
  return value || null;
}

function parseRole(raw: string, taskId: string): AgentRole {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'builder') return AgentRole.BUILDER;
  if (normalized === 'scout') return AgentRole.SCOUT;
  if (normalized === 'reviewer') return AgentRole.REVIEWER;
  if (normalized === 'coordinator') {
    throw new Error(`Task ${taskId}: ROLE must not be "coordinator". Use builder|scout|reviewer.`);
  }
  throw new Error(`Task ${taskId}: invalid ROLE "${raw}". Use builder|scout|reviewer.`);
}

function parseAcceptanceCriteria(lines: readonly string[]): string[] {
  const start = lines.findIndex((l) => l.trimStart() === 'ACCEPTANCE_CRITERIA:');
  if (start < 0) {
    throw new Error('Missing "ACCEPTANCE_CRITERIA:" section.');
  }
  const criteria: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;
    if (/^[A-Z_]+:/.test(trimmed) && !trimmed.startsWith('-')) {
      break;
    }
    if (!trimmed.startsWith('-')) {
      throw new Error('Acceptance criteria lines must start with "- ".');
    }
    const value = trimmed.replace(/^-+\s*/, '').trim();
    if (value) criteria.push(value);
  }
  return criteria;
}

function parseBracketList(raw: string, field: string): string[] {
  const trimmed = raw.trim();
  const match = trimmed.match(/^\[(.*)\]$/);
  if (!match) {
    throw new Error(`${field} must be a bracket list like [a, b]. Got: "${raw}"`);
  }
  const inner = match[1] ?? '';
  if (!inner.trim()) {
    return [];
  }
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^['"]|['"]$/g, ''));
}

function truncateLines(text: string, maxLines: number): string {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length <= maxLines) return normalized.trim();
  return `${lines.slice(0, maxLines).join('\n')}\n… (truncated)`;
}
