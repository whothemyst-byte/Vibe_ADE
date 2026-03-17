import { useMemo, useState } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { UiIcon } from './UiIcon';

// --- Types ---
type CliProvider = 'claude' | 'codex' | 'gemini';
type AgentRole = 'coordinator' | 'builder' | 'scout' | 'reviewer';

interface AgentConfig {
  id: string;
  role: AgentRole;
  provider: CliProvider;
}

// --- Helpers ---
function defaultSwarmId(): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `swarm-${suffix}`;
}

// --- Styles (Injected) ---
const WIZARD_STYLES = `
  .swarm-wizard-overlay {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(5, 8, 12, 0.85);
    backdrop-filter: blur(8px);
    display: grid;
    place-items: center;
    animation: fadeIn 0.2s ease-out;
  }

  .swarm-wizard-card {
    width: min(800px, 94vw);
    height: min(700px, 90vh);
    background: linear-gradient(145deg, var(--bg-panel), var(--bg-panel-2));
    border: 1px solid var(--border-strong);
    border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .swarm-wizard-overlay.embedded {
    position: absolute;
    inset: 0;
    z-index: 10;
  }

  .wizard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
    background: rgba(0, 0, 0, 0.2);
    flex-shrink: 0;
  }

  .wizard-title {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--text);
  }

  .wizard-body {
    padding: 24px;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .wizard-footer {
    padding: 20px 24px;
    border-top: 1px solid var(--border);
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .step-indicator {
    display: flex;
    gap: 8px;
  }

  .step-dot {
    width: 8px;
    height: 8px;
    border-radius: 4px;
    background: var(--border-strong);
    transition: all 0.3s ease;
  }

  .step-dot.active {
    width: 24px;
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent-glow);
  }

  /* Form Elements */
  .input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
  }

  .input-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .premium-input {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 16px;
    color: var(--text);
    font-size: 14px;
    transition: all 0.2s ease;
  }

  .premium-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-glow);
    background: rgba(0, 0, 0, 0.3);
  }

  /* Roster / Agent List Styles */
  .roster-section {
    margin-bottom: 24px;
    animation: fadeIn 0.3s ease;
  }
  
  .roster-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding: 0 4px;
  }
  
  .roster-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .agent-card-grid {
    display: grid;
    gap: 8px;
  }

  .agent-row {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: all 0.2s ease;
  }
  
  .agent-row:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: var(--border-strong);
  }

  .agent-row.locked {
    background: rgba(59, 130, 246, 0.08);
    border-color: rgba(59, 130, 246, 0.2);
  }

  .agent-id {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .role-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(0,0,0,0.3);
    color: var(--text-muted);
    text-transform: uppercase;
  }

  .provider-select {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 12px;
    border-radius: 6px;
    padding: 4px 8px;
    cursor: pointer;
    min-width: 140px;
  }
  
  .provider-select:hover {
    border-color: var(--accent);
  }

  .action-btn-sm {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: all 0.1s;
  }
  
  .action-btn-sm:hover:not(:disabled) {
    background: rgba(255,255,255,0.1);
    color: var(--accent);
    border-color: var(--accent);
  }
  
  .action-btn-sm:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
`;

// --- Components ---

