import { useWorkspaceStore } from '@renderer/state/workspaceStore';

function AgentIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="4" width="14" height="12" rx="2" />
      <circle cx="9" cy="10" r="1" />
      <circle cx="15" cy="10" r="1" />
      <path d="M9 13h6M12 16v4" />
    </svg>
  );
}

function PaletteIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function BottomDock(): JSX.Element {
  const ui = useWorkspaceStore((s) => s.ui);
  const toggleAgentPanel = useWorkspaceStore((s) => s.toggleAgentPanel);
  const toggleCommandPalette = useWorkspaceStore((s) => s.toggleCommandPalette);

  return (
    <div className="bottom-dock">
      <button
        className={ui.agentPanelOpen ? 'dock-button active' : 'dock-button'}
        title="Toggle Agent Panel"
        onClick={() => toggleAgentPanel()}
      >
        <AgentIcon />
      </button>
      <button className="dock-button" title="Command Palette" onClick={() => toggleCommandPalette(true)}>
        <PaletteIcon />
      </button>
    </div>
  );
}
