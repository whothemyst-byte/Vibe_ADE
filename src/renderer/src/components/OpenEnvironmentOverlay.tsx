import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import type { LocalEnvironmentExportSummary } from '@shared/ipc';
import { loadEnvironmentSaveDirectory, saveEnvironmentSaveDirectory } from '@renderer/services/preferences';
import { UiIcon } from './UiIcon';

export function OpenEnvironmentOverlay(): JSX.Element {
  const appState = useWorkspaceStore((s) => s.appState);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const importEnvironmentFromFile = useWorkspaceStore((s) => s.importEnvironmentFromFile);
  const close = useWorkspaceStore((s) => s.closeEnvironmentOverlay);

  const [environmentSaveDir, setEnvironmentSaveDir] = useState<string | null>(() => loadEnvironmentSaveDirectory());
  const [localExports, setLocalExports] = useState<LocalEnvironmentExportSummary[]>([]);
  const [loadingLocalExports, setLoadingLocalExports] = useState(false);

  const recentWorkspaces = useMemo(() => [...appState.workspaces], [appState.workspaces]);

  useEffect(() => {
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
  }, [environmentSaveDir]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  const refresh = async (): Promise<void> => {
    if (!environmentSaveDir) {
      return;
    }
    setLoadingLocalExports(true);
    try {
      const next = await window.vibeAde.workspace.listLocalExports(environmentSaveDir);
      setLocalExports(next);
    } catch {
      setLocalExports([]);
    } finally {
      setLoadingLocalExports(false);
    }
  };

  return (
    <div className="open-env-overlay" onClick={close}>
      <section className="open-env-card" onClick={(event) => event.stopPropagation()}>
        <header className="open-env-header">
          <div className="open-env-title">
            <UiIcon name="folder" className="ui-icon" />
            <h2>Open Environment</h2>
          </div>
          <button className="icon-only-button" onClick={close} aria-label="Close">
            <UiIcon name="close" className="ui-icon ui-icon-sm" />
          </button>
        </header>

        <div className="open-env-body">
          <section className="open-env-section">
            <div className="open-env-section-title">Local Environments</div>
            <div className="open-env-dir-row">
              <input
                value={environmentSaveDir ?? ''}
                placeholder="Choose a folder..."
                readOnly
              />
              <button
                type="button"
                onClick={async () => {
                  const selected = await window.vibeAde.system.selectDirectory();
                  if (!selected) {
                    return;
                  }
                  saveEnvironmentSaveDirectory(selected);
                  setEnvironmentSaveDir(selected);
                }}
              >
                Browse
              </button>
              <button type="button" onClick={() => void refresh()} disabled={loadingLocalExports || !environmentSaveDir}>
                Refresh
              </button>
            </div>

            {!environmentSaveDir && <p className="open-env-hint">Choose a local folder to see exported environments.</p>}
            {loadingLocalExports && <p className="open-env-hint">Loading local environments...</p>}

            {environmentSaveDir && !loadingLocalExports && localExports.length === 0 && (
              <p className="open-env-hint">No local environments found in this folder.</p>
            )}

            {localExports.length > 0 && (
              <div className="open-env-list">
                {localExports.map((env) => (
                  <article key={env.filePath} className="open-env-item">
                    <div>
                      <strong>{env.name}</strong>
                      <div className="open-env-muted">{env.rootDir}</div>
                    </div>
                    <button
                      onClick={() => {
                        void importEnvironmentFromFile(env.filePath).then(close).catch(() => {});
                      }}
                    >
                      Open
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="open-env-section">
            <div className="open-env-section-title">Recent Environments</div>
            {recentWorkspaces.length === 0 ? (
              <p className="open-env-hint">No recent environments.</p>
            ) : (
              <div className="open-env-list">
                {recentWorkspaces.map((workspace) => (
                  <article key={workspace.id} className="open-env-item">
                    <div>
                      <strong>{workspace.name}</strong>
                      <div className="open-env-muted">{workspace.rootDir}</div>
                    </div>
                    <button
                      onClick={() => {
                        void setActiveWorkspace(workspace.id).then(close).catch(() => {});
                      }}
                    >
                      Open
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="open-env-footer">
          <button onClick={close}>Cancel</button>
        </footer>
      </section>
    </div>
  );
}

