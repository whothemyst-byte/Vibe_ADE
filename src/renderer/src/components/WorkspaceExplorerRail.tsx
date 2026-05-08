import { useEffect, useMemo, useState } from 'react';
import type { WorkspaceState } from '@shared/types';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { getWorkspaceModelById, loadWorkspaceModels } from '@renderer/services/preferences';
import { Icon, cn } from './ui';

interface WorkspaceExplorerRailProps {
  workspace: WorkspaceState;
  mode: 'chat' | 'terminals';
}

export function WorkspaceExplorerRail({ workspace, mode }: WorkspaceExplorerRailProps): JSX.Element {
  const [modelVersion, setModelVersion] = useState(0);
  const setWorkspaceMode = useWorkspaceStore((s) => s.setWorkspaceMode);
  const setChatTargetPane = useWorkspaceStore((s) => s.setChatTargetPane);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);
  const chatTargetPaneId = useWorkspaceStore(
    (s) => s.ui.chatTargetPaneByWorkspace[workspace.id] ?? workspace.activePaneId
  );
  const activeRunByPane = useWorkspaceStore((s) => s.ui.activeRunByPane);
  const runQueueByPane = useWorkspaceStore((s) => s.ui.terminalRunQueueByPane);
  const terminalReadyByPane = useWorkspaceStore((s) => s.ui.terminalReadyByPane);

  const model = useMemo(
    () => getWorkspaceModelById(workspace.selectedModelId, loadWorkspaceModels()),
    [workspace.selectedModelId, modelVersion]
  );

  useEffect(() => {
    const onModelsChanged = () => setModelVersion((value) => value + 1);
    window.addEventListener('vibe-ade:workspace-models-changed', onModelsChanged);
    return () => window.removeEventListener('vibe-ade:workspace-models-changed', onModelsChanged);
  }, []);

  const terminalPaneIds = useMemo(
    () =>
      Object.entries(workspace.paneTypes)
        .filter(([, paneType]) => paneType === 'terminal')
        .map(([paneId]) => paneId),
    [workspace.paneTypes]
  );

  const terminalCardLabel = (paneId: string): string => {
    const activeRunId = activeRunByPane[paneId];
    const queueLength = runQueueByPane[paneId]?.length ?? 0;
    const activeRun = activeRunId ? workspace.runs.find((run) => run.id === activeRunId) : undefined;
    if (chatTargetPaneId === paneId) {
      return activeRun ? `Target · ${activeRun.status}` : 'Target';
    }
    if (activeRun) return activeRun.status;
    if (queueLength > 0) return `Queue ${queueLength}`;
    return 'Idle';
  };

  return (
    <aside className="flex flex-col w-60 border-r border-line bg-bg-panel overflow-hidden">
      <div className="px-2 pt-2 pb-1.5 border-b border-line">
        <div className="text-[10px] font-medium uppercase tracking-wider text-fg-muted">Terminals</div>
        <div className="mt-1.5 flex p-0.5 bg-bg-panel-2 border border-line rounded-sm">
          {(['chat', 'terminals'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={cn(
                'flex-1 h-5 text-[10px] font-medium rounded-sm transition-colors capitalize',
                mode === m ? 'bg-bg-elev text-fg' : 'text-fg-muted hover:text-fg'
              )}
              onClick={() => void setWorkspaceMode(workspace.id, m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <section className="px-2 py-1.5 border-b border-line space-y-1">
        <Row label="Model" value={<strong className="text-xs text-fg">{model?.label ?? 'None selected'}</strong>} />
        <Row
          label="Command"
          value={
            <code className="font-mono text-[10px] text-fg-muted truncate max-w-[140px]">
              {model?.command ?? 'N/A'}
            </code>
          }
        />
        <Row
          label="Chat Target"
          value={
            <strong className="text-xs text-fg">
              {chatTargetPaneId ? `Pane ${chatTargetPaneId.slice(0, 4)}` : 'None'}
            </strong>
          }
        />
      </section>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {terminalPaneIds.length === 0 ? (
          <div className="text-center py-8 text-[11px] text-fg-muted">No terminals in this layout.</div>
        ) : (
          terminalPaneIds.map((paneId, index) => {
            const isTarget = chatTargetPaneId === paneId;
            const isActive = workspace.activePaneId === paneId;
            return (
              <button
                type="button"
                key={paneId}
                className={cn(
                  'w-full text-left p-2 rounded-sm border transition-colors',
                  isTarget
                    ? 'border-primary bg-primary/10'
                    : 'border-line bg-bg-panel-2 hover:border-line-strong'
                )}
                onClick={() => {
                  setChatTargetPane(workspace.id, paneId);
                  void setActivePane(paneId);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon name="terminal" size="xs" className={isTarget ? 'text-primary' : 'text-fg-muted'} />
                    <strong className="text-xs font-semibold text-fg truncate">Terminal {index + 1}</strong>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider',
                      isTarget
                        ? 'bg-primary/20 text-primary'
                        : 'bg-bg-panel text-fg-muted border border-line'
                    )}
                  >
                    {terminalCardLabel(paneId)}
                  </span>
                </div>
                <div className="mt-2 space-y-0.5 text-[10px] text-fg-muted">
                  <div>{workspace.paneShells[paneId] ?? 'powershell'}</div>
                  <div>{terminalReadyByPane[paneId] ? 'Harness ready' : 'Waiting for terminal session'}</div>
                  <div>{isActive ? 'Active pane' : 'Background pane'}</div>
                  <div>{model?.label ?? 'CLI pending'}</div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: JSX.Element }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wider text-fg-muted">{label}</span>
      {value}
    </div>
  );
}
