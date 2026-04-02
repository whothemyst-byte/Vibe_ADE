import { useMemo, useState } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { UiIcon } from './UiIcon';

// --- Types ---
type CliProvider = 'claude' | 'codex' | 'gemini';
type AgentRole = 'coordinator' | 'builder' | 'scout' | 'reviewer';
type SwarmPresetId = 'squad' | 'team' | 'platoon' | 'battalion' | 'legion';

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

const SWARM_PRESETS: Array<{
  id: SwarmPresetId;
  label: string;
  count: number;
  builders: number;
  reviewers: number;
  scouts: number;
}> = [
  { id: 'squad', label: 'Squad', count: 5, builders: 2, reviewers: 1, scouts: 1 },
  { id: 'team', label: 'Team', count: 10, builders: 4, reviewers: 2, scouts: 2 },
  { id: 'platoon', label: 'Platoon', count: 15, builders: 7, reviewers: 3, scouts: 3 },
  { id: 'battalion', label: 'Battalion', count: 20, builders: 10, reviewers: 4, scouts: 5 },
  { id: 'legion', label: 'Legion', count: 50, builders: 26, reviewers: 10, scouts: 13 }
];

function buildAgentsForPreset(preset: (typeof SWARM_PRESETS)[number]): AgentConfig[] {
  const agents: AgentConfig[] = [{ id: 'coordinator-1', role: 'coordinator', provider: 'codex' }];
  for (let index = 0; index < preset.builders; index += 1) {
    agents.push({ id: `builder-${index + 1}`, role: 'builder', provider: 'codex' });
  }
  for (let index = 0; index < preset.reviewers; index += 1) {
    agents.push({ id: `reviewer-${index + 1}`, role: 'reviewer', provider: 'claude' });
  }
  for (let index = 0; index < preset.scouts; index += 1) {
    agents.push({ id: `scout-${index + 1}`, role: 'scout', provider: 'gemini' });
  }
  return agents;
}

