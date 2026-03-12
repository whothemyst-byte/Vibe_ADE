import type { SwarmSharedContext, SwarmTask } from '@main/types/SwarmOrchestration';

/**
 * Build the Builder role prompt for implementing a specific task.
 */
export function buildBuilderPrompt(task: SwarmTask, sharedContext: SwarmSharedContext, scout?: string): string {
  const ownedFiles = Array.from(task.fileOwnership.files).sort();
  const acceptance = task.context.acceptanceCriteria.map((c) => `- ${c}`).join('\n') || '- (NONE PROVIDED)';
  const constraints = task.context.constraints.length > 0 ? task.context.constraints.map((c) => `- ${c}`).join('\n') : '- (NONE)';

  return `
[SYSTEM ROLE]
YOU ARE A SENIOR SOFTWARE ENGINEER ON A TEAM WORKING ON VIBE-ADE.

[YOUR TASK]
COMPLETE THE FOLLOWING TASK:

TASK: ${task.id}
TITLE: ${task.title}
DESCRIPTION: ${task.description}

[FILES YOU OWN (ONLY THESE)]
${ownedFiles.join('\n')}

[CRITICAL: FILES YOU CANNOT TOUCH]
ALL OTHER FILES IN THE REPOSITORY ARE OFF-LIMITS.

[SHARED CONTEXT]
CONVENTIONS: ${sharedContext.conventions}
EXISTING PATTERNS: ${sharedContext.existingPatterns}
SECURITY: ${sharedContext.security}
TESTING: ${sharedContext.testing}

[ACCEPTANCE CRITERIA]
${acceptance}

[CODE PATTERNS TO MATCH]
${task.context.codePatterns || '(NONE PROVIDED)'}

[ARCHITECTURAL CONSTRAINTS]
${constraints}

[WORKFLOW]
1. UNDERSTAND: READ THIS TASK AND ACCEPTANCE CRITERIA
2. EXPLORE: IF YOU NEED GUIDANCE, ASK @SCOUT WITH A SINGLE, SPECIFIC QUESTION
3. PLAN: DRAFT YOUR APPROACH BRIEFLY
4. IMPLEMENT: WRITE CODE MATCHING EXISTING PATTERNS
5. TEST: VERIFY ALL ACCEPTANCE CRITERIA PASS
6. SUBMIT: WHEN DONE, OUTPUT EXACTLY:
   MARK_DONE: ${task.id}

[SCOUT GUIDANCE (IF AVAILABLE)]
${scout ? scout : '(NONE)'}

[STRICT RULES]
- ONLY MODIFY FILES IN YOUR OWNERSHIP LIST
- DO NOT TOUCH ANY FILE OUTSIDE YOUR LIST
- DO NOT ASK FOR UNRELATED HELP
- MATCH EXISTING CODE STYLE AND PATTERNS
- WRITE TESTS FOR CRITICAL LOGIC (IF APPLICABLE)
- HANDLE ERRORS PROPERLY

WHEN COMPLETE, OUTPUT ONLY:
MARK_DONE: ${task.id}
`.trim();
}

/**
 * Parse a builder's output to detect task completion.
 */
export function parseBuilderCompletion(output: string): { taskId: string; complete: boolean; filesModified: string[] } {
  const text = output.replace(/\r\n/g, '\n');
  const doneMatch = text.match(/^\s*MARK_DONE:\s*(TASK-[A-Za-z0-9_-]+)\s*$/m);
  const filesModified = parseOptionalFilesModified(text);

  if (!doneMatch) {
    return { taskId: '', complete: false, filesModified };
  }
  return { taskId: doneMatch[1]!, complete: true, filesModified };
}

function parseOptionalFilesModified(text: string): string[] {
  // Optional helper: supports either "FILES_MODIFIED: [a, b]" or a bullet list under "FILES_MODIFIED:".
  const bracket = text.match(/^\s*FILES_MODIFIED:\s*(\[[^\]]*\])\s*$/m);
  if (bracket) {
    return parseBracketList(bracket[1]!);
  }

  const start = text.split('\n').findIndex((l) => l.trim() === 'FILES_MODIFIED:');
  if (start < 0) {
    return [];
  }

  const lines = text.split('\n').slice(start + 1);
  const files: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[A-Z_]+:/.test(trimmed)) break;
    if (trimmed.startsWith('-')) {
      const value = trimmed.replace(/^-+\s*/, '').trim();
      if (value) files.push(value);
    }
  }
  return files;
}

function parseBracketList(raw: string): string[] {
  const trimmed = raw.trim();
  const match = trimmed.match(/^\[(.*)\]$/);
  if (!match) {
    return [];
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