function RosterSection({
  title,
  role,
  agents,
  onAdd,
  onRemove,
  onUpdateProvider,
  max = 8
}: {
  title: string;
  role: AgentRole;
  agents: AgentConfig[];
  onAdd: () => void;
  onRemove: () => void;
  onUpdateProvider: (id: string, provider: CliProvider) => void;
  max?: number;
}) {
  return (
    <div className="roster-section">
      <div className="roster-header">
        <div className="roster-title">{title} ({agents.length})</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button 
            className="action-btn-sm" 
            onClick={onRemove} 
            disabled={agents.length === 0}
            title="Remove last"
          >
            <UiIcon name="minus" className="ui-icon-sm" />
          </button>
          <button 
            className="action-btn-sm" 
            onClick={onAdd} 
            disabled={agents.length >= max}
            title="Add new"
          >
            <UiIcon name="plus" className="ui-icon-sm" />
          </button>
        </div>
      </div>
      
      <div className="agent-card-grid">
        {agents.length === 0 && (
          <div style={{ padding: 12, border: '1px dashed var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            No {title.toLowerCase()} assigned.
          </div>
        )}
        {agents.map(agent => (
          <div key={agent.id} className="agent-row">
            <div className="agent-id">
              <UiIcon name="user" className="ui-icon-sm" />
              {agent.id}
            </div>
            <select 
              className="provider-select"
              value={agent.provider}
              onChange={(e) => onUpdateProvider(agent.id, e.target.value as CliProvider)}
            >
              <option value="codex">OpenAI (Codex)</option>
              <option value="claude">Anthropic (Claude)</option>
              <option value="gemini">Google (Gemini)</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SwarmDashboardDialog(props: { embedded?: boolean; onRequestClose?: () => void } = {}): JSX.Element {
  const closeDashboard = useWorkspaceStore((s) => s.closeSwarmDashboard);
  const openSwarmSession = useWorkspaceStore((s) => s.openSwarmSession);
  const appState = useWorkspaceStore((s) => s.appState);
  const close = props.onRequestClose ?? closeDashboard;

  const activeWorkspace = useMemo(() => {
    const id = appState.activeWorkspaceId;
    if (!id) return null;
    return appState.workspaces.find((w) => w.id === id) ?? null;
  }, [appState.activeWorkspaceId, appState.workspaces]);

  const [step, setStep] = useState<1 | 2>(1);
  const [swarmName, setSwarmName] = useState('');
  const [goal, setGoal] = useState('');
  const [codebaseRoot, setCodebaseRoot] = useState(activeWorkspace?.rootDir ?? 'C:\\');
  
  // -- Agent State --
  // Initialize with 1 coordinator (locked) and 1 builder by default
  const [agents, setAgents] = useState<AgentConfig[]>([
    { id: 'coordinator-1', role: 'coordinator', provider: 'codex' },
    { id: 'builder-1', role: 'builder', provider: 'codex' },
    { id: 'reviewer-1', role: 'reviewer', provider: 'claude' }
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscription = normalizeSubscriptionState(appState.subscription);
  const plan = SUBSCRIPTION_PLANS[subscription.tier];
  const maxAgents = plan.limits.concurrentAgentsPerSwarm;

  // -- Handlers --

  const getAgentsByRole = (role: AgentRole) => agents.filter(a => a.role === role);

  const handleAddAgent = (role: AgentRole) => {
    setAgents(prev => {
      if (maxAgents !== null && prev.length >= maxAgents) {
        setError(`Flux plan allows up to ${maxAgents} concurrent agents per swarm.`);
        return prev;
      }
      const existing = prev.filter(a => a.role === role);
      const nextNum = existing.length + 1;
      const id = `${role}-${nextNum}`;
      // Check if ID collision (edge case if they remove from middle, but we only remove from end)
      // Simpler: find first available ID
      let safeId = id;
      let counter = nextNum;
      while (prev.some(p => p.id === safeId)) {
        counter++;
        safeId = `${role}-${counter}`;
      }
      
      return [...prev, { id: safeId, role, provider: 'codex' }];
    });
  };

  const handleRemoveAgent = (role: AgentRole) => {
    setAgents(prev => {
      const others = prev.filter(a => a.role !== role);
      const targets = prev.filter(a => a.role === role);
      if (targets.length === 0) return prev;
      // Remove the last one
      targets.pop();
      // Coordinator check?
      if (role === 'coordinator' && targets.length === 0) {
        // Should not happen as UI blocks it, but safety:
        return prev;
      }
      return [...others, ...targets].sort((a, b) => {
        // Sort order: coord, builder, reviewer, scout
        const order = ['coordinator', 'builder', 'reviewer', 'scout'];
        return order.indexOf(a.role) - order.indexOf(b.role) || a.id.localeCompare(b.id);
      });
    });
  };

  const handleUpdateProvider = (id: string, provider: CliProvider) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, provider } : a));
  };

  const validateStep1 = () => {
    if (!swarmName.trim()) return 'Please name your swarm.';
    if (!goal.trim()) return 'A clear goal is required.';
    if (!codebaseRoot.trim()) return 'Codebase root is required.';
    return null;
  };

  const handleNext = () => {
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep(2);
  };

  const startSwarm = async () => {
    setLoading(true);
    setError(null);
    try {
      const normalizedSub = normalizeSubscriptionState(appState.subscription);
      const plan = SUBSCRIPTION_PLANS[normalizedSub.tier];
      if (!plan.features.swarms) {
        throw new Error('QuanSwarm is available on Flux and Forge plans.');
      }
      const swarmLimit = plan.limits.swarmRunsPerMonth;
      if (swarmLimit !== null && normalizedSub.usage.swarmsStarted >= swarmLimit) {
        throw new Error(`Flux plan limit reached (${swarmLimit} swarms/month). Upgrade to Forge for unlimited swarms.`);
      }
      const maxAgents = plan.limits.concurrentAgentsPerSwarm;
      if (maxAgents !== null && agents.length > maxAgents) {
        throw new Error(`Flux plan allows up to ${maxAgents} concurrent agents per swarm.`);
      }

      const swarmId = defaultSwarmId();
      // Map local config to API shape
      const agentList = agents.map(a => ({
        agentId: a.id,
        role: a.role,
        cliProvider: a.provider
      }));

      const result = await window.vibeAde.swarm.create({
        swarmId,
        goal: goal.trim(),
        codebaseRoot: codebaseRoot.trim(),
        agents: agentList
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      if (normalizedSub !== appState.subscription) {
        await window.vibeAde.workspace.updateSubscription(normalizedSub);
      }
      const nextSub = {
        ...normalizedSub,
        usage: {
          ...normalizedSub.usage,
          swarmsStarted: normalizedSub.usage.swarmsStarted + 1
        }
      };
      await window.vibeAde.workspace.updateSubscription(nextSub);
      useWorkspaceStore.setState((state) => ({
        appState: { ...state.appState, subscription: nextSub }
      }));
      openSwarmSession({ swarmId, name: swarmName.trim() });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const coordinator = agents.find(a => a.role === 'coordinator');

  return (
    <>
      <style>{WIZARD_STYLES}</style>
      <div className={props.embedded ? 'swarm-wizard-overlay embedded' : 'swarm-wizard-overlay'} onClick={() => close()}>
        <div className="swarm-wizard-card" onClick={(e) => e.stopPropagation()}>
          
          {/* Header */}
          <div className="wizard-header">
            <div className="wizard-title">
              <div style={{ 
                width: 32, height: 32, borderRadius: 8, 
                background: 'rgba(59, 130, 246, 0.15)', 
                display: 'grid', placeItems: 'center',
                color: 'var(--accent)'
              }}>
                <UiIcon name="bolt" className="ui-icon" />
              </div>
              Create QuanSwarm
            </div>
            <button onClick={() => close()} className="action-btn-sm" title="Close" style={{ border: 0 }}>
              <UiIcon name="close" className="ui-icon-sm" />
            </button>
          </div>

          {/* Body */}
          <div className="wizard-body">
            {step === 1 ? (
              <div style={{ display: 'grid', gap: 20, animation: 'fadeIn 0.3s ease' }}>
                <div className="input-group">
                  <label className="input-label">Swarm Name</label>
                  <input 
                    className="premium-input" 
                    placeholder="e.g. Auth System Refactor" 
                    value={swarmName}
                    onChange={e => setSwarmName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Mission Goal</label>
                  <textarea 
                    className="premium-input" 
                    placeholder="Describe exactly what the agents should build or fix..." 
                    rows={5}
                    style={{ resize: 'none', lineHeight: 1.5 }}
                    value={goal}
                    onChange={e => setGoal(e.target.value)}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Codebase Root</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input 
                      className="premium-input" 
                      style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13 }}
                      value={codebaseRoot}
                      onChange={e => setCodebaseRoot(e.target.value)}
                    />
                    <button 
                      className="premium-input"
                      style={{ padding: '0 20px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)' }}
                      onClick={async () => {
                        const selected = await window.vibeAde.system.selectDirectory();
                        if (selected) setCodebaseRoot(selected);
                      }}
                    >
                      Browse
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                  Assemble your squad. Configure the AI model for each agent individually.
                </div>

                {/* Coordinator - Locked (Visual) */}
                <div className="roster-section">
                  <div className="roster-header">
                    <div className="roster-title" style={{ color: 'var(--accent)' }}>COORDINATOR (LOCKED)</div>
                  </div>
                  <div className="agent-row locked">
                    <div className="agent-id" style={{ color: 'var(--accent)' }}>
                      <UiIcon name="bolt" className="ui-icon-sm" />
                      {coordinator?.id || 'coordinator-1'}
                    </div>
                    <select 
                      className="provider-select"
                      value={coordinator?.provider || 'codex'}
                      onChange={(e) => coordinator && handleUpdateProvider(coordinator.id, e.target.value as CliProvider)}
                    >
                      <option value="codex">OpenAI (Codex)</option>
                      <option value="claude">Anthropic (Claude)</option>
                      <option value="gemini">Google (Gemini)</option>
                    </select>
                  </div>
                </div>

                <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '20px 0' }} />

                <RosterSection 
                  title="Builders"
                  role="builder"
                  agents={getAgentsByRole('builder')}
                  onAdd={() => handleAddAgent('builder')}
                  onRemove={() => handleRemoveAgent('builder')}
                  onUpdateProvider={handleUpdateProvider}
                />

                <RosterSection 
                  title="Reviewers"
                  role="reviewer"
                  agents={getAgentsByRole('reviewer')}
                  onAdd={() => handleAddAgent('reviewer')}
                  onRemove={() => handleRemoveAgent('reviewer')}
                  onUpdateProvider={handleUpdateProvider}
                  max={3}
                />

                <RosterSection 
                  title="Scouts"
                  role="scout"
                  agents={getAgentsByRole('scout')}
                  onAdd={() => handleAddAgent('scout')}
                  onRemove={() => handleRemoveAgent('scout')}
                  onUpdateProvider={handleUpdateProvider}
                  max={3}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="wizard-footer">
            {error ? (
              <div style={{ color: 'var(--danger)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UiIcon name="close" className="ui-icon-sm" />
                {error}
              </div>
            ) : (
              <div className="step-indicator">
                <div className={`step-dot ${step === 1 ? 'active' : ''}`} />
                <div className={`step-dot ${step === 2 ? 'active' : ''}`} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              {step === 2 && (
                <button 
                  onClick={() => setStep(1)} 
                  disabled={loading}
                  className="premium-input"
                  style={{ cursor: 'pointer', padding: '8px 16px' }}
                >
                  Back
                </button>
              )}
              {step === 1 ? (
                <button 
                  className="premium-input" 
                  onClick={handleNext}
                  style={{ background: 'var(--accent)', borderColor: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                >
                  Next: Assemble Squad
                </button>
              ) : (
                <button 
                  className="premium-input" 
                  onClick={() => void startSwarm()} 
                  disabled={loading}
                  style={{ background: 'var(--accent)', borderColor: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                >
                  {loading ? 'Launching...' : 'Launch Swarm'}
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
