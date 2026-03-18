import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import type { LayoutPresetId } from '@renderer/services/layoutPresets';
import type { LocalEnvironmentExportSummary } from '@shared/ipc';
import { loadEnvironmentSaveDirectory, saveEnvironmentSaveDirectory } from '@renderer/services/preferences';
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

export function StartPage(): JSX.Element {
  const appState = useWorkspaceStore((s) => s.appState);
  const mode = useWorkspaceStore((s) => s.ui.startPageMode) ?? 'home';
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const setLayoutPreset = useWorkspaceStore((s) => s.setLayoutPreset);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const importEnvironmentFromFile = useWorkspaceStore((s) => s.importEnvironmentFromFile);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  const openStartPage = useWorkspaceStore((s) => s.openStartPage);
  const openSwarmDashboard = useWorkspaceStore((s) => s.openSwarmDashboard);
  const subscription = useWorkspaceStore((s) => s.appState.subscription);
  const addToast = useToastStore((s) => s.addToast);
  const normalizedSub = normalizeSubscriptionState(subscription);
  const plan = SUBSCRIPTION_PLANS[normalizedSub.tier] ?? SUBSCRIPTION_PLANS.spark;
  const maxPanes = plan.limits.maxPanesPerWorkspace;
  const swarmLocked = !plan.features.swarms;

  const [name, setName] = useState('');
  const [rootDir, setRootDir] = useState('C:\\');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedLayout, setSelectedLayout] = useState<LayoutPresetId>('2-pane-vertical');
  const [environmentSaveDir, setEnvironmentSaveDir] = useState<string | null>(() => loadEnvironmentSaveDirectory());
  const [localExports, setLocalExports] = useState<LocalEnvironmentExportSummary[]>([]);
  const [loadingLocalExports, setLoadingLocalExports] = useState(false);
  const createEnvironment = async (): Promise<void> => {
    if (!name.trim() || !rootDir.trim()) {
      return;
    }
    await createWorkspace({ name: name.trim(), rootDir: rootDir.trim() });
    setLayoutPreset(selectedLayout);
    setShowCreateModal(false);
  };

  const canCreateEnvironment = Boolean(name.trim()) && Boolean(rootDir.trim());

  useEffect(() => {
    if (mode !== 'open') {
      return;
    }
    let cancelled = false;
    const run = async (): Promise<void> => {
      if (!environmentSaveDir) {
        setLocalExports([]);
        return;
      }
      setLoadingLocalExports(true);
      try {
        const next = await window.vibeAde.workspace.listLocalExports(environmentSaveDir);
        if (!cancelled) {
          setLocalExports(next);
        }
      } catch {
        if (!cancelled) {
          setLocalExports([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingLocalExports(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [environmentSaveDir, mode]);

  return (
    <div className="start-page-overlay">
      <section className="start-page-shell">
        {mode === 'home' && (
          <>
            <header className="start-page-header">
              <div className="start-logo-row">
                <div className="start-logo-mark">
                  <UiIcon name="bolt" className="ui-icon ui-icon-xl" />
                </div>
                <h1>Vibe-ADE</h1>
              </div>
              <p>Build The Future.</p>
            </header>

            <div className="start-actions">
              <button
                className="primary"
                onClick={() => {
                  setName('');
                  setRootDir('C:\\');
                  setSelectedLayout('2-pane-vertical');
                  setShowCreateModal(true);
                }}
              >
                New Workspace
              </button>
              <button
                onClick={() => {
                  if (swarmLocked) {
                    addToast('info', 'QuanSwarm is available on Flux and Forge plans.');
                    return;
                  }
                  openSwarmDashboard();
                }}
                className={swarmLocked ? 'start-action-lockable locked' : 'start-action-lockable'}
              >
                New Swarm
                {swarmLocked && <UiIcon name="lock" className="ui-icon ui-icon-sm lock-icon" />}
              </button>
              <button onClick={() => openStartPage('open')}>Open Environment</button>
            </div>

            <div className="start-tip-row">
              <label className="start-toggle-label">
                <input type="checkbox" />
                <span>Don&apos;t show on startup</span>
              </label>
            </div>

            <button className="start-settings-fab" onClick={() => openSettings()} title="Settings">
              <UiIcon name="settings" className="ui-icon" />
            </button>
          </>
        )}

        {mode === 'open' && (
          <div className="open-environment-list">
            <div className="open-environment-header">
              <h3>Open Environment</h3>
              <button onClick={() => openStartPage('home')}>Back</button>
            </div>

            <div className="open-env-toolbar">
              <div className="open-env-toolbar-meta">
                <div className="open-env-toolbar-label">Local folder</div>
                <code className="open-env-toolbar-path">{environmentSaveDir ?? 'Not set'}</code>
              </div>
              <div className="open-env-toolbar-actions">
                <button
                  onClick={async () => {
                    const selected = await window.vibeAde.system.selectDirectory();
                    if (!selected) {
                      return;
                    }
                    saveEnvironmentSaveDirectory(selected);
                    setEnvironmentSaveDir(selected);
                  }}
                >
                  {environmentSaveDir ? 'Change…' : 'Choose…'}
                </button>
                {environmentSaveDir && (
                  <button
                    onClick={() => {
                      void window.vibeAde.workspace.listLocalExports(environmentSaveDir).then(setLocalExports).catch(() => setLocalExports([]));
                    }}
                    disabled={loadingLocalExports}
                  >
                    Refresh
                  </button>
                )}
              </div>
            </div>

            {!environmentSaveDir && <p>Choose a local folder to see exported environments.</p>}

            {loadingLocalExports && <p>Loading local environments…</p>}

            {localExports.length > 0 && (
              <>
                <div className="open-env-section-title">Local Environments</div>
                {localExports.map((env) => (
                  <article key={env.filePath} className="environment-item">
                    <div>
                      <strong>{env.name}</strong>
                      <div>{env.rootDir}</div>
                    </div>
                    <button onClick={() => void importEnvironmentFromFile(env.filePath)}>Open</button>
                  </article>
                ))}
              </>
            )}

            {environmentSaveDir && !loadingLocalExports && localExports.length === 0 && (
              <>
                <div className="open-env-section-title">Local Environments</div>
                <p>No local environments found in this folder.</p>
              </>
            )}

            <div className="open-env-section-title">Recent Environments</div>
            {appState.workspaces.length === 0 && localExports.length === 0 && <p>No environments found. Create one first.</p>}
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
                <button className="icon-only-button" onClick={() => setShowCreateModal(false)}>
                  <UiIcon name="close" className="ui-icon ui-icon-sm" />
                </button>
              </header>

              <div className="start-create-body">
                <section>
                  <label>Name</label>
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New Environment" />
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
                <button onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button className="primary" onClick={() => void createEnvironment()} disabled={!canCreateEnvironment}>
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
