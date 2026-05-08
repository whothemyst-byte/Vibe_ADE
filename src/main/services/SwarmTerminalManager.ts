import { EventEmitter } from 'node:events';
import { parseScoutReport, type ScoutAnalysis } from '@main/prompts/ScoutPrompt';
import { AgentProcess, type AgentProcessConfig, type AgentProcessStatus, type AgentRoleName, type CliProvider } from '@main/services/AgentProcess';
import { parseAgentOutput } from '@main/services/MessageParser';
import { MessageRouter, type AgentMessenger } from '@main/services/MessageRouter';
import { SwarmOrchestrator } from '@main/services/SwarmOrchestrator';
import type { SwarmMailboxEntry, SwarmTaskArtifact, SwarmTaskEvidence } from '@main/types/SwarmOrchestration';
import type { SwarmReviewStrictness } from '@shared/ipc';

export type SwarmTerminalAgentConfig = Readonly<{
  swarmId: string;
  agentId: string;
  role: AgentRoleName;
  cliProvider: CliProvider;
  workspaceDir: string;
  initialContext: string;
  startupDelay?: number;
  personaLabel?: string;
  personality?: string;
  specialization?: string;
  promptOverride?: string;
  reviewStrictness?: SwarmReviewStrictness;
}>;

type AgentPromptProfile = Readonly<{
  personaLabel?: string;
  personality?: string;
  specialization?: string;
  promptOverride?: string;
  reviewStrictness?: SwarmReviewStrictness;
}>;

type SwarmTerminalManagerOptions = Readonly<{
  resolveTaskCompletionEvidence?: (input: {
    swarmId: string;
    taskId: string;
    agentId: string;
    summary: string;
    reportedFilesModified: readonly string[];
  }) => Promise<SwarmTaskEvidence | null>;
  postMailboxMessage?: (
    swarmId: string,
    entry: Omit<SwarmMailboxEntry, 'id' | 'createdAt'> & Partial<Pick<SwarmMailboxEntry, 'id' | 'createdAt'>>
  ) => SwarmMailboxEntry;
  addTaskArtifact?: (
    swarmId: string,
    taskId: string,
    artifact: Omit<SwarmTaskArtifact, 'id' | 'taskId' | 'createdAt'> & Partial<Pick<SwarmTaskArtifact, 'id' | 'createdAt'>>
  ) => SwarmTaskArtifact;
}>;

export type SwarmTerminalEvents = {
  'agent-started': { swarmId: string; agentId: string; role: AgentRoleName; timestamp: number };
  'agent-ready': { swarmId: string; agentId: string; role: AgentRoleName; timestamp: number };
  'agent-stopped': { swarmId: string; agentId: string; timestamp: number };
  'agent-crashed': { swarmId: string; agentId: string; exitCode: number; timestamp: number };
  'agent-activity': { swarmId: string; agentId: string; lastActivity: number };
  'agent-output': { swarmId: string; agentId: string; role: AgentRoleName; data: string; timestamp: number };
};

/**
 * Manages isolated PTY sessions for all swarm agents.
 *
 * Responsibilities:
 * - Start/stop agent processes (one PTY per agent)
 * - Inject startup context
 * - Capture and sanitize output
 * - Parse output into structured messages
 * - Route messages into orchestrator/other agents
 * - Emit UI-friendly lifecycle events
 */
export class SwarmTerminalManager implements AgentMessenger {
  private readonly orchestrator: SwarmOrchestrator;
  private readonly agents: Map<string, AgentProcess> = new Map();
  private readonly agentToSwarm: Map<string, string> = new Map();
  private readonly messageRouter: MessageRouter;
  private readonly eventEmitter: EventEmitter;
  private readonly options: SwarmTerminalManagerOptions;
  private readonly agentProfiles: Map<string, AgentPromptProfile> = new Map();
  private readonly integratedScoutAgents: Set<string> = new Set();

  // Bounded per-agent output history for UI "terminal view".
  private readonly outputHistory: Map<string, string[]> = new Map();
  private readonly maxOutputLines = 2_000;

