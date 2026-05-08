import { describe, expect, it } from 'vitest';
import { buildCoordinatorPrompt } from '../../src/main/prompts/CoordinatorPrompt';
import { buildBuilderPrompt } from '../../src/main/prompts/BuilderPrompt';
import { buildReviewerPrompt } from '../../src/main/prompts/ReviewerPrompt';
import { buildScoutPrompt, buildScoutWorkPrompt } from '../../src/main/prompts/ScoutPrompt';
import { AgentRole, SwarmTaskPriority, SwarmTaskStatus, type SwarmSharedContext, type SwarmTask } from '../../src/main/types/SwarmOrchestration';

const sharedContext: SwarmSharedContext = {
  codebaseStructure: 'src/\n  - main.ts',
  conventions: 'Prefer small focused modules.',
  existingPatterns: 'Use service classes and explicit error handling.',
  security: 'Validate inputs and avoid unsafe shell execution.',
  testing: 'Add tests for changed critical logic.',
  scoutFindings: 'src/main.ts initializes the app and tests live under tests/main.',
  scoutUpdatedAt: 123
};

function makeTask(): SwarmTask {
  return {
    id: 'TASK-001',
    title: 'Improve swarm prompts',
    description: 'Update prompt builders and shared context handling.',
    status: SwarmTaskStatus.QUEUED,
    fileOwnership: {
      ownedBy: 'builder-1',
      files: new Set(['src/main/prompts/BuilderPrompt.ts']),
      dependencies: []
    },
    context: {
      goal: 'Improve prompts',
      requirements: [],
      acceptanceCriteria: ['Prompt includes scout findings'],
      codePatterns: 'Keep prompt output parser-safe.',
      constraints: ['No parser drift']
    },
    tracking: {
      assignedAgent: 'builder-1',
      assignedAt: 0,
      completionEvidence: {
        reportedFilesModified: ['src/main/prompts/BuilderPrompt.ts'],
        observedFilesModified: ['src/main/prompts/BuilderPrompt.ts', 'src/renderer/src/components/SwarmBoard.tsx'],
        ownershipViolations: ['src/renderer/src/components/SwarmBoard.tsx'],
        evidenceNotes: ['Observed changes not declared by builder.'],
        updatedAt: 456
      }
    },
    execution: {
      role: AgentRole.BUILDER,
      reviewRequired: true
    },
    priority: SwarmTaskPriority.MEDIUM,
    estimatedMinutes: 15
  };
}

describe('swarm prompt builders', () => {
  it('includes active roster and shared context in the coordinator prompt', () => {
    const prompt = buildCoordinatorPrompt(
      'Ship a better swarm',
      sharedContext.codebaseStructure,
      [
        { agentId: 'coordinator-1', role: 'coordinator', cliProvider: 'codex', specialization: 'Delivery control' },
        { agentId: 'reviewer-1', role: 'reviewer', cliProvider: 'claude', reviewStrictness: 'critical' }
      ],
      sharedContext,
      'Prefer low-risk decomposition.'
    );

    expect(prompt).toContain('ACTIVE AGENT ROSTER');
    expect(prompt).toContain('reviewer-1');
    expect(prompt).toContain('SCOUT FINDINGS');
    expect(prompt).toContain('Prefer low-risk decomposition.');
    expect(prompt).toContain('[GREENFIELD WEBSITE EXAMPLE]');
    expect(prompt).toContain('DO NOT OUTPUT REPORTS, SUMMARIES');
  });

  it('includes personality, specialization, and scout findings in builder/reviewer prompts', () => {
    const task = makeTask();

    const builderPrompt = buildBuilderPrompt(task, sharedContext, {
      personaLabel: 'Frontend Builder',
      personality: 'Fast, precise, and skeptical of regressions.',
      specialization: 'Prompt systems',
      reviewStrictness: 'critical'
    });

    const reviewerPrompt = buildReviewerPrompt(task, task.context.acceptanceCriteria, sharedContext, {
      personality: 'Independent and demanding.',
      reviewStrictness: 'critical',
      promptOverride: 'Reject vague evidence.'
    });

    expect(builderPrompt).toContain('FRONTEND BUILDER');
    expect(builderPrompt).toContain('SCOUT FINDINGS');
    expect(builderPrompt).toContain('CRITICAL');
    expect(builderPrompt).toContain('FILES_MODIFIED');
    expect(reviewerPrompt).toContain('Independent and demanding.');
    expect(reviewerPrompt).toContain('SCOUT FINDINGS');
    expect(reviewerPrompt).toContain('COMPLETION EVIDENCE');
    expect(reviewerPrompt).toContain('OBSERVED FILES_MODIFIED');
    expect(reviewerPrompt).toContain('OWNERSHIP VIOLATIONS');
    expect(reviewerPrompt).toContain('Reject vague evidence.');
  });

  it('constrains scout exploration to text/code files and forbids binary dumps', () => {
    const prompt = buildScoutPrompt('C:\\repo');

    expect(prompt).toContain('[OPERATING BOUNDARIES]');
    expect(prompt).toContain('NEVER READ OR PRINT BINARY FILE CONTENT');
    expect(prompt).toContain('.DOCX .DOC .PDF .PNG .JPG .JPEG .GIF .WEBP .ICO .ZIP .7Z .RAR .EXE .DLL .BIN');
    expect(prompt).toContain('IF THE PROJECT ROOT LOOKS WRONG OR SOURCE FILES ARE MISSING');
    expect(prompt).toContain('NEVER PASTE RAW FILE BYTES, ARCHIVE CONTENTS, OR BINARY GIBBERISH');
  });

  it('builds a dedicated scout work prompt for coordinator-assigned scout tasks', () => {
    const task = {
      ...makeTask(),
      execution: {
        role: AgentRole.SCOUT,
        reviewRequired: false
      }
    };

    const prompt = buildScoutWorkPrompt(task, sharedContext, {
      personaLabel: 'Intel Scout',
      personality: 'Evidence first.',
      specialization: 'Repository mapping'
    });

    expect(prompt).toContain('YOU ARE THE QUANSWARM SCOUT');
    expect(prompt).toContain('COMPLETE THE FOLLOWING SCOUT TASK');
    expect(prompt).toContain('TASK: TASK-001');
    expect(prompt).toContain('MARK_DONE: TASK-001');
    expect(prompt).not.toContain('FILES_MODIFIED');
  });
});
