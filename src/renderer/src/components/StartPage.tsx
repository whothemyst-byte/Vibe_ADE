import { useState } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import type { LayoutPresetId } from '@renderer/services/layoutPresets';

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

const SHORTCUTS: Array<{ label: string; combo: string }> = [
  { label: 'New Workspace', combo: 'Ctrl + T' },
  { label: 'New Terminal', combo: 'Ctrl + N' },
  { label: 'Split Right', combo: 'Ctrl + D' },
  { label: 'Split Down', combo: 'Ctrl + Shift + D' },
  { label: 'Close Pane', combo: 'Ctrl + W' },
  { label: 'Navigate Panes', combo: 'Ctrl + [ / ]' },
  { label: 'Navigate Workspaces', combo: 'Ctrl + Alt + [ / ]' },
  { label: 'Search Terminal', combo: 'Ctrl + F' },
  { label: 'Quick Open File', combo: 'Ctrl + P' },
  { label: 'Settings', combo: 'Ctrl + ,' }
];

export function StartPage(): JSX.Element {
  const appState = useWorkspaceStore((s) => s.appState);
  const mode = useWorkspaceStore((s) => s.ui.startPageMode);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const setLayoutPreset = useWorkspaceStore((s) => s.setLayoutPreset);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  const openStartPage = useWorkspaceStore((s) => s.openStartPage);

  const [name, setName] = useState('My Environment');
  const [rootDir, setRootDir] = useState('C:\\');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedLayout, setSelectedLayout] = useState<LayoutPresetId>('2-pane-vertical');

  const createEnvironment = async (): Promise<void> => {
    if (!name.trim() || !rootDir.trim()) {
      return;
    }
    await createWorkspace({ name: name.trim(), rootDir: rootDir.trim() });
    setLayoutPreset(selectedLayout);
    setShowCreateModal(false);
  };

  return (
    <div className="start-page-overlay">
      <section className="start-page-shell">
        {mode === 'home' && (
          <>
            <header className="start-page-header">
              <div className="start-logo-row">
                <div className="start-logo-mark">{'\u26A1'}</div>
                <h1>Vibe-ADE</h1>
              </div>
              <p>Build The Future.</p>
            </header>

            <div className="start-actions">
              <button className="primary" onClick={() => setShowCreateModal(true)}>
                New Workspace
              </button>
              <button onClick={() => openStartPage('open')}>Open Project</button>
            </div>

            <div className="start-shortcuts">
              <div className="start-shortcuts-title">Keyboard Shortcuts</div>
              <div className="start-shortcuts-grid">
                {SHORTCUTS.map((item) => (
                  <div key={item.label} className="start-shortcut-row">
                    <span>{item.label}</span>
                    <code>{item.combo}</code>
                  </div>
                ))}
              </div>
            </div>

            <div className="start-tip-row">
              <div className="start-tip">Tip: Use Ctrl + T to create workspaces from templates</div>
              <label className="start-toggle-label">
                <input type="checkbox" />
                <span>Don&apos;t show on startup</span>
              </label>
            </div>

            <button className="start-settings-fab" onClick={() => openSettings()} title="Settings">
              {'\u2699'}
            </button>
          </>
        )}

        {mode === 'open' && (
          <div className="open-environment-list">
            <div className="open-environment-header">
              <h3>Open Environment</h3>
              <button onClick={() => openStartPage('home')}>Back</button>
            </div>
            {appState.workspaces.length === 0 && <p>No environments found. Create one first.</p>}
            {appState.workspaces.map((workspace) => (
              <article key={workspace.id} className="environment-item">
                <div>
                  <strong>{workspace.name}</strong>
                  <div>{workspace.rootDir}</div>
                </div>
                <button onClick={() => void setActiveWorkspace(workspace.id)}>Open</button>
              </article>
            ))}
          </div>
        )}

        {showCreateModal && (
          <div className="start-create-modal-backdrop" onClick={() => setShowCreateModal(false)}>
            <section className="start-create-modal" onClick={(event) => event.stopPropagation()}>
              <header>
                <h2>New Workspace</h2>
                <button onClick={() => setShowCreateModal(false)}>{'\u2715'}</button>
              </header>

              <div className="start-create-body">
                <section>
                  <label>Name</label>
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Environment name" />
                </section>

                <section>
                  <label>Layout</label>
                  <div className="layout-choice-grid">
                    {LAYOUT_OPTIONS.map((layout) => (
                      <button
                        key={layout.id}
                        className={layout.id === selectedLayout ? 'layout-choice active' : 'layout-choice'}
                        onClick={() => setSelectedLayout(layout.id)}
                      >
                        <div className="layout-choice-preview">
                          {Array.from({ length: Math.min(layout.panes, 10) }).map((_, index) => (
                            <span key={`${layout.id}-${index}`} />
                          ))}
                        </div>
                        <small>{layout.label}</small>
                      </button>
                    ))}
                  </div>
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
                <button onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button className="primary" onClick={() => void createEnvironment()}>
                  Next
                </button>
              </footer>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