  constructor(orchestrator: SwarmOrchestrator, eventEmitter?: EventEmitter, options: SwarmTerminalManagerOptions = {}) {
    this.orchestrator = orchestrator;
    this.eventEmitter = eventEmitter ?? new EventEmitter();
    this.options = options;
    this.messageRouter = new MessageRouter(orchestrator, this, this.eventEmitter, {
      resolveAgentProfile: (_swarmId, agentId) => this.agentProfiles.get(agentId) ?? null,
      resolveSharedContext: (swarmId) => {
        try {
          return this.orchestrator.getSwarmState(swarmId).sharedContext;
        } catch {
          return null;
        }
      },
      resolveTaskCompletionEvidence: this.options.resolveTaskCompletionEvidence
    });
  }

  public on<EventName extends keyof SwarmTerminalEvents>(
    event: EventName,
    listener: (payload: SwarmTerminalEvents[EventName]) => void
  ): () => void {
    this.eventEmitter.on(event, listener);
    return () => this.eventEmitter.off(event, listener);
  }

  /**
   * Start an agent in an isolated PTY session.
   */
  public async startAgent(config: SwarmTerminalAgentConfig): Promise<void> {
    if (this.agents.has(config.agentId)) {
      throw new Error(`Agent "${config.agentId}" is already running.`);
    }

    const processConfig: AgentProcessConfig = {
      agentId: config.agentId,
      role: config.role,
      cliProvider: config.cliProvider,
      workspaceDir: config.workspaceDir,
      initialContext: config.initialContext,
      startupDelay: config.startupDelay ?? 900
    };

    const agent = new AgentProcess(processConfig);
    this.agents.set(config.agentId, agent);
    this.agentToSwarm.set(config.agentId, config.swarmId);
    this.agentProfiles.set(config.agentId, {
      personaLabel: config.personaLabel,
      personality: config.personality,
      specialization: config.specialization,
      promptOverride: config.promptOverride,
      reviewStrictness: config.reviewStrictness
    });

    console.log(`[${new Date().toISOString()}] [AGENT:START] ${config.agentId} starting...`);
    this.eventEmitter.emit('agent-started', { swarmId: config.swarmId, agentId: config.agentId, role: config.role, timestamp: Date.now() } satisfies SwarmTerminalEvents['agent-started']);

    agent.on('ready', () => {
      this.eventEmitter.emit('agent-ready', { swarmId: config.swarmId, agentId: config.agentId, role: config.role, timestamp: Date.now() } satisfies SwarmTerminalEvents['agent-ready']);
    });

    agent.on('exit', (payload) => {
      console.warn(`[${new Date().toISOString()}] [AGENT:CRASH] ${payload.agentId} exited with code ${payload.exitCode}`);
      this.eventEmitter.emit('agent-crashed', { swarmId: config.swarmId, agentId: payload.agentId, exitCode: payload.exitCode, timestamp: payload.timestamp } satisfies SwarmTerminalEvents['agent-crashed']);
      // Best-effort cleanup.
      this.agents.delete(payload.agentId);
      this.agentToSwarm.delete(payload.agentId);
      this.agentProfiles.delete(payload.agentId);
      this.integratedScoutAgents.delete(payload.agentId);
    });

    this.setupOutputCapture(config.agentId, agent);
    this.setupExecCompleteCapture(config.agentId, agent);

    try {
      await agent.startProcess();
    } catch (error) {
      // Cleanup if startup fails so future retries can proceed.
      this.agents.delete(config.agentId);
      this.agentToSwarm.delete(config.agentId);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${new Date().toISOString()}] [AGENT:START] ${config.agentId} failed: ${message}`);
      throw error;
    }
  }

  private setupOutputCapture(agentId: string, agent: AgentProcess): void {
    agent.captureOutput((data) => {
      const swarmId = this.agentToSwarm.get(agentId);
      if (!swarmId) {
        return;
      }

      // Store output history (bounded) for UI terminal view.
      const lines = data.split('\n').map((l) => l.trimEnd()).filter(Boolean);
      if (lines.length > 0) {
        const prev = this.outputHistory.get(agentId) ?? [];
        const next = [...prev, ...lines].slice(-this.maxOutputLines);
        this.outputHistory.set(agentId, next);
      }

      // Emit raw-ish output for UI consumers (best-effort; not guaranteed ordered across agents).
      this.eventEmitter.emit('agent-output', {
        swarmId,
        agentId,
        role: agent.getRole(),
        data,
        timestamp: Date.now()
      } satisfies SwarmTerminalEvents['agent-output']);

      // Log raw output (trimmed) for debugging.
      this.logDebug(`[OUTPUT:${agentId}]`, data.slice(0, 200));

      // Parse output into messages (role-filtered).
      // For Codex, parsing is performed on the exec-complete event (full block), to avoid partial matches.
      if (agent.getCliProvider() !== 'codex') {
        const messages = parseAgentOutput(agentId, data, agent.getRole());
        if (messages.length > 0) {
          this.logDebug(`[AGENT:MESSAGE:${agentId}]`, `count=${messages.length}`);
          this.messageRouter.routeMessages(messages, swarmId);
        }
      }

      if (agent.getRole() === 'scout') {
        this.tryIntegrateScoutAnalysis(agentId);
      }

      // Emit activity for UI.
      this.eventEmitter.emit('agent-activity', { swarmId, agentId, lastActivity: Date.now() } satisfies SwarmTerminalEvents['agent-activity']);
    });
  }

  private setupExecCompleteCapture(agentId: string, agent: AgentProcess): void {
    agent.on('exec-complete', (payload) => {
      const swarmId = this.agentToSwarm.get(agentId);
      if (!swarmId) {
        return;
      }
      const text = payload.data?.trim();
      if (!text) {
        return;
      }

      const messages = parseAgentOutput(agentId, text, agent.getRole());
      if (messages.length > 0) {
        this.logDebug(`[AGENT:MESSAGE:${agentId}]`, `count=${messages.length} (exec-complete seq=${payload.seq})`);
        this.messageRouter.routeMessages(messages, swarmId);
      }

      if (agent.getRole() === 'scout') {
        this.tryIntegrateScoutAnalysis(agentId, text);
      }
    });
  }

  /**
   * Send a message to an agent PTY session.
   *
   * This method satisfies {@link AgentMessenger} for use by {@link MessageRouter}.
   */
  public sendToAgent(agentId: string, message: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" is not running.`);
    }
    agent.sendMessage(message);
  }

  /**
   * Send a message to multiple agents.
   */
  public broadcastToAgents(agentIds: string[], message: string, excludeRole?: AgentRoleName): void {
    for (const agentId of agentIds) {
      const agent = this.agents.get(agentId);
      if (!agent) continue;
      if (excludeRole && agent.getRole() === excludeRole) continue;
      agent.sendMessage(message);
    }
    console.log(`[${new Date().toISOString()}] [AGENT:BROADCAST] sent to ${agentIds.length} agent(s) excludeRole=${excludeRole ?? 'none'}`);
  }

  public getAgentStatus(agentId: string): AgentProcessStatus {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found.`);
    }
    return agent.getStatus();
  }

  public getAllAgentStatus(): AgentProcessStatus[] {
    return Array.from(this.agents.values()).map((agent) => agent.getStatus());
  }

  public hasAgent(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  public async stopAgent(agentId: string): Promise<void> {
    const swarmId = this.agentToSwarm.get(agentId) ?? 'unknown';
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }
    await agent.terminate();
    this.agents.delete(agentId);
    this.agentToSwarm.delete(agentId);
    this.agentProfiles.delete(agentId);
    this.integratedScoutAgents.delete(agentId);
    this.outputHistory.delete(agentId);
    this.eventEmitter.emit('agent-stopped', { swarmId, agentId, timestamp: Date.now() } satisfies SwarmTerminalEvents['agent-stopped']);
  }

  public async stopAllAgents(): Promise<void> {
    const ids = Array.from(this.agents.keys());
    await Promise.all(ids.map((id) => this.stopAgent(id)));
    this.agents.clear();
    this.agentToSwarm.clear();
  }

  private logDebug(prefix: string, message: string): void {
    // Keep debug logs concise.
    console.log(`[${new Date().toISOString()}] ${prefix} ${message}`);
  }

  /**
   * Get a bounded snapshot of recent output lines for an agent.
   */
  public getAgentOutput(agentId: string, maxLines = 400): string[] {
    const n = Math.max(0, Math.min(maxLines, this.maxOutputLines));
    const lines = this.outputHistory.get(agentId) ?? [];
    return lines.slice(-n);
  }

  private tryIntegrateScoutAnalysis(agentId: string, candidateText?: string): void {
    if (this.integratedScoutAgents.has(agentId)) {
      return;
    }

    const swarmId = this.agentToSwarm.get(agentId);
    if (!swarmId) {
      return;
    }

    const text = candidateText?.trim() || this.getAgentOutput(agentId, this.maxOutputLines).join('\n').trim();
    if (!text.includes('## KEY FILES') || !text.includes('## COMMON PATTERNS')) {
      return;
    }

    try {
      const analysis = parseScoutReport(text);
      const now = Date.now();
      this.orchestrator.addCoordinatorContext(swarmId, {
        conventions: formatScoutConventions(analysis),
        patterns: formatScoutPatterns(analysis),
        security: formatScoutSecurity(analysis),
        testing: formatScoutTesting(analysis),
        scoutFindings: formatScoutFindings(analysis),
        scoutUpdatedAt: now
      });
      this.integratedScoutAgents.add(agentId);
      this.notifyCoordinatorOfScoutAnalysis(swarmId, agentId, analysis);
      this.logDebug(`[SCOUT:CONTEXT:${agentId}]`, 'integrated structured scout report into shared context');
    } catch {
      // Scout output may still be streaming; ignore until a complete report is available.
    }
  }

  private notifyCoordinatorOfScoutAnalysis(swarmId: string, scoutAgentId: string, analysis: ScoutAnalysis): void {
    const state = this.orchestrator.getSwarmState(swarmId);
    const coordinator = Array.from(state.agents.values()).find((agent) => agent.role === 'coordinator');
    if (!coordinator) {
      return;
    }

    const summary = [
      '[SCOUT CONTEXT UPDATED]',
      `Scout: ${scoutAgentId}`,
      `Key files: ${analysis.keyFiles.slice(0, 5).map((item) => item.file).join(', ') || 'none'}`,
      `Patterns: ${analysis.commonPatterns.slice(0, 4).map((item) => item.name).join(', ') || 'none'}`,
      `Risks: ${analysis.risks.slice(0, 3).join(' | ') || 'none'}`,
      'Use this context for future decomposition, blocker handling, and task refinement.'
    ].join('\r\n');

    try {
      this.sendToAgent(coordinator.agentId, `${summary}\r\n`);
    } catch {
      // Best-effort only.
    }
  }
}

function formatScoutConventions(analysis: ScoutAnalysis): string {
  const naming = analysis.namingConventions;
  const keyFiles = analysis.keyFiles.slice(0, 6).map((item) => `${item.file}: ${item.purpose}`);
  return [
    `Functions: ${naming.functions}`,
    `Classes: ${naming.classes}`,
    `Files: ${naming.files}`,
    keyFiles.length > 0 ? `Key files: ${keyFiles.join(' | ')}` : null
  ].filter(Boolean).join('\n');
}

function formatScoutPatterns(analysis: ScoutAnalysis): string {
  const patterns = analysis.commonPatterns.map((item) => `${item.name}: ${item.description}`);
  const utilities = analysis.existingUtilities.slice(0, 8).map((item) => `${item.name}: ${item.description}`);
  return [
    patterns.length > 0 ? patterns.join('\n') : null,
    utilities.length > 0 ? `Utilities: ${utilities.join(' | ')}` : null
  ].filter(Boolean).join('\n');
}

function formatScoutSecurity(analysis: ScoutAnalysis): string {
  const practices = analysis.securityPractices.join(' | ');
  const risks = analysis.risks.slice(0, 5).join(' | ');
  return [
    practices || null,
    risks ? `Watch-outs: ${risks}` : null
  ].filter(Boolean).join('\n');
}

function formatScoutTesting(analysis: ScoutAnalysis): string {
  const testingSignals = analysis.keyFiles
    .filter((item) => /test|spec|vitest|jest|playwright/i.test(item.file) || /test/i.test(item.purpose))
    .slice(0, 6)
    .map((item) => item.file);

  if (testingSignals.length === 0) {
    return 'Follow existing automated tests when present and add coverage for changed critical logic.';
  }

  return `Existing test signals: ${testingSignals.join(', ')}`;
}

function formatScoutFindings(analysis: ScoutAnalysis): string {
  return [
    analysis.keyFiles.slice(0, 8).map((item) => `${item.file}: ${item.purpose}`).join(' | '),
    analysis.commonPatterns.slice(0, 6).map((item) => `${item.name}: ${item.description}`).join(' | '),
    analysis.risks.slice(0, 5).join(' | ')
  ].filter(Boolean).join('\n');
}
