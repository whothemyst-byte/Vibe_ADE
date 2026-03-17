import { useMemo, useState } from 'react';
import { LAYOUT_PRESETS, getPresetById, type LayoutPresetId } from '@renderer/services/layoutPresets';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import { UiIcon } from './UiIcon';

export function LayoutSelector(): JSX.Element {
  const [open, setOpen] = useState(false);
  const appState = useWorkspaceStore((s) => s.appState);
  const ui = useWorkspaceStore((s) => s.ui);
  const setLayoutPreset = useWorkspaceStore((s) => s.setLayoutPreset);
  const addToast = useToastStore((s) => s.addToast);

  const subscription = normalizeSubscriptionState(appState.subscription);
  const maxPanes = SUBSCRIPTION_PLANS[subscription.tier].limits.maxPanesPerWorkspace;

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
        <UiIcon name="layout" className="ui-icon" />
      </button>
      {open && (
        <div className="layout-selector-menu" role="menu">
          {LAYOUT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className={
                preset.id === activePresetId
                  ? 'layout-option active'
                  : maxPanes !== null && preset.slots > maxPanes
                    ? 'layout-option locked'
                    : 'layout-option'
              }
              onClick={() => {
                if (maxPanes !== null && preset.slots > maxPanes) {
                  addToast('info', `Spark supports up to ${maxPanes} panes. Upgrade to unlock larger layouts.`);
                  return;
                }
                setLayoutPreset(preset.id);
                setOpen(false);
              }}
            >
              <span>{preset.label}</span>
              <small>
                {preset.slots} panes
                {maxPanes !== null && preset.slots > maxPanes && (
                  <UiIcon name="lock" className="ui-icon ui-icon-sm lock-icon" />
                )}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
