import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { useToastStore } from '@renderer/hooks/useToast';
import type { LocalEnvironmentExportSummary } from '@shared/ipc';
import { loadEnvironmentSaveDirectory, saveEnvironmentSaveDirectory } from '@renderer/services/preferences';
import { Button, Input, Icon, cn } from './ui';

export function OpenEnvironmentOverlay(): JSX.Element {
  const importEnvironmentFromFile = useWorkspaceStore((s) => s.importEnvironmentFromFile);
  const close = useWorkspaceStore((s) => s.closeEnvironmentOverlay);
  const addToast = useToastStore((s) => s.addToast);

  const [environmentSaveDir, setEnvironmentSaveDir] = useState<string | null>(() => loadEnvironmentSaveDirectory());
  const [localExports, setLocalExports] = useState<LocalEnvironmentExportSummary[]>([]);
  const [loadingLocalExports, setLoadingLocalExports] = useState(false);

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
        if (!cancelled) setLocalExports(next);
      } catch {
        if (!cancelled) setLocalExports([]);
      } finally {
        if (!cancelled) setLoadingLocalExports(false);
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
    if (!environmentSaveDir) return;
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={close}
    >
      <section
        className="w-full max-w-lg bg-bg-panel border border-line rounded shadow-premium overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="px-3 h-7 border-b border-line bg-bg-panel-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="folder_open" size="sm" className="text-primary" />
            <h2 className="text-xs font-medium text-fg">Open Environment</h2>
          </div>
          <button
            className="h-5 w-5 grid place-items-center rounded-sm text-fg-muted hover:text-fg hover:bg-bg-elev transition-colors"
            onClick={close}
            aria-label="Close"
          >
            <Icon name="close" size="xs" />
          </button>
        </header>

        <div className="p-3">
          <div className="flex gap-1.5 mb-2">
            <Input
              value={environmentSaveDir ?? ''}
              placeholder="Choose a folder..."
              readOnly
              leftIcon={<Icon name="folder" size="xs" />}
              className="flex-1 font-mono"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const selected = await window.vibeAde.system.selectDirectory();
                if (!selected) return;
                saveEnvironmentSaveDirectory(selected);
                setEnvironmentSaveDir(selected);
              }}
            >
              Browse
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refresh()}
              disabled={loadingLocalExports || !environmentSaveDir}
            >
              Refresh
            </Button>
          </div>

          {!environmentSaveDir && (
            <p className="text-[11px] text-fg-muted px-0.5">Choose a local folder to see exported environments.</p>
          )}
          {loadingLocalExports && (
            <p className="text-[11px] text-fg-muted px-0.5">Loading local environments...</p>
          )}
          {environmentSaveDir && !loadingLocalExports && localExports.length === 0 && (
            <div className="text-center py-3 text-[11px] text-fg-muted">
              <Icon name="inbox" size="lg" className="text-fg-muted/50 mb-1" />
              <p>No local environments found in this folder.</p>
            </div>
          )}

          {localExports.length > 0 && (
            <div className="max-h-[320px] overflow-y-auto border border-line rounded-sm">
              {localExports.map((env) => (
                <article
                  key={env.filePath}
                  className={cn(
                    'flex items-center justify-between gap-2 px-2 py-1.5 border-b border-line last:border-b-0',
                    'hover:bg-bg-panel-2 transition-colors'
                  )}
                >
                  <div className="min-w-0">
                    <strong className="block text-[11px] font-medium text-fg truncate">{env.name}</strong>
                    <div className="font-mono text-[10px] text-fg-muted truncate">{env.rootDir}</div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void importEnvironmentFromFile(env.filePath)
                        .then(close)
                        .catch((error) => {
                          const message = error instanceof Error ? error.message : String(error);
                          addToast('error', `Failed to open environment: ${message}`);
                        });
                    }}
                  >
                    Open
                  </Button>
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="px-3 py-2 border-t border-line bg-bg-panel-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
        </footer>
      </section>
    </div>
  );
}
