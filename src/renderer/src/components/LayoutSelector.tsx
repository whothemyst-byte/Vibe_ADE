import { useMemo, useState } from 'react';
import { LAYOUT_PRESETS, getPresetById, type LayoutPresetId } from '@renderer/services/layoutPresets';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';

export function LayoutSelector(): JSX.Element {
  const [open, setOpen] = useState(false);
  const appState = useWorkspaceStore((s) => s.appState);
  const ui = useWorkspaceStore((s) => s.ui);
  const setLayoutPreset = useWorkspaceStore((s) => s.setLayoutPreset);

  const activePresetId = useMemo<LayoutPresetId>(() => {
    const activeId = appState.activeWorkspaceId;
    if (!activeId) {
      return '1-pane';
    }
    return ui.layoutPresetByWorkspace[activeId] ?? '1-pane';
  }, [appState.activeWorkspaceId, ui.layoutPresetByWorkspace]);

  const activePreset = getPresetById(activePresetId);

  return (
    <div className="layout-selector">
      <button
        className="top-button icon-top-button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={`Layout: ${activePreset.label}`}
        aria-label={`Layout: ${activePreset.label}`}
      >
        {'\u229E'}
      </button>
      {open && (
        <div className="layout-selector-menu" role="menu">
          {LAYOUT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className={preset.id === activePresetId ? 'layout-option active' : 'layout-option'}
              onClick={() => {
                setLayoutPreset(preset.id);
                setOpen(false);
              }}
            >
              <span>{preset.label}</span>
              <small>{preset.slots} panes</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
