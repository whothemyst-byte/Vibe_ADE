import { useMemo, useState } from 'react';
import type { WorkspaceState } from '@shared/types';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { AGENT_MODELS, loadAgentPreferences } from '@renderer/services/preferences';

interface AgentPanelProps {
  workspace: WorkspaceState;
}

export function AgentPanel({ workspace }: AgentPanelProps): JSX.Element {
  const activePaneId = workspace.activePaneId;
  const state = workspace.paneAgents[activePaneId];
  const [prompt, setPrompt] = useState('Analyze this workspace and propose an implementation plan.');
  const preferredModel = loadAgentPreferences().defaultModel;

  const setAgentAttachment = useWorkspaceStore((s) => s.setAgentAttachment);
  const setAgentRunning = useWorkspaceStore((s) => s.setAgentRunning);

  if (!state) {
    return <div className="agent-panel">No active pane agent state.</div>;
  }

  const start = async (): Promise<void> => {
    await setAgentRunning(activePaneId, true);
    await window.vibeAde.agent.start({
      paneId: activePaneId,
      model: state.model || preferredModel,
      prompt,
      cwd: workspace.rootDir
    });
  };

  const stop = async (): Promise<void> => {
    await window.vibeAde.agent.stop(activePaneId);
    await setAgentRunning(activePaneId, false);
  };

  const outputSummary = state.lastOutput?.plan ?? 'No structured response yet.';

  return (
    <div className="agent-panel">
      <header className="side-panel-header">
        <h3>Agent Control</h3>
      </header>
      <label>
        Model
        <select value={state.model} onChange={(event) => void setAgentAttachment(activePaneId, true, event.target.value)}>
          {AGENT_MODELS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
      <div className="agent-actions">
        <button onClick={() => void start()} disabled={state.running}>
          Start Agent
        </button>
        <button onClick={() => void stop()} disabled={!state.running}>
          Stop Agent
        </button>
      </div>
      <label>
        Prompt
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      </label>
      <div className="agent-output">
        <div className="agent-output-header">
          <h4>Structured Response</h4>
          <button onClick={() => void navigator.clipboard.writeText(outputSummary)}>Copy</button>
        </div>
        <pre>{outputSummary}</pre>
        <h4>Suggested Commands</h4>
        <ul className="agent-command-list">
          {(state.lastOutput?.commands ?? []).map((command) => (
            <li key={command.command} className={command.destructive ? 'warning' : ''}>
              <code>{command.command}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
