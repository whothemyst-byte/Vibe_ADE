import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { UiIcon } from './UiIcon';
import { SwarmAgentTerminalView } from './SwarmTerminalView';

// --- Types ---

type SwarmTaskStatus = 'QUEUED' | 'ASSIGNED' | 'BUILDING' | 'REVIEWING' | 'DONE' | 'BLOCKED';
type SwarmTaskPriority = 'low' | 'medium' | 'high';
type AgentRole = 'coordinator' | 'builder' | 'scout' | 'reviewer';
type AgentRuntimeStatus = 'IDLE' | 'THINKING' | 'ACTIVE' | 'BLOCKED' | 'WAITING' | 'OFFLINE';

export interface SwarmBoardProps {
  swarmId: string;
  onSwarmComplete?: () => void;
}

export interface SwarmTask {
  id: string;
  title: string;
  description: string;
  status: SwarmTaskStatus;
  priority: SwarmTaskPriority;
  estimatedMinutes: number;
  blockedBy?: string[];
  fileOwnership: {
    ownedBy: string;
    files: Set<string> | string[];
    dependencies: string[];
  };
  context: {
    goal: string;
    requirements: string[];
    acceptanceCriteria: string[];
    codePatterns: string;
    constraints: string[];
  };
  tracking: {
    assignedAgent: string;
    assignedAt: number;
    completedAt?: number;
    reviewedBy?: string;
    feedback?: string;
  };
}

export interface AgentState {
  agentId: string;
  role: AgentRole;
  status: AgentRuntimeStatus;
  currentTask?: string;
  assignedTasks: string[];
  lastActivity: number;
  lastMessage?: string;
  blockReason?: string;
  responseTime: number;
}

export interface SwarmState {
  swarmId: string;
  overallGoal: string;
  createdAt: number;
  tasks: Map<string, SwarmTask> | Record<string, SwarmTask> | SwarmTask[];
  agents: Map<string, AgentState> | Record<string, AgentState> | AgentState[];
}

type TranscriptEventType =
  | 'swarm-started'
  | 'tasks-decomposed'
  | 'task-started'
  | 'task-completed'
  | 'review-started'
  | 'review-approved'
  | 'review-rejected'
  | 'agent-ready'
  | 'agent-stopped'
  | 'agent-blocked'
  | 'error';

export interface TranscriptEvent {
  id: string;
  timestamp: number;
  type: TranscriptEventType;
  message: string;
  meta?: Record<string, string>;
}

// --- Styles & Tokens ---

