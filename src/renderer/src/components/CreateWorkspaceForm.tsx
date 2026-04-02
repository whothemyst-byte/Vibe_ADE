import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutPresetId } from '@renderer/services/layoutPresets';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import { UiIcon } from './UiIcon';

interface LayoutOption {
  id: LayoutPresetId;
  label: string;
  panes: number;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  { id: '1-pane', label: '1', panes: 1 },
  { id: '2-pane-vertical', label: '2', panes: 2 },
  { id: '4-pane-grid', label: '4', panes: 4 },
  { id: '6-pane-grid', label: '6', panes: 6 },
  { id: '8-pane-grid', label: '8', panes: 8 },
  { id: '12-pane-grid', label: '10+', panes: 10 }
];

const LAYOUT_DESCRIPTIONS: Record<LayoutPresetId, string> = {
  '1-pane': 'Single terminal focus',
  '2-pane-vertical': 'Split for implementation and verification',
  '4-pane-grid': 'Balanced multi-surface workspace',
  '6-pane-grid': 'Full-stack development layout',
  '8-pane-grid': 'High-density operator grid',
  '12-pane-grid': 'Maximum throughput command center',
  '3-pane-left-large': 'Triple panel focus',
  '6-pane-left-stack': 'Stacked high context layout',
  '8-pane-left-stack': 'Dense left-led execution layout',
  '12-pane-hybrid': 'Hybrid command surface',
  '16-pane-grid': 'Expanded monitoring grid'
};

export function CreateWorkspaceForm(props: { onCancel: () => void; onCreated: () => void }): JSX.Element {
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const workspaceCount = useWorkspaceStore((s) => s.appState.workspaces.length);
  const setLayoutPreset = useWorkspaceStore((s) => s.setLayoutPreset);
  const subscription = useWorkspaceStore((s) => s.appState.subscription);
  const addToast = useToastStore((s) => s.addToast);

  const maxPanes = SUBSCRIPTION_PLANS[normalizeSubscriptionState(subscription).tier].limits.maxPanesPerWorkspace;
  const maxCloudWorkspaces = SUBSCRIPTION_PLANS[normalizeSubscriptionState(subscription).tier].limits.maxCloudSyncedWorkspaces;

  const [name, setName] = useState('');
  const [rootDir, setRootDir] = useState('C:\\');
  const [selectedLayout, setSelectedLayout] = useState<LayoutPresetId>('2-pane-vertical');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const canSubmit = useMemo(() => Boolean(name.trim()) && Boolean(rootDir.trim()), [name, rootDir]);
  const cloudWorkspaceBlocked = maxCloudWorkspaces !== null && workspaceCount >= maxCloudWorkspaces;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (): Promise<void> => {
    setTouched(true);
    if (!canSubmit || submitting || cloudWorkspaceBlocked) {
      return;
    }

    setSubmitting(true);
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await createWorkspace({ name: name.trim(), rootDir: rootDir.trim(), layoutPresetId: selectedLayout });
      setLayoutPreset(selectedLayout);
      props.onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="workspace-create-shell" onClick={(event) => event.stopPropagation()}>
      <header className="workspace-create-header">
        <div className="workspace-create-header-copy">
          <h2>Initialize Workspace</h2>
          <p>Select a template and working directory.</p>
        </div>
      </header>

      <div className="workspace-create-body">
        <div className="workspace-create-column workspace-create-column-left">
          <section className="workspace-create-summary-card workspace-create-summary-card-compact">
            <label>Working Directory</label>
            <strong>{rootDir || 'C:\\'}</strong>
            <p>Workspace files will be created and stored here.</p>
          </section>

          <section className="workspace-create-section">
            <label>Name</label>
            <input
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New Environment"
              onBlur={() => setTouched(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submit();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  props.onCancel();
                }
              }}
            />
            {touched && !name.trim() && <small style={{ color: 'var(--danger)' }}>Name is required.</small>}
            {cloudWorkspaceBlocked && (
              <small style={{ color: 'var(--danger)' }}>
                Spark allows up to {maxCloudWorkspaces} cloud-synced workspaces. Remove one to create another.
              </small>
            )}
          </section>

          <section className="workspace-create-section">
            <label>Directory</label>
            <div className="root-path-picker">
              <input value={rootDir} onChange={(event) => setRootDir(event.target.value)} placeholder="C:\\" />
              <button
                type="button"
                onClick={async () => {
                  const selected = await window.vibeAde.system.selectDirectory();
                  if (selected) {
                    setRootDir(selected);
                  }
                }}
              >
                Browse
              </button>
            </div>
          </section>
        </div>

        <section className="workspace-create-section workspace-create-column workspace-create-column-right">
          <div className="workspace-create-section-head">
            <div>
              <label>Layout Templates</label>
            </div>
          </div>
          <div className="layout-choice-grid workspace-layout-grid">
            {LAYOUT_OPTIONS.map((layout) => (
              <button
                key={layout.id}
                className={
                  layout.id === selectedLayout
                    ? 'layout-choice active'
                    : maxPanes !== null && layout.panes > maxPanes
                      ? 'layout-choice locked'
                      : 'layout-choice'
                }
                onClick={() => {
                  if (maxPanes !== null && layout.panes > maxPanes) {
                    addToast('info', `Spark supports up to ${maxPanes} panes. Upgrade to unlock larger layouts.`);
                    return;
                  }
                  setSelectedLayout(layout.id);
                }}
              >
                <div className="layout-choice-topline">
                  <strong className="layout-choice-count">{layout.label}</strong>
                </div>
                {maxPanes !== null && layout.panes > maxPanes && (
                  <UiIcon name="lock" className="ui-icon ui-icon-sm lock-icon layout-choice-lock" />
                )}
                <span className="workspace-layout-note">{LAYOUT_DESCRIPTIONS[layout.id] ?? 'Workspace layout'}</span>
              </button>
            ))}
          </div>
          <p className="layout-choice-helper">All presets inherit the current theme and workspace shell styling.</p>
        </section>
      </div>

      <footer className="workspace-create-footer">
        <div className="workspace-create-footer-actions">
          <button onClick={props.onCancel} disabled={submitting}>
            Cancel
          </button>
          <button className="primary" onClick={() => void submit()} disabled={!canSubmit || submitting || cloudWorkspaceBlocked}>
            {submitting ? 'Creating...' : 'Create Workspace'}
          </button>
        </div>
      </footer>
    </section>
  );
}
