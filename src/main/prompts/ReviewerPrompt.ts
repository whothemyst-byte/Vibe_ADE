import type { SwarmSharedContext, SwarmTask } from '@main/types/SwarmOrchestration';
import type { SwarmReviewStrictness } from '@shared/ipc';

type ReviewerProfile = Readonly<{
  personaLabel?: string;
  personality?: string;
  specialization?: string;
  promptOverride?: string;
  reviewStrictness?: SwarmReviewStrictness;
}>;

/**
 * Build a "Reviewer executes work" prompt for analysis/report tasks assigned to reviewers.
 *
 * This is distinct from {@link buildReviewerPrompt}, which is a quality-gate review of builder work.
 */
export function buildReviewerWorkPrompt(task: SwarmTask, sharedContext: SwarmSharedContext, profile?: ReviewerProfile): string {
  const ownedFiles = Array.from(task.fileOwnership.files).sort().join('\n') || '(none)';
  const criteria = (task.context.acceptanceCriteria ?? []).map((c) => `- ${c}`).join('\n') || '- (NONE PROVIDED)';
  const constraints = (task.context.constraints ?? []).map((c) => `- ${c}`).join('\n') || '- (NONE)';
  const structure = truncateLines(sharedContext.codebaseStructure || '', 120);
  const persona = profile?.personaLabel?.trim() || 'Principal Engineer';
  const personality = profile?.personality?.trim() || 'Exacting, concise, and evidence-driven.';
  const specialization = profile?.specialization?.trim() || 'Quality audits and report execution';

  return `
[SYSTEM ROLE]
YOU ARE A QUANSWARM REVIEWER EXECUTING A REVIEW OR REPORT TASK.
YOU OPERATE AS THE ${persona.toUpperCase()}.

[PERSONALITY]
${personality}

[SPECIALIZATION]
${specialization}

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

SCOUT FINDINGS:
${sharedContext.scoutFindings || '(unknown)'}

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

[ROLE OVERRIDE]
${profile?.promptOverride?.trim() || '(NONE)'}

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
export function buildReviewerPrompt(
  task: SwarmTask,
  acceptanceCriteria: string[],
  sharedContext: SwarmSharedContext,
  profile?: ReviewerProfile
): string {
  const ownedFiles = Array.from(task.fileOwnership.files).sort().join(', ');
  const criteria = (acceptanceCriteria.length > 0 ? acceptanceCriteria : task.context.acceptanceCriteria).map((c) => `- ${c}`).join('\n') || '- (NONE PROVIDED)';
  const strictness = profile?.reviewStrictness ?? 'strict';
  const personality = profile?.personality?.trim() || 'Independent, skeptical, and specific.';
  const evidence = task.tracking.completionEvidence;
  const reportedFiles = evidence?.reportedFilesModified.length ? evidence.reportedFilesModified.join(', ') : '(not reported)';
  const observedFiles = evidence?.observedFilesModified.length ? evidence.observedFilesModified.join(', ') : '(not observed)';
  const ownershipViolations = evidence?.ownershipViolations.length ? evidence.ownershipViolations.join(', ') : '(none)';
  const evidenceNotes = evidence?.evidenceNotes.length ? evidence.evidenceNotes.map((note) => `- ${note}`).join('\n') : '- (none)';

  return `
[SYSTEM ROLE]
YOU ARE THE QUANSWARM REVIEWER QUALITY GATE.
YOU ARE AN INDEPENDENT PRINCIPAL ENGINEER REVIEWING COMPLETED WORK.

[PERSONALITY]
${personality}

[REVIEW STRICTNESS]
${strictness.toUpperCase()}

[PROJECT CONTEXT]
CONVENTIONS: ${sharedContext.conventions || '(unknown)'}
EXISTING PATTERNS: ${sharedContext.existingPatterns || '(unknown)'}
SECURITY: ${sharedContext.security || '(unknown)'}
TESTING: ${sharedContext.testing || '(unknown)'}
SCOUT FINDINGS: ${sharedContext.scoutFindings || '(unknown)'}

[REVIEW TASK]
TASK: ${task.id}
TITLE: ${task.title}

[COMPLETION EVIDENCE]
REPORTED FILES_MODIFIED: ${reportedFiles}
OBSERVED FILES_MODIFIED: ${observedFiles}
TASK OWNERSHIP SCOPE: ${ownedFiles}
OWNERSHIP VIOLATIONS: ${ownershipViolations}
BUILDER SUMMARY: ${task.tracking.feedback || '(none provided)'}
EVIDENCE NOTES:
${evidenceNotes}

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
- TREAT MISSING EVIDENCE AS A REASON TO BE MORE SKEPTICAL, NOT LESS
- REJECT IF OBSERVED FILES FALL OUTSIDE OWNERSHIP SCOPE
- REJECT IF THE BUILDER'S REPORTED FILES DO NOT MATCH OBSERVED CHANGES WITHOUT A CREDIBLE EXPLANATION

[ROLE OVERRIDE]
${profile?.promptOverride?.trim() || '(NONE)'}
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
