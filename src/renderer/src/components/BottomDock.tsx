import { useWorkspaceStore } from '@renderer/state/workspaceStore';

function PaletteIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" />
    </svg>
  );
}

export function BottomDock(): JSX.Element {
  const toggleCommandPalette = useWorkspaceStore((s) => s.toggleCommandPalette);

  return (
    <div className="bottom-dock">
      <button className="dock-button" title="Command Palette" onClick={() => toggleCommandPalette(true)}>
        <PaletteIcon />
      </button>
    </div>
  );
}