// --- Styles (Injected) ---
const WIZARD_STYLES = `
  .swarm-wizard-overlay {
    position: absolute;
    inset: 0;
    z-index: 150;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      radial-gradient(circle at 20% 10%, color-mix(in srgb, var(--body-overlay) 80%, transparent), transparent 40%),
      color-mix(in srgb, var(--bg-page) 72%, transparent);
    backdrop-filter: blur(10px);
    animation: fadeIn 0.2s ease-out;
  }

  .swarm-wizard-overlay.embedded {
    position: absolute;
    inset: 0;
    z-index: 10;
  }

  .swarm-wizard-card {
    width: min(760px, calc(100vw - 48px));
    max-height: calc(100vh - 48px);
    display: grid;
    gap: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    overflow: visible;
  }

  .swarm-wizard-header {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: start;
    gap: 16px;
    padding: 0 0 12px;
  }

  .swarm-wizard-header-copy {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 4px;
  }

  .swarm-wizard-kicker {
    color: var(--text-muted);
    font-family: "JetBrains Mono", Consolas, "Courier New", monospace;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .swarm-wizard-header h2 {
    margin: 0;
    font-size: clamp(20px, 1.8vw, 26px);
    letter-spacing: -0.05em;
  }

  .swarm-wizard-header p {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .swarm-wizard-close {
    justify-self: end;
    margin-top: 2px;
  }

  .swarm-wizard-body {
    display: grid;
    gap: 14px;
    min-height: 0;
  }

  .swarm-stage-scroll {
    min-height: 0;
    height: min(300px, 34vh);
    max-height: min(300px, 34vh);
    overflow-y: auto;
    padding: 14px 12px 10px 12px;
    margin-top: 10px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    border-top: 0;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--bg-panel-2) 84%, transparent), color-mix(in srgb, var(--bg-panel) 92%, transparent));
    scrollbar-gutter: stable;
  }

  .swarm-wizard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }

  .swarm-wizard-column {
    min-width: 0;
    display: grid;
    gap: 10px;
  }

  .swarm-wizard-section,
  .swarm-wizard-summary-card {
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--bg-panel-2) 82%, transparent), color-mix(in srgb, var(--bg-panel) 92%, transparent));
  }

  .swarm-wizard-section {
    display: grid;
    gap: 8px;
    padding: 12px;
  }

  .swarm-wizard-section label,
  .swarm-wizard-summary-card label,
  .swarm-roster-title,
  .swarm-summary-label {
    display: block;
    color: var(--text-muted);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .swarm-input-group {
    display: grid;
    gap: 8px;
  }

  .swarm-input-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .swarm-input {
    width: 100%;
    background: color-mix(in srgb, var(--bg-panel-2) 78%, transparent);
    border: 1px solid color-mix(in srgb, var(--border-strong) 72%, transparent);
    border-radius: 12px;
    padding: 12px 14px;
    color: var(--text);
    font-size: 14px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  }

  .swarm-input:focus {
    border-color: color-mix(in srgb, var(--accent) 75%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent);
    background: color-mix(in srgb, var(--bg-panel-2) 92%, transparent);
  }

  .swarm-textarea {
    resize: none;
    min-height: 118px;
    line-height: 1.5;
  }

  .swarm-root-row {
    display: flex;
    gap: 10px;
    align-items: stretch;
  }

  .swarm-root-row .swarm-input {
    flex: 1;
    font-family: var(--font-mono);
    font-size: 13px;
  }

  .swarm-root-row button {
    min-width: 92px;
    padding-inline: 16px;
    background: color-mix(in srgb, var(--bg-panel-2) 86%, transparent);
  }

  .swarm-wizard-summary-card {
    padding: 14px;
    display: grid;
    gap: 12px;
    align-content: start;
  }

  .swarm-wizard-summary-card strong {
    font-size: 20px;
    letter-spacing: -0.03em;
  }

  .swarm-summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .swarm-summary-row {
    display: grid;
    gap: 4px;
    padding: 10px 11px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
    background: color-mix(in srgb, var(--bg-panel-2) 88%, transparent);
  }

  .swarm-summary-row strong,
  .swarm-summary-row span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .swarm-summary-row strong {
    font-size: 13px;
    color: var(--text);
    font-weight: 700;
  }

  .swarm-summary-row span {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .swarm-summary-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .swarm-summary-pill {
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
    background: color-mix(in srgb, var(--bg-panel-2) 90%, transparent);
    color: var(--text-muted);
    font-size: 11px;
  }

  .swarm-stage-note {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.6;
    font-size: 13px;
  }

  .swarm-preset-section {
    display: grid;
    gap: 10px;
    padding: 12px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--bg-panel-2) 84%, transparent), color-mix(in srgb, var(--bg-panel) 92%, transparent));
  }

  .swarm-preset-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .swarm-preset-title {
    display: grid;
    gap: 2px;
  }

  .swarm-preset-title strong {
    font-size: 15px;
    color: var(--text);
  }

  .swarm-preset-title span {
    color: var(--text-muted);
    font-size: 12px;
  }

  .swarm-preset-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }

  .swarm-preset-card {
    min-height: 78px;
    display: grid;
    gap: 6px;
    place-items: center;
    padding: 10px 8px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
    background: color-mix(in srgb, var(--bg-panel-2) 82%, transparent);
    text-align: center;
    transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
  }

  .swarm-preset-card strong {
    font-size: 18px;
    line-height: 1;
    letter-spacing: -0.05em;
  }

  .swarm-preset-card span {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .swarm-preset-card:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    background: color-mix(in srgb, var(--accent) 10%, var(--bg-panel-2));
  }

  .swarm-preset-card.active {
    border-color: color-mix(in srgb, var(--accent) 68%, var(--border));
    background: color-mix(in srgb, var(--accent) 16%, var(--bg-panel-2));
  }

  .swarm-preset-card.locked {
    opacity: 0.55;
  }

  .swarm-preset-card:disabled {
    cursor: not-allowed;
  }

  .swarm-roster-section {
    display: grid;
    gap: 10px;
    padding: 0;
    border-radius: 14px;
    border: 0;
    background: transparent;
  }

  .swarm-coordinator-section {
    display: grid;
    gap: 10px;
    padding: 12px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--bg-panel-2) 84%, transparent), color-mix(in srgb, var(--bg-panel) 92%, transparent));
  }

  .swarm-roster-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .swarm-roster-title {
    color: var(--text);
    font-weight: 700;
  }

  .swarm-roster-actions {
    display: flex;
    gap: 6px;
  }

  .swarm-action-btn {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: background 0.1s ease, border-color 0.1s ease, color 0.1s ease;
  }

  .swarm-action-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }

  .swarm-action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .swarm-agent-grid {
    display: grid;
    gap: 8px;
  }

  .swarm-role-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 2px 0 2px;
  }

  .swarm-role-chip {
    padding: 7px 12px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
    background: color-mix(in srgb, var(--bg-panel-2) 90%, transparent);
    color: var(--text-muted);
    font-size: 11px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  .swarm-role-chip strong {
    color: var(--text);
    font-size: 12px;
  }

  .swarm-agent-row {
    padding: 6px 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .swarm-agent-id {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text);
  }

  .swarm-provider-select {
    min-width: 138px;
    background: color-mix(in srgb, var(--bg-panel-2) 84%, transparent);
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    color: var(--text);
    font-size: 12px;
    border-radius: 8px;
    padding: 5px 8px;
    cursor: pointer;
  }

  .swarm-provider-select:hover {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }

  .swarm-step-indicator {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .swarm-step-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--border-strong);
    transition: width 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  }

  .swarm-step-dot.active {
    width: 22px;
    background: var(--accent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 60%, transparent);
  }

  .swarm-wizard-footer {
    width: 100%;
    padding: 8px 0 0;
    border-top: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-content: center;
  }

  .swarm-wizard-footer-actions {
    grid-column: 1;
    justify-self: end;
    display: flex;
    gap: 10px;
  }

  .swarm-wizard-footer-actions button {
    min-width: 118px;
  }

  @media (max-width: 1100px) {
    .swarm-wizard-card {
      width: min(720px, calc(100vw - 32px));
    }
  }

  @media (max-width: 900px) {
    .swarm-wizard-card {
      width: calc(100vw - 24px);
      max-height: calc(100vh - 24px);
    }

    .swarm-summary-grid {
      grid-template-columns: 1fr;
    }

    .swarm-root-row {
      flex-direction: column;
    }

    .swarm-root-row button {
      min-width: 0;
      width: 100%;
    }

    .swarm-agent-row {
      flex-direction: column;
      align-items: stretch;
    }

    .swarm-provider-select {
      width: 100%;
      min-width: 0;
    }

    .swarm-preset-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .swarm-stage-scroll {
      max-height: none;
      height: auto;
    }
  }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
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
    <div className="swarm-agent-grid">
      <div className="swarm-roster-header">
        <div className="swarm-roster-title">{title} ({agents.length})</div>
        <div className="swarm-roster-actions">
          <button 
            className="swarm-action-btn" 
            onClick={onRemove} 
            disabled={agents.length === 0}
            title="Remove last"
          >
            <UiIcon name="minus" className="ui-icon-sm" />
          </button>
          <button 
            className="swarm-action-btn" 
            onClick={onAdd} 
            disabled={agents.length >= max}
            title="Add new"
          >
            <UiIcon name="plus" className="ui-icon-sm" />
          </button>
        </div>
      </div>
      
      {agents.length === 0 && (
        <div style={{ padding: 12, border: '1px dashed color-mix(in srgb, var(--border) 70%, transparent)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          No {title.toLowerCase()} assigned.
        </div>
      )}
      {agents.map(agent => (
        <div key={agent.id} className="swarm-agent-row">
          <div className="swarm-agent-id">
            <UiIcon name="user" className="ui-icon-sm" />
            {agent.id}
          </div>
          <select 
            className="swarm-provider-select"
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
  const [selectedPreset, setSelectedPreset] = useState<SwarmPresetId>('squad');
  
  // -- Agent State --
  // Initialize with 1 coordinator (locked) and 1 builder by default
  const [agents, setAgents] = useState<AgentConfig[]>(() => buildAgentsForPreset(SWARM_PRESETS[0]));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscription = normalizeSubscriptionState(appState.subscription);
  const plan = SUBSCRIPTION_PLANS[subscription.tier];
  const maxAgents = plan.limits.concurrentAgentsPerSwarm;
  const maxAgentsLabel = maxAgents === null ? 'Unlimited' : String(maxAgents);
  const activePreset = SWARM_PRESETS.find((preset) => preset.id === selectedPreset) ?? null;

  // -- Handlers --

  const getAgentsByRole = (role: AgentRole) => agents.filter(a => a.role === role);

  const handleAddAgent = (role: AgentRole) => {
    setSelectedPreset(null);
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
    setSelectedPreset(null);
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

  const applyPreset = (presetId: SwarmPresetId) => {
    const preset = SWARM_PRESETS.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }
    if (maxAgents !== null && preset.count > maxAgents) {
      setError(`Flux plan allows up to ${maxAgents} concurrent agents per swarm.`);
      return;
    }
    setError(null);
    setSelectedPreset(presetId);
    setAgents(buildAgentsForPreset(preset));
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
      void window.vibeAde.billing.recordUsage('swarm', 1);
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

  const content = (
    <>
      <style>{WIZARD_STYLES}</style>
      <section className="swarm-wizard-card" onClick={(event) => event.stopPropagation()}>
        <header className="swarm-wizard-header">
          <div className="swarm-wizard-header-copy">
            <h2>Create QuanSwarm</h2>
            <p>Define the mission first, then assemble the squad.</p>
          </div>
        </header>

        <div className="swarm-wizard-body">
          {step === 1 ? (
            <div className="swarm-wizard-grid">
              <div className="swarm-wizard-column">
                <section className="swarm-wizard-section">
                  <label>Swarm Name</label>
                  <input
                    className="swarm-input"
                    placeholder="e.g. Auth System Refactor"
                    value={swarmName}
                    onChange={(event) => setSwarmName(event.target.value)}
                    autoFocus
                  />
                </section>

                <section className="swarm-wizard-section">
                  <label>Mission Goal</label>
                  <textarea
                    className="swarm-input swarm-textarea"
                    placeholder="Describe exactly what the agents should build or fix..."
                    rows={5}
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                  />
                </section>

                <section className="swarm-wizard-section">
                  <label>Codebase Root</label>
                  <div className="swarm-root-row">
                    <input
                      className="swarm-input"
                      value={codebaseRoot}
                      onChange={(event) => setCodebaseRoot(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const selected = await window.vibeAde.system.selectDirectory();
                        if (selected) {
                          setCodebaseRoot(selected);
                        }
                      }}
                    >
                      Browse
                    </button>
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="swarm-wizard-column">
              <section className="swarm-preset-section">
                <div className="swarm-preset-header">
                  <div className="swarm-preset-title">
                    <strong>Quick Presets</strong>
                    <span>Choose a roster size to seed the swarm.</span>
                  </div>
                  <div className="swarm-preset-title" style={{ textAlign: 'right' }}>
                    <strong>{activePreset?.label ?? 'Custom'}</strong>
                    <span>{agents.length} total</span>
                  </div>
                </div>
                <div className="swarm-preset-grid">
                  {SWARM_PRESETS.map((preset) => {
                    const locked = maxAgents !== null && preset.count > maxAgents;
                    const active = selectedPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={locked ? `swarm-preset-card locked${active ? ' active' : ''}` : `swarm-preset-card${active ? ' active' : ''}`}
                        disabled={locked}
                        onClick={() => applyPreset(preset.id)}
                      >
                        <strong>{preset.count}</strong>
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="swarm-role-chips">
                <span className="swarm-role-chip"><strong>1</strong> Coordinator</span>
                <span className="swarm-role-chip"><strong>{getAgentsByRole('builder').length}</strong> Builders</span>
                <span className="swarm-role-chip"><strong>{getAgentsByRole('scout').length}</strong> Scouts</span>
                <span className="swarm-role-chip"><strong>{getAgentsByRole('reviewer').length}</strong> Reviewers</span>
                <span className="swarm-role-chip"><strong>{agents.length}</strong> total</span>
              </div>

              <section className="swarm-coordinator-section">
                <div className="swarm-roster-header">
                  <div className="swarm-roster-title" style={{ color: 'var(--accent)' }}>Coordinator (Locked)</div>
                </div>
                <div className="swarm-agent-row locked">
                  <div className="swarm-agent-id" style={{ color: 'var(--accent)' }}>
                    <UiIcon name="bolt" className="ui-icon-sm" />
                    {coordinator?.id || 'coordinator-1'}
                  </div>
                  <select
                    className="swarm-provider-select"
                    value={coordinator?.provider || 'codex'}
                    onChange={(event) => coordinator && handleUpdateProvider(coordinator.id, event.target.value as CliProvider)}
                  >
                    <option value="codex">OpenAI (Codex)</option>
                    <option value="claude">Anthropic (Claude)</option>
                    <option value="gemini">Google (Gemini)</option>
                  </select>
                </div>
              </section>

              <div className="swarm-stage-scroll">
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
            </div>
          )}
        </div>

        <footer className="swarm-wizard-footer">
          {error ? (
            <div style={{ color: 'var(--danger)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <UiIcon name="close" className="ui-icon-sm" />
              {error}
            </div>
          ) : (
            <div className="swarm-step-indicator">
              <div className={`swarm-step-dot ${step === 1 ? 'active' : ''}`} />
              <div className={`swarm-step-dot ${step === 2 ? 'active' : ''}`} />
            </div>
          )}

          <div className="swarm-wizard-footer-actions">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                disabled={loading}
              >
                Back
              </button>
            )}
            {step === 1 ? (
              <button
                className="primary"
                onClick={handleNext}
              >
                Next: Assemble Squad
              </button>
            ) : (
              <button
                className="primary"
                onClick={() => void startSwarm()}
                disabled={loading}
              >
                {loading ? 'Launching...' : 'Launch Swarm'}
              </button>
            )}
          </div>
        </footer>
      </section>
    </>
  );

  if (props.embedded) {
    return content;
  }

  return (
    <div className="swarm-wizard-overlay" onClick={() => close()}>
      {content}
    </div>
  );
}
