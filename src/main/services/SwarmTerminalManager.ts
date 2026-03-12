import { EventEmitter } from 'node:events';
import { AgentProcess, type AgentProcessConfig, type AgentProcessStatus, type AgentRoleName, type CliProvider } from '@main/services/AgentProcess';
import { parseAgentOutput } from '@main/services/MessageParser';
import { MessageRouter, type AgentMessenger } from '@main/services/MessageRouter';
import { SwarmOrchestrator } from '@main/services/SwarmOrchestrator';

export type SwarmTerminalAgentConfig = Readonly<{
  swarmId: string;
  agentId: string;
  role: AgentRoleName;
  cliProvider: CliProvider;
  workspaceDir: string;
  initialContext: string;
  startupDelay?: number;
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
  private readonly agents: Map<string, AgentProcess> = new Map();
  private readonly agentToSwarm: Map<string, string> = new Map();
  private readonly messageRouter: MessageRouter;
  private readonly eventEmitter: EventEmitter;

  // Bounded per-agent output history for UI "terminal view".
  private readonly outputHistory: Map<string, string[]> = new Map();
  private readonly maxOutputLines = 2_000;

  constructor(orchestrator: SwarmOrchestrator, eventEmitter?: EventEmitter) {
    this.eventEmitter = eventEmitter ?? new EventEmitter();
    this.messageRouter = new MessageRouter(orchestrator, this, this.eventEmitter);
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

  public async stopAgent(agentId: string): Promise<void> {
    const swarmId = this.agentToSwarm.get(agentId) ?? 'unknown';
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }
    await agent.terminate();
    this.agents.delete(agentId);
    this.agentToSwarm.delete(agentId);
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
}
