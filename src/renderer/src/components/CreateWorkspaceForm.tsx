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
  { id: '1-pane', label: 'Single', panes: 1 },
  { id: '2-pane-vertical', label: '2', panes: 2 },
  { id: '4-pane-grid', label: '4', panes: 4 },
  { id: '6-pane-grid', label: '6', panes: 6 },
  { id: '8-pane-grid', label: '8', panes: 8 },
  { id: '12-pane-grid', label: '10+', panes: 10 }
];

export function CreateWorkspaceForm(props: { onCancel: () => void; onCreated: () => void }): JSX.Element {
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const setLayoutPreset = useWorkspaceStore((s) => s.setLayoutPreset);
  const subscription = useWorkspaceStore((s) => s.appState.subscription);
  const addToast = useToastStore((s) => s.addToast);

  const maxPanes = SUBSCRIPTION_PLANS[normalizeSubscriptionState(subscription).tier].limits.maxPanesPerWorkspace;

  const [name, setName] = useState('');
  const [rootDir, setRootDir] = useState('C:\\');
  const [selectedLayout, setSelectedLayout] = useState<LayoutPresetId>('2-pane-vertical');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const canSubmit = useMemo(() => Boolean(name.trim()) && Boolean(rootDir.trim()), [name, rootDir]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (): Promise<void> => {
    setTouched(true);
    if (!canSubmit || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      await createWorkspace({ name: name.trim(), rootDir: rootDir.trim() });
      setLayoutPreset(selectedLayout);
      props.onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="start-create-modal" onClick={(event) => event.stopPropagation()}>
      <header>
        <h2>New Environment</h2>
        <button className="icon-only-button" onClick={props.onCancel} aria-label="Close">
          <UiIcon name="close" className="ui-icon ui-icon-sm" />
        </button>
      </header>

      <div className="start-create-body">
        <section>
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
        </section>

        <section>
          <label>Layout</label>
          <div className="layout-choice-grid">
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
                <div className="layout-choice-preview">
                  {Array.from({ length: Math.min(layout.panes, 10) }).map((_, index) => (
                    <span key={`${layout.id}-${index}`} />
                  ))}
                </div>
                        <small>
                          {layout.label}
                          {maxPanes !== null && layout.panes > maxPanes && (
                            <UiIcon name="lock" className="ui-icon ui-icon-sm lock-icon" />
                          )}
                        </small>
                      </button>
                    ))}
          </div>
          <p className="layout-choice-helper">Side-by-side horizontal split</p>
        </section>

        <section>
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

      <footer>
        <button onClick={props.onCancel} disabled={submitting}>
          Cancel
        </button>
        <button className="primary" onClick={() => void submit()} disabled={!canSubmit || submitting}>
          {submitting ? 'Creating...' : 'Create'}
        </button>
      </footer>
    </section>
  );
}
