import type { SwarmSharedContext, SwarmTask } from '@main/types/SwarmOrchestration';

/**
 * Build a "Reviewer executes work" prompt for analysis/report tasks assigned to reviewers.
 *
 * This is distinct from {@link buildReviewerPrompt}, which is a quality-gate review of builder work.
 */
export function buildReviewerWorkPrompt(task: SwarmTask, sharedContext: SwarmSharedContext): string {
  const ownedFiles = Array.from(task.fileOwnership.files).sort().join('\n') || '(none)';
  const criteria = (task.context.acceptanceCriteria ?? []).map((c) => `- ${c}`).join('\n') || '- (NONE PROVIDED)';
  const constraints = (task.context.constraints ?? []).map((c) => `- ${c}`).join('\n') || '- (NONE)';
  const structure = truncateLines(sharedContext.codebaseStructure || '', 120);

  return `
[SYSTEM ROLE]
YOU ARE A PRINCIPAL ENGINEER (REVIEWER ROLE) EXECUTING A REVIEW/REPORT TASK.

[YOUR TASK]
COMPLETE THE FOLLOWING TASK:

TASK: ${task.id}
TITLE: ${task.title}
DESCRIPTION: ${task.description}

[FILES YOU OWN (ONLY THESE)]
${ownedFiles}

[ACCEPTANCE CRITERIA]
${criteria}

[ARCHITECTURAL CONSTRAINTS]
${constraints}

[PROJECT CONTEXT]
CODEBASE STRUCTURE (ABBREVIATED):
${structure || '(unavailable)'}

CONVENTIONS:
${sharedContext.conventions || '(unknown)'}

EXISTING PATTERNS:
${sharedContext.existingPatterns || '(unknown)'}

[WORKFLOW]
1. UNDERSTAND: READ TASK + ACCEPTANCE CRITERIA
2. PLAN: OUTLINE WHAT YOU WILL PRODUCE
3. EXECUTE: WRITE THE REPORT/OUTPUT IN THE OWNED FILE(S)
4. VERIFY: CHECK ACCEPTANCE CRITERIA
5. SUBMIT: WHEN DONE, OUTPUT EXACTLY:
   MARK_DONE: ${task.id}

[STRICT RULES]
- ONLY MODIFY FILES IN YOUR OWNERSHIP LIST
- DO NOT MODIFY UNRELATED FILES
- BE CONCISE AND STRUCTURED
- FOLLOW PROJECT CONVENTIONS
- DO NOT OUTPUT CHATTER; ONLY WORK AND FINAL MARK_DONE LINE

START NOW. WHEN COMPLETE, OUTPUT:
MARK_DONE: ${task.id}
  `.trim();
}

function truncateLines(text: string, maxLines: number): string {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length <= maxLines) return normalized.trim();
  return `${lines.slice(0, maxLines).join('\n')}\n… (truncated)`;
}

/**
 * Build the Reviewer role prompt for quality-gate review.
 */
