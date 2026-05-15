import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { Button, Input, Label, Icon, cn } from './ui';

type CanvasBackground = 'dots' | 'grid' | 'blank';

const BACKGROUNDS: Array<{ id: CanvasBackground; label: string; preview: string }> = [
  { id: 'dots',  label: 'Dots',  preview: 'radial-gradient(circle, var(--fg-muted) 1px, transparent 1px) 0 0 / 12px 12px' },
  { id: 'grid',  label: 'Grid',  preview: 'linear-gradient(var(--fg-muted) 1px, transparent 1px) 0 0 / 12px 12px, linear-gradient(90deg, var(--fg-muted) 1px, transparent 1px) 0 0 / 12px 12px' },
  { id: 'blank', label: 'Blank', preview: 'var(--bg-panel-2)' }
];

export function CreateWallForm(props: { onCancel: () => void; onCreated: () => void }): JSX.Element {
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const setCanvasOptions = useWorkspaceStore((s) => s.setCanvasOptions);

  const [name, setName] = useState('');
  const [rootDir, setRootDir] = useState('C:\\');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [background, setBackground] = useState<CanvasBackground>('dots');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const canSubmit = useMemo(() => Boolean(name.trim()) && Boolean(rootDir.trim()), [name, rootDir]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (): Promise<void> => {
    setTouched(true);
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    try {
      window.localStorage.removeItem('vibeAde.pendingWorkspaceMode');
      await createWorkspace({
        name: name.trim(),
        rootDir: rootDir.trim(),
        layoutPresetId: '1-pane',
        mode: 'canvas'
      });

      const state = useWorkspaceStore.getState();
      const activeId = state.appState.activeWorkspaceId;
      if (activeId) {
        setCanvasOptions(activeId, { snapToGrid, background });
      }
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
        <Icon name="layout" size="sm" className="text-primary" />
        <h2 className="text-xs font-medium text-fg">New Wall</h2>
      </header>

      <div className="p-3 space-y-2.5">
        <div>
          <Label htmlFor="wall-name">Name</Label>
          <Input
            id="wall-name"
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New Wall"
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
        </div>

        <div>
          <Label htmlFor="wall-dir">Directory</Label>
          <div className="flex gap-1.5">
            <Input
              id="wall-dir"
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
          <Label>Snap to grid</Label>
          <button
            type="button"
            onClick={() => setSnapToGrid((v) => !v)}
            className={cn(
              'mt-1 inline-flex items-center gap-2 h-7 px-2 rounded-sm border text-[11px] transition-colors',
              snapToGrid
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-line bg-bg-panel-2 text-fg hover:border-line-strong'
            )}
            aria-pressed={snapToGrid}
          >
            <Icon name={snapToGrid ? 'check' : 'stop'} size="xs" />
            {snapToGrid ? 'On — cards align to a 16px grid' : 'Off — free placement'}
          </button>
        </div>

        <div>
          <Label>Background</Label>
          <div className="grid grid-cols-3 gap-1">
            {BACKGROUNDS.map((bg) => {
              const active = bg.id === background;
              return (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => setBackground(bg.id)}
                  className={cn(
                    'h-14 rounded-sm border text-[11px] font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                    'flex flex-col items-center justify-end pb-1 overflow-hidden',
                    active
                      ? 'border-primary text-primary'
                      : 'border-line text-fg hover:border-line-strong'
                  )}
                  style={{ background: bg.preview }}
                  aria-pressed={active}
                >
                  <span className="px-1.5 py-0.5 rounded-sm bg-bg-panel/80 backdrop-blur-sm">
                    {bg.label}
                  </span>
                </button>
              );
            })}
          </div>
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
          disabled={!canSubmit || submitting}
          loading={submitting}
        >
          {submitting ? 'Creating…' : 'Create'}
        </Button>
      </footer>
    </section>
  );
}