const SWARM_STYLES = `
  :root {
    --swarm-bg: #0f172a;
    --swarm-glass: rgba(15, 23, 42, 0.7);
    --swarm-border: rgba(148, 163, 184, 0.1);
    --swarm-border-light: rgba(148, 163, 184, 0.25);
    
    --st-idle: #94a3b8;
    --st-active: #38bdf8;
    --st-thinking: #facc15;
    --st-blocked: #f87171;
    --st-success: #4ade80;
    
    --node-w: 280px;
    --node-h: 110px;
  }

  .swarm-shell {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr;
    background: radial-gradient(circle at 50% 0%, #1e293b 0%, #0f172a 60%);
    color: #f1f5f9;
    font-family: 'Inter', system-ui, sans-serif;
    overflow: hidden;
  }

  /* Header */
  .swarm-header {
    padding: 12px 20px;
    background: rgba(15, 23, 42, 0.6);
    border-bottom: 1px solid var(--swarm-border);
    backdrop-filter: blur(12px);
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 10;
  }
  
  .header-actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .btn-header {
    background: rgba(255,255,255,0.05);
    border: 1px solid var(--swarm-border);
    color: #cbd5e1;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .btn-header:hover {
    background: rgba(255,255,255,0.1);
    border-color: var(--swarm-border-light);
    color: #fff;
  }
  .btn-header.danger:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
    color: #fca5a5;
  }

  .progress-track {
    width: 200px;
    height: 6px;
    background: rgba(255,255,255,0.1);
    border-radius: 99px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--st-active);
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Main Stage */
  .swarm-stage {
    display: grid;
    grid-template-columns: 1fr 320px;
    overflow: hidden;
    position: relative;
  }
  
  .swarm-stage.full-width {
    grid-template-columns: 1fr;
  }
  
  /* Graph Viewport (Pan/Zoom Container) */
  .graph-viewport {
    width: 100%;
    height: 100%;
    overflow: hidden;
    cursor: grab;
    position: relative;
    background-color: #0f172a;
  }
  
  .graph-viewport:active {
    cursor: grabbing;
  }

  .graph-canvas {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    will-change: transform;
    
    /* Infinite grid pattern */
    background-image: 
      linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    width: 4000px;
    height: 4000px;
  }

  /* Nodes */
  .agent-node {
    position: absolute;
    width: var(--node-w);
    height: var(--node-h);
    background: rgba(30, 41, 59, 0.6);
    backdrop-filter: blur(8px);
    border: 1px solid var(--swarm-border);
    border-radius: 12px;
    padding: 12px;
    transition: box-shadow 0.3s ease, border-color 0.3s ease;
    box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
    cursor: pointer;
    z-index: 5;
  }

  .agent-node:hover {
    border-color: var(--swarm-border-light);
    background: rgba(30, 41, 59, 0.8);
  }

  .agent-node.active {
    border-color: var(--st-active);
    box-shadow: 0 0 20px rgba(56, 189, 248, 0.15);
  }
  
  .agent-node.thinking {
    border-color: var(--st-thinking);
  }

  .agent-node.blocked {
    border-color: var(--st-blocked);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--st-idle);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.3);
  }
  .status-dot.active { background: var(--st-active); box-shadow: 0 0 8px var(--st-active); }
  .status-dot.thinking { background: var(--st-thinking); animation: pulse 1.5s infinite; }
  .status-dot.blocked { background: var(--st-blocked); }

  /* Feed */
  .activity-feed {
    border-left: 1px solid var(--swarm-border);
    background: rgba(15, 23, 42, 0.4);
    display: flex;
    flex-direction: column;
    min-height: 0;
    z-index: 30; /* Above canvas */
  }

  .feed-item {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    font-size: 13px;
    color: #cbd5e1;
    display: flex;
    gap: 10px;
    align-items: baseline;
    animation: slideIn 0.2s ease-out;
  }

  /* Inspector Slide-over */
  .inspector-panel {
    position: absolute;
    top: 12px;
    right: 12px;
    bottom: 12px;
    width: 380px;
    background: #1e293b;
    border: 1px solid var(--swarm-border-light);
    border-radius: 16px;
    box-shadow: -10px 0 40px rgba(0,0,0,0.5);
    z-index: 50;
    display: flex;
    flex-direction: column;
    transform: translateX(110%);
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
  }

  .inspector-panel.open {
    transform: translateX(0);
  }

  /* Animated Connections */
  .conn-line {
    fill: none;
    stroke: var(--swarm-border);
    stroke-width: 2;
    transition: stroke 0.3s;
    stroke-dasharray: 8 8;
    stroke-linecap: round;
    opacity: 0.4;
  }
  
  .conn-line.active {
    stroke: var(--st-active);
    stroke-opacity: 0.8;
    opacity: 1;
    stroke-dasharray: 12 6;
    animation: flow 1.5s linear infinite;
    filter: drop-shadow(0 0 4px var(--st-active));
  }

  /* Zoom Controls */
  .zoom-controls {
    position: absolute;
    bottom: 20px;
    left: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 20;
  }
  
  .zoom-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid var(--swarm-border-light);
    color: #fff;
    display: grid;
    place-items: center;
    cursor: pointer;
    backdrop-filter: blur(4px);
    font-size: 16px;
    font-weight: bold;
    transition: all 0.1s;
  }
  
  .zoom-btn:hover {
    background: rgba(59, 130, 246, 0.2);
    border-color: var(--st-active);
    transform: scale(1.05);
  }

  /* Animations */
  @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes flow { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
`;

// --- Helper Functions ---

function toTaskMap(input: SwarmState['tasks']): Map<string, SwarmTask> {
  if (input instanceof Map) return new Map(input);
  if (Array.isArray(input)) return new Map(input.map((t) => [t.id, t]));
  return new Map(Object.entries(input).map(([id, t]) => [id, t]));
}

function toAgentMap(input: SwarmState['agents']): Map<string, AgentState> {
  if (input instanceof Map) return new Map(input);
  if (Array.isArray(input)) return new Map(input.map((a) => [a.agentId, a]));
  return new Map(Object.entries(input).map(([id, a]) => [id, a]));
}