export function buildReviewerPrompt(task: SwarmTask, acceptanceCriteria: string[]): string {
  const ownedFiles = Array.from(task.fileOwnership.files).sort().join(', ');
  const criteria = (acceptanceCriteria.length > 0 ? acceptanceCriteria : task.context.acceptanceCriteria).map((c) => `- ${c}`).join('\n') || '- (NONE PROVIDED)';

  return `
[SYSTEM ROLE]
YOU ARE A PRINCIPAL ENGINEER (QUALITY GATE) REVIEWING COMPLETED WORK.

[REVIEW TASK]
TASK: ${task.id}
TITLE: ${task.title}

[ACCEPTANCE CRITERIA TO VERIFY]
${criteria}

[REVIEW CHECKLIST]
GO THROUGH EACH ITEM:

1. ACCEPTANCE CRITERIA
   - DOES THE IMPLEMENTATION MEET EVERY CRITERION?
   - YES / NO
   - NOTES: <IF NO, EXPLAIN WHICH CRITERIA FAILED>

2. CODE PATTERNS
   - DOES CODE MATCH EXISTING PATTERNS IN CODEBASE?
   - YES / NO
   - NOTES: <IF NO, WHICH PATTERNS VIOLATED>

3. SECURITY
   - ANY SQL INJECTION RISKS?
   - ANY AUTHENTICATION/AUTHORIZATION ISSUES?
   - ANY XSS OR DATA LEAKAGE?
   - NO ISSUES / FOUND ISSUES
   - NOTES: <DETAILS IF ISSUES FOUND>

4. ERROR HANDLING
   - ARE ERRORS CAUGHT AND HANDLED?
   - DO ERROR MESSAGES HELP DEBUGGING?
   - COMPLETE / INCOMPLETE
   - NOTES: <DETAILS>

5. FILE OWNERSHIP
   - WERE ONLY ASSIGNED FILES MODIFIED?
   - ${ownedFiles}
   - YES / NO
   - NOTES: <IF NO, WHICH FILES SHOULD NOT BE TOUCHED>

6. TESTS
   - ARE CRITICAL PATHS TESTED?
   - DO TESTS PASS?
   - YES / NO
   - NOTES: <DETAILS>

[YOUR DECISION]
AFTER REVIEWING, OUTPUT EXACTLY ONE OF:

APPROVE: ${task.id}
Feedback: <POSITIVE FEEDBACK>

OR

REJECT: ${task.id}
Feedback: <SPECIFIC, ACTIONABLE FEEDBACK FOR BUILDER>
Blockers:
- <BLOCKER 1>
- <BLOCKER 2>

[CRITICAL RULES]
- DO NOT APPROVE IF ANY CHECKLIST ITEM FAILS
- PROVIDE SPECIFIC, ACTIONABLE FEEDBACK
- BE CONSTRUCTIVE BUT FIRM ON QUALITY
- DO NOT APPROVE INCOMPLETE WORK
`.trim();
}

/**
 * Parse a reviewer decision output into a structured object.
 */
export function parseReviewerDecision(output: string): {
  decision: 'APPROVE' | 'REJECT';
  taskId: string;
  feedback: string;
  blockers?: string[];
} {
  const text = output.replace(/\r\n/g, '\n').trim();
  if (!text) {
    throw new Error('Reviewer output is empty.');
  }

  const approve = text.match(/^\s*APPROVE:\s*(TASK-[A-Za-z0-9_-]+)\s*$/m);
  const reject = text.match(/^\s*REJECT:\s*(TASK-[A-Za-z0-9_-]+)\s*$/m);

  if (!!approve === !!reject) {
    throw new Error('Reviewer output must contain exactly one of "APPROVE: TASK-XXX" or "REJECT: TASK-XXX".');
  }

  const decision = approve ? 'APPROVE' : 'REJECT';
  const taskId = (approve?.[1] ?? reject?.[1])!;

  const feedback = extractFeedback(text);
  if (!feedback) {
    throw new Error('Reviewer output must include a "Feedback:" line.');
  }

  const blockers = decision === 'REJECT' ? extractBlockers(text) : undefined;
  return { decision, taskId, feedback, blockers };
}

function extractFeedback(text: string): string {
  const match = text.match(/^\s*Feedback:\s*(.*)$/m);
  if (!match) return '';

  const startIndex = match.index ?? 0;
  const after = text.slice(startIndex);
  const lines = after.split('\n');

  // First line contains the initial feedback.
  const first = lines[0]!.replace(/^\s*Feedback:\s*/, '').trim();
  const rest: string[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (trimmed.startsWith('Blockers:')) break;
    if (/^(APPROVE|REJECT):/.test(trimmed)) break;
    rest.push(line);
  }

  const combined = [first, ...rest].join('\n').trim();
  return combined;
}

function extractBlockers(text: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === 'Blockers:');
  if (start < 0) return [];

  const blockers: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;
    if (/^[A-Z_]+:/.test(trimmed) && !trimmed.startsWith('-')) break;
    if (trimmed.startsWith('-')) {
      const value = trimmed.replace(/^-+\s*/, '').trim();
      if (value) blockers.push(value);
    }
  }
  return blockers;
}
