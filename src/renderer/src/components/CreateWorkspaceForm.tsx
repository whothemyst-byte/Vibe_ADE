import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutPresetId } from '@renderer/services/layoutPresets';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import { Button, Input, Label, Icon, cn } from './ui';

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
    if (!canSubmit || submitting || cloudWorkspaceBlocked) return;

    setSubmitting(true);
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const pendingMode = window.localStorage.getItem('vibeAde.pendingWorkspaceMode') as
        | 'space'
        | 'swarm'
        | 'canvas'
        | null;
      window.localStorage.removeItem('vibeAde.pendingWorkspaceMode');
      await createWorkspace({
        name: name.trim(),
        rootDir: rootDir.trim(),
        layoutPresetId: selectedLayout,
        mode: pendingMode ?? 'space'
      });
      setLayoutPreset(selectedLayout);
      props.onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="w-full max-w-md bg-bg-panel border border-line rounded shadow-premium overflow-hidden"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="px-3 h-7 border-b border-line bg-bg-panel-2 flex items-center gap-2">
        <Icon name="add_circle" size="sm" className="text-primary" />
        <h2 className="text-xs font-medium text-fg">New Workspace</h2>
      </header>

      <div className="p-3 space-y-2.5">
        <div>
          <Label htmlFor="ws-name">Name</Label>
          <Input
            id="ws-name"
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New Environment"
            onBlur={() => setTouched(true)}
            leftIcon={<Icon name="badge" size="xs" />}
            invalid={touched && !name.trim()}
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
          {touched && !name.trim() && (
            <p className="mt-1 text-[10px] text-danger flex items-center gap-1">
              <Icon name="error_outline" size="xs" /> Name is required.
            </p>
          )}
          {cloudWorkspaceBlocked && (
            <p className="mt-1 text-[10px] text-danger flex items-center gap-1">
              <Icon name="lock" size="xs" /> Spark allows up to {maxCloudWorkspaces} cloud-synced workspaces.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="ws-dir">Directory</Label>
          <div className="flex gap-1.5">
            <Input
              id="ws-dir"
              value={rootDir}
              onChange={(event) => setRootDir(event.target.value)}
              placeholder="C:\\"
              leftIcon={<Icon name="folder" size="xs" />}
              className="flex-1 font-mono"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const selected = await window.vibeAde.system.selectDirectory();
                if (selected) setRootDir(selected);
              }}
            >
              Browse
            </Button>
          </div>
        </div>

        <div>
          <Label>Layout</Label>
          <div className="grid grid-cols-6 gap-1">
            {LAYOUT_OPTIONS.map((layout) => {
              const locked = maxPanes !== null && layout.panes > maxPanes;
              const active = layout.id === selectedLayout;
              return (
                <button
                  key={layout.id}
                  type="button"
                  title={LAYOUT_DESCRIPTIONS[layout.id] ?? 'Workspace layout'}
                  onClick={() => {
                    if (locked) {
                      addToast('info', `Spark supports up to ${maxPanes} panes. Upgrade to unlock larger layouts.`);
                      return;
                    }
                    setSelectedLayout(layout.id);
                  }}
                  className={cn(
                    'relative h-7 rounded-sm border text-[11px] font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                    active
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-line bg-bg-panel-2 text-fg hover:border-line-strong',
                    locked && 'opacity-50'
                  )}
                >
                  {locked ? <Icon name="lock" size="xs" className="text-warn" /> : layout.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] text-fg-muted">
            {LAYOUT_DESCRIPTIONS[selectedLayout] ?? 'Workspace layout'}
          </p>
        </div>
      </div>

      <footer className="px-3 py-2 border-t border-line bg-bg-panel-2 flex items-center justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={props.onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void submit()}
          disabled={!canSubmit || submitting || cloudWorkspaceBlocked}
          loading={submitting}
        >
          {submitting ? 'Creating…' : 'Create'}
        </Button>
      </footer>
    </section>
  );
}
