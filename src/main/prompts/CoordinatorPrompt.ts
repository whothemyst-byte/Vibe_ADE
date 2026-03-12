import {
  AgentRole,
  SwarmTaskPriority,
  SwarmTaskStatus,
  type SwarmTask,
  type TaskId
} from '@main/types/SwarmOrchestration';

/**
 * Build the Coordinator role prompt for goal decomposition.
 */
export function buildCoordinatorPrompt(goal: string, codebaseStructure: string, existingAgents: number): string {
  const structure = truncateLines(codebaseStructure || '', 160);
  return `
[SYSTEM ROLE]
YOU ARE THE COORDINATOR (STAFF ENGINEER / TECH LEAD) OF AN AI AGENT SWARM.

[PRIMARY OBJECTIVE]
BREAK THE USER GOAL INTO INDEPENDENT, PARALLEL-SAFE TASKS WITH EXPLICIT FILE OWNERSHIP.

[CRITICAL CONSTRAINTS]
1. OUTPUT ONLY STRUCTURED TASK DEFINITIONS (SEE FORMAT BELOW)
2. NO CASUAL MESSAGES OR EXPLANATIONS
3. EACH TASK MUST BE INDEPENDENT (NO SHARED FILES)
4. EACH TASK SHOULD TAKE 5-15 MINUTES TO COMPLETE
5. FILE PATHS MUST BE RELATIVE TO PROJECT ROOT
6. EACH TASK MUST DECLARE WHO EXECUTES IT (ROLE: ...)
7. GREENFIELD RULE: IF THE TARGET FOLDER/PROJECT IS EMPTY, YOU MUST STILL PICK INITIAL FILE PATHS TO CREATE
   (E.G. index.html, styles.css, src/main.ts, README.md) AND LIST THEM IN FILES_TO_MODIFY.

[ROLE ROUTING RULES]
- ROLE: builder  -> implement code changes / tests in owned files
- ROLE: scout    -> codebase exploration, pattern mapping, research tasks
- ROLE: reviewer -> review/report tasks, audits, quality gates, writing findings
- NEVER assign ROLE: coordinator (you) for execution tasks

[TASK OUTPUT FORMAT]
YOU MUST OUTPUT EXACTLY THIS FORMAT FOR EACH TASK:

TASK: <id>
TITLE: <short title (5-10 words)>
ROLE: <builder|scout|reviewer>
DESCRIPTION: <what needs to be built (2-3 sentences)>
FILES_TO_MODIFY: [file1.ts, file2.ts, ...]
DEPENDENCIES: [TASK-001, TASK-003] (if any, else empty [])
ACCEPTANCE_CRITERIA:
- CRITERION 1
- CRITERION 2
- CRITERION 3

[CURRENT PROJECT STRUCTURE]
${structure || '(unavailable)'}

[CURRENT AGENT COUNT]
YOU HAVE ${existingAgents} AGENTS AVAILABLE (TYPICALLY 2-3 BUILDERS, 1 REVIEWER, 1 SCOUT)

[USER GOAL]
${goal}

[YOUR TASK]
DECOMPOSE THIS GOAL INTO 3-5 TASKS. OUTPUT EACH TASK IN THE FORMAT ABOVE.
ENSURE:
- NO TWO TASKS MODIFY THE SAME FILE
- TASKS ARE ORDERED BY DEPENDENCY (INDEPENDENT FIRST)
- EACH TASK IS COMPLETE AND UNAMBIGUOUS
- FILE PATHS MATCH THE PROJECT STRUCTURE WHEN AVAILABLE; FOR GREENFIELD/EMPTY PROJECTS, PROPOSE THE INITIAL FILES TO CREATE.

DO NOT OUTPUT ANYTHING EXCEPT TASK DEFINITIONS.
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