function formatTime(ms: number) {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function normalizeFiles(files: Set<string> | string[]): string[] {
  if (Array.isArray(files)) return files;
  return Array.from(files);
}

// --- Components ---

export function SwarmBoard(props: SwarmBoardProps): JSX.Element {
  const { swarmId, onSwarmComplete } = props;
  const closeSwarmSession = useWorkspaceStore((s) => s.closeSwarmSession);

  // -- State --
  const [viewMode, setViewMode] = useState<'dashboard' | 'terminals'>('dashboard');
  const [swarmState, setSwarmState] = useState<SwarmState | null>(null);
  const [agents, setAgents] = useState<Map<string, AgentState>>(new Map());
  const [events, setEvents] = useState<TranscriptEvent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentOutput, setAgentOutput] = useState<Map<string, string>>(new Map());

  // -- Event Logic --
  const pendingEvents = useRef<TranscriptEvent[]>([]);
  const flushTimer = useRef<number | null>(null);

  const flushEvents = useCallback(() => {
    if (pendingEvents.current.length === 0) return;
    const batch = pendingEvents.current;
    pendingEvents.current = [];
    setEvents((prev) => [...batch.reverse(), ...prev].slice(0, 100)); // Keep last 100
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Initial fetch
    void (async () => {
      try {
        const state = (await window.vibeAde.swarm.state(swarmId)) as SwarmState | null;
        if (!cancelled && state) setSwarmState(state);
      } catch (e) { /* ignore */ }
    })();

    const onSwarmUpdate = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.swarmId === swarmId && d.state) setSwarmState(d.state);
    };

    const onAgentStatus = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.swarmId === swarmId && d.agent) {
        setAgents(prev => new Map(prev).set(d.agent.agentId, d.agent));
      }
    };

    const onEvent = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.swarmId === swarmId && d.event) {
        pendingEvents.current.push(d.event);
        if (!flushTimer.current) {
          flushTimer.current = window.setTimeout(() => {
            flushTimer.current = null;
            flushEvents();
          }, 100);
        }
      }
    };

    const onOutput = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.swarmId === swarmId && d.agentId && d.data) {
        const line = d.data.trim().split('\n').pop() || '';
        if (line) {
          setAgentOutput(prev => new Map(prev).set(d.agentId, line));
        }
      }
    };

    window.addEventListener('vibe:swarm-update', onSwarmUpdate);
    window.addEventListener('vibe:agent-status', onAgentStatus);
    window.addEventListener('vibe:swarm-event', onEvent);
    window.addEventListener('vibe:swarm-agent-output', onOutput);

    return () => {
      cancelled = true;
      window.removeEventListener('vibe:swarm-update', onSwarmUpdate);
      window.removeEventListener('vibe:agent-status', onAgentStatus);
      window.removeEventListener('vibe:swarm-event', onEvent);
      window.removeEventListener('vibe:swarm-agent-output', onOutput);
    };
  }, [swarmId, flushEvents]);

  // -- Computed Data --
  const normalizedTasks = useMemo(() => swarmState ? toTaskMap(swarmState.tasks) : new Map<string, SwarmTask>(), [swarmState]);
  
  const finalAgents = useMemo(() => {
    const base = swarmState ? toAgentMap(swarmState.agents) : new Map<string, AgentState>();
    // Merge live updates
    for (const [id, a] of agents) base.set(id, a);
    return base;
  }, [swarmState, agents]);

  const stats = useMemo(() => {
    const tasks = Array.from(normalizedTasks.values());
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'DONE').length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    return { total, done, percent };
  }, [normalizedTasks]);

  // Auto-complete
  useEffect(() => {
    if (onSwarmComplete && stats.total > 0 && stats.done === stats.total) {
      onSwarmComplete();
    }
  }, [stats, onSwarmComplete]);

  const selectedAgent = selectedAgentId ? finalAgents.get(selectedAgentId) : null;
  const ownedFiles = useMemo(() => {
    if (!selectedAgent) return [];
    // Scan tasks for files owned by this agent
    const files: string[] = [];
    for (const t of normalizedTasks.values()) {
      if (t.fileOwnership.ownedBy === selectedAgent.agentId) {
        files.push(...normalizeFiles(t.fileOwnership.files));
      }
    }
    return files;
  }, [selectedAgent, normalizedTasks]);

  // -- Pan/Zoom State --
  // Initial center: Canvas is 4000x4000, content at 2000x2000. 
  // Viewport approx 1000x800. Offset = (View/2) - 2000 = 500 - 2000 = -1500.
  const [transform, setTransform] = useState({ x: -1500, y: -1600, scale: 1 });
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.agent-node, .zoom-controls')) return;
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  return (
    <>
      <style>{SWARM_STYLES}</style>
      <div className="swarm-shell">
        {/* Header */}
        <header className="swarm-header">
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', opacity: 0.6, textTransform: 'uppercase' }}>Current Mission</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{swarmState?.overallGoal || 'Initializing...'}</div>
          </div>
          
          <div className="header-actions">
            <div style={{ textAlign: 'right', marginRight: 16 }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                {stats.done} / {stats.total} Tasks Complete
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${stats.percent}%` }} />
              </div>
            </div>

            <button 
              className="btn-header"
              onClick={() => setViewMode(m => m === 'dashboard' ? 'terminals' : 'dashboard')}
            >
              <UiIcon name={viewMode === 'dashboard' ? 'layout' : 'board'} className="ui-icon-sm" />
              {viewMode === 'dashboard' ? 'Terminals' : 'Dashboard'}
            </button>

            <button 
              className="btn-header danger"
              onClick={() => void closeSwarmSession(swarmId)}
            >
              <UiIcon name="stop" className="ui-icon-sm" />
              Stop
            </button>
          </div>
        </header>

        {/* Main Stage */}
        {viewMode === 'dashboard' ? (
          <div className="swarm-stage">
            {/* Interactive Canvas */}
            <div 
              className="graph-viewport"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div 
                className="graph-canvas"
                style={{ 
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` 
                }}
              >
                <AgentGraphContent 
                  agents={finalAgents} 
                  output={agentOutput}
                  onSelect={setSelectedAgentId}
                  selectedId={selectedAgentId}
                />
              </div>

              <div className="zoom-controls">
                <button className="zoom-btn" onClick={() => setTransform(t => ({...t, scale: Math.min(2, t.scale + 0.1)}))} title="Zoom In">
                  <UiIcon name="plus" className="ui-icon-sm" />
                </button>
                <button className="zoom-btn" onClick={() => setTransform(t => ({...t, scale: Math.max(0.5, t.scale - 0.1)}))} title="Zoom Out">
                  <UiIcon name="minus" className="ui-icon-sm" />
                </button>
                <button className="zoom-btn" onClick={() => setTransform({ x: -1500, y: -1600, scale: 1 })} title="Reset View">
                  <UiIcon name="refresh" className="ui-icon-sm" />
                </button>
              </div>
            </div>

            {/* Right Feed */}
            <aside className="activity-feed">
              <div style={{ padding: '14px 14px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#64748b' }}>
                ACTIVITY LOG
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {events.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', opacity: 0.4, fontSize: 12 }}>
                    Waiting for events...
                  </div>
                )}
                {events.map(ev => (
                  <div key={ev.id} className="feed-item">
                    <span style={{ opacity: 0.5, fontSize: 11, fontFamily: 'monospace' }}>{formatTime(ev.timestamp)}</span>
                    <span>{ev.message}</span>
                  </div>
                ))}
              </div>
            </aside>

            {/* Inspector Slide-over */}
            <div className={`inspector-panel ${selectedAgent ? 'open' : ''}`}>
              {selectedAgent && (
                <>
                  <div style={{ padding: 20, borderBottom: '1px solid var(--swarm-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div className={`status-dot ${selectedAgent.status.toLowerCase()}`} style={{ width: 12, height: 12 }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedAgent.agentId}</div>
                        <div style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase' }}>{selectedAgent.role}</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setSelectedAgentId(null)} 
                      style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 4 }}
                    >
                      <UiIcon name="close" className="ui-icon-sm" />
                    </button>
                  </div>
                  
                  <div style={{ padding: 20, overflow: 'auto', flex: 1, display: 'grid', gap: 24 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 8 }}>CURRENT STATUS</div>
                      <div style={{ fontSize: 14 }}>{selectedAgent.status}</div>
                      {selectedAgent.lastMessage && (
                         <div style={{ marginTop: 8, padding: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', color: 'var(--st-active)' }}>
                           {selectedAgent.lastMessage}
                         </div>
                      )}
                    </div>

                    {selectedAgent.currentTask && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 8 }}>CURRENT TASK</div>
                        <div style={{ padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 8, fontSize: 13, lineHeight: 1.4 }}>
                          {selectedAgent.currentTask}
                        </div>
                      </div>
                    )}

                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, marginBottom: 8 }}>FILE OWNERSHIP ({ownedFiles.length})</div>
                      {ownedFiles.length === 0 ? (
                        <div style={{ fontSize: 13, opacity: 0.5 }}>No files locked.</div>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 16, display: 'grid', gap: 4 }}>
                          {ownedFiles.map(f => (
                            <li key={f} style={{ fontSize: 12, fontFamily: 'monospace' }}>{f}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="swarm-stage full-width" style={{ padding: 20, background: '#0f172a', overflow: 'auto' }}>
             <SwarmAgentTerminalView swarmId={swarmId} />
          </div>
        )}
      </div>
    </>
  );
}

// --- Agent Graph Content (Inner) ---

function AgentGraphContent({ 
  agents, 
  output, 
  onSelect,
  selectedId 
}: { 
  agents: Map<string, AgentState>; 
  output: Map<string, string>;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  // Layout Logic - Center of the 4000x4000 canvas
  const layout = useMemo(() => {
    const all = Array.from(agents.values());
    const nodes: Array<{ agent: AgentState; x: number; y: number }> = [];
    
    // Canvas Center
    const CX = 2000;
    const CY = 2000;
    
    const nodeW = 280;
    const nodeH = 110;

    // Roles
    const coord = all.find(a => a.role === 'coordinator');
    const builders = all.filter(a => a.role === 'builder');
    const reviewers = all.filter(a => a.role === 'reviewer');
    const scouts = all.filter(a => a.role === 'scout');

    // Coordinator Top Center
    if (coord) {
      nodes.push({ agent: coord, x: CX - nodeW / 2, y: CY - 300 });
    }

    // Row 2: Builders (Left) & Reviewers (Right)
    const row2Y = CY - 100;
    const sideGap = 100; // Gap from center axis
    
    // Builders Left Stack
    builders.forEach((b, i) => {
      nodes.push({ agent: b, x: CX - nodeW - sideGap, y: row2Y + (i * (nodeH + 20)) });
    });

    // Reviewers Right Stack
    reviewers.forEach((r, i) => {
      nodes.push({ agent: r, x: CX + sideGap, y: row2Y + (i * (nodeH + 20)) });
    });

    // Scouts Bottom Center (below longest stack)
    const maxStack = Math.max(builders.length, reviewers.length);
    const row3Y = row2Y + maxStack * (nodeH + 20) + 100;
    
    scouts.forEach((s, i) => {
      const totalW = scouts.length * (nodeW + 20) - 20;
      const startX = CX - totalW / 2;
      nodes.push({ agent: s, x: startX + i * (nodeW + 20), y: row3Y });
    });

    // Connections
    const edges: Array<{ x1: number, y1: number, x2: number, y2: number, active: boolean }> = [];
    if (coord) {
      const cNode = nodes.find(n => n.agent.agentId === coord.agentId)!;
      const cCenter = { x: cNode.x + nodeW/2, y: cNode.y + nodeH };
      
      nodes.forEach(n => {
        if (n.agent.agentId === coord.agentId) return;
        edges.push({
          x1: cCenter.x,
          y1: cCenter.y,
          x2: n.x + nodeW/2,
          y2: n.y,
          active: n.agent.status === 'ACTIVE' || n.agent.status === 'THINKING'
        });
      });
    }

    return { nodes, edges };
  }, [agents]);

  return (
    <>
      <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }} width="100%" height="100%">
        {layout.edges.map((e, i) => {
          // Curved bezier with midpoint adjust
          const path = `M ${e.x1} ${e.y1} C ${e.x1} ${e.y1 + 100}, ${e.x2} ${e.y2 - 100}, ${e.x2} ${e.y2}`;
          return (
            <path 
              key={i} 
              d={path} 
              className={`conn-line ${e.active ? 'active' : ''}`}
            />
          );
        })}
      </svg>

      {layout.nodes.map(({ agent, x, y }) => {
        const statusClass = agent.status === 'ACTIVE' ? 'active' : agent.status === 'THINKING' ? 'thinking' : agent.status === 'BLOCKED' ? 'blocked' : '';
        const lastLine = output.get(agent.agentId);

        return (
          <div 
            key={agent.agentId}
            className={`agent-node ${statusClass} ${selectedId === agent.agentId ? 'active' : ''}`}
            style={{ left: x, top: y }}
            onMouseDown={(e) => e.stopPropagation()} /* Prevent pan drag start on node */
            onClick={(e) => { e.stopPropagation(); onSelect(agent.agentId); }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className={`status-dot ${statusClass}`} />
                <div style={{ fontWeight: 700, fontSize: 13 }}>{agent.agentId}</div>
              </div>
              <div style={{ fontSize: 10, opacity: 0.6, border: '1px solid rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: 4 }}>
                {agent.role}
              </div>
            </div>

            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {agent.currentTask ? agent.currentTask : <span style={{ opacity: 0.5 }}>Idle</span>}
            </div>

            {lastLine && (
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--st-active)', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                &gt; {lastLine}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
