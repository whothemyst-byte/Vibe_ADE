import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceRun, WorkspaceState } from '@shared/types';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { getWorkspaceModelById, loadWorkspaceModels, resolveWorkspaceModelCommand } from '@renderer/services/preferences';
import { PaneLayout } from './PaneLayout';
import { Button, Icon, cn } from './ui';

interface WorkspaceChatViewProps {
  workspace: WorkspaceState;
}

const STATUS_STYLES: Record<string, string> = {
  starting: 'bg-primary/15 text-primary border-primary/30',
  running: 'bg-primary/15 text-primary border-primary/30',
  completed: 'bg-success/15 text-success border-success/30',
  failed: 'bg-danger/15 text-danger border-danger/30',
  cancelled: 'bg-warn/15 text-warn border-warn/30',
  queued: 'bg-bg-panel-2 text-fg-muted border-line'
};

function runStatusLabel(run: WorkspaceRun): string {
  return run.status ?? 'queued';
}

export function WorkspaceChatView({ workspace }: WorkspaceChatViewProps): JSX.Element {
  const [draft, setDraft] = useState('');
  const [modelVersion, setModelVersion] = useState(0);
  const [expandedRawRunId, setExpandedRawRunId] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const startWorkspaceChat = useWorkspaceStore((s) => s.startWorkspaceChat);
  const setChatTargetPane = useWorkspaceStore((s) => s.setChatTargetPane);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);
  const chatTargetPaneId = useWorkspaceStore(
    (s) => s.ui.chatTargetPaneByWorkspace[workspace.id] ?? workspace.activePaneId
  );
  const paneQueue = useWorkspaceStore((s) => s.ui.terminalRunQueueByPane[chatTargetPaneId]);
  const activeRunForPane = useWorkspaceStore((s) => s.ui.activeRunByPane[chatTargetPaneId] ?? null);
  const terminalPaneIds = useMemo(
    () =>
      Object.entries(workspace.paneTypes)
        .filter(([, type]) => type === 'terminal')
        .map(([paneId]) => paneId),
    [workspace.paneTypes]
  );
  const selectedModel = useMemo(
    () => getWorkspaceModelById(workspace.selectedModelId, loadWorkspaceModels()),
    [workspace.selectedModelId, modelVersion]
  );
  const targetTerminalPaneId = useMemo(
    () => (terminalPaneIds.includes(chatTargetPaneId) ? chatTargetPaneId : terminalPaneIds[0] ?? ''),
    [chatTargetPaneId, terminalPaneIds]
  );

  useEffect(() => {
    const onModelsChanged = () => setModelVersion((value) => value + 1);
    window.addEventListener('vibe-ade:workspace-models-changed', onModelsChanged);
    return () => window.removeEventListener('vibe-ade:workspace-models-changed', onModelsChanged);
  }, []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [workspace.runs.length, activeRunForPane, paneQueue?.length]);

  const activeModelLabel =
    selectedModel?.label ?? (workspace.selectedModelId ? workspace.selectedModelId : 'No model selected');
  const activeModelCommand = selectedModel ? resolveWorkspaceModelCommand(selectedModel.command, workspace) : '';
  const runItems = useMemo(
    () => [...workspace.runs].sort((a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime()),
    [workspace.runs]
  );

  const submit = async (): Promise<void> => {
    const message = draft.trim();
    if (!message || !selectedModel || !targetTerminalPaneId) return;
    setDraft('');
    if (workspace.activePaneId !== targetTerminalPaneId) {
      await setActivePane(targetTerminalPaneId);
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
    await startWorkspaceChat(workspace.id, {
      paneId: targetTerminalPaneId,
      message,
      modelId: selectedModel.id
    });
  };

  return (
    <section className="relative flex-1 flex flex-col overflow-hidden bg-bg-page">
      <header className="flex items-center justify-between gap-2 px-2.5 h-7 border-b border-line bg-bg-panel">
        <div className="min-w-0 flex items-baseline gap-2">
          <h2 className="text-xs font-medium text-fg truncate">{workspace.name}</h2>
          <p className="font-mono text-[10px] text-fg-muted truncate">{workspace.rootDir}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <div
            className="inline-flex items-center gap-1 px-1.5 h-5 rounded-sm border border-line bg-bg-panel-2 text-[11px]"
            title={selectedModel?.command ?? 'No model selected'}
          >
            <Icon name="terminal" size="xs" className="text-primary" />
            <span className="font-medium text-fg">{activeModelLabel}</span>
          </div>
          <div className="inline-flex items-center gap-1 px-1.5 h-5 rounded-sm border border-line bg-bg-panel-2">
            <span className="text-[10px] uppercase tracking-wider text-fg-muted">Send</span>
            <select
              value={targetTerminalPaneId}
              disabled={terminalPaneIds.length === 0}
              onChange={(event) => setChatTargetPane(workspace.id, event.target.value)}
              className="bg-transparent text-[11px] text-fg focus:outline-none cursor-pointer disabled:opacity-50"
            >
              {terminalPaneIds.length === 0 ? (
                <option value="">No terminals</option>
              ) : (
                terminalPaneIds.map((paneId, index) => (
                  <option key={paneId} value={paneId} className="bg-bg-panel">
                    Terminal {index + 1}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        <div ref={feedRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {runItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-8">
              <Icon name="chat_bubble_outline" size="lg" className="text-fg-muted mb-2" />
              <strong className="text-xs font-medium text-fg">Ask the workspace to do work.</strong>
              <p className="mt-1 max-w-xs text-[11px] text-fg-muted leading-snug">
                Each request becomes a run with deterministic lifecycle markers and raw terminal logs.
              </p>
            </div>
          ) : (
            runItems.map((run) => {
              const statusKey = runStatusLabel(run);
              return (
                <article
                  key={run.id}
                  className="bg-bg-panel border border-line rounded-sm overflow-hidden"
                >
                  <div className="flex items-center flex-wrap gap-2 px-3 py-2.5 border-b border-line bg-bg-panel-2/30">
                    <strong className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-muted">Run</strong>
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider',
                        STATUS_STYLES[statusKey] ?? STATUS_STYLES.queued
                      )}
                    >
                      {statusKey}
                    </span>
                    <small className="font-mono text-[10px] text-fg-muted">{run.modelId}</small>
                    <small className="font-mono text-[10px] text-fg-muted">Pane {run.paneId.slice(0, 4)}</small>
                  </div>
                  <pre className="px-3 py-3 text-xs text-fg leading-relaxed whitespace-pre-wrap break-words font-mono border-b border-line">
                    {run.prompt}
                  </pre>
                  <div className="flex items-center flex-wrap gap-2 px-3 py-2.5 border-b border-line bg-bg-panel-2/30">
                    <strong className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                      Assistant
                    </strong>
                    {run.degraded && (
                      <span className="px-1.5 py-0.5 rounded-md border border-warn/30 bg-warn/10 text-warn text-[10px] font-semibold uppercase">
                        degraded parser
                      </span>
                    )}
                    {run.failureReason && <small className="text-[10px] text-danger">{run.failureReason}</small>}
                  </div>
                  <pre className="px-3 py-3 text-xs text-fg leading-relaxed whitespace-pre-wrap break-words font-mono">
                    {run.assistantContent ||
                      (run.status === 'queued'
                        ? 'Queued...'
                        : run.status === 'running' || run.status === 'starting'
                          ? 'Processing...'
                          : 'No output')}
                  </pre>
                  <div className="px-3 py-2 border-t border-line bg-bg-panel-2/30">
                    <button
                      type="button"
                      className="text-[11px] font-medium text-primary hover:underline"
                      onClick={() => setExpandedRawRunId((current) => (current === run.id ? null : run.id))}
                    >
                      {expandedRawRunId === run.id ? 'Hide raw terminal log' : 'Show raw terminal log'}
                    </button>
                  </div>
                  {expandedRawRunId === run.id && (
                    <pre className="px-3 py-3 text-[11px] text-fg-muted leading-relaxed whitespace-pre-wrap break-words font-mono bg-bg-page/60 border-t border-line max-h-[280px] overflow-auto">
                      {run.rawOutput || '(no raw output yet)'}
                    </pre>
                  )}
                </article>
              );
            })
          )}
        </div>

        <footer className="px-2.5 py-2 border-t border-line bg-bg-panel">
          <div className="bg-bg-panel-2 border border-line rounded-sm p-1.5">
            <textarea
              value={draft}
              placeholder={selectedModel ? `Message ${selectedModel.label}...` : 'Enable a model in Settings first'}
              disabled={!selectedModel}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              className="w-full min-h-[60px] max-h-[200px] resize-none bg-transparent text-sm text-fg placeholder:text-fg-muted focus:outline-none p-2 font-sans leading-relaxed disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-3 px-2 pt-2 border-t border-line">
              <div className="min-w-0">
                <span className="block font-mono text-[10px] text-fg-muted truncate">
                  {activeModelCommand || 'Select a model in Settings'}
                </span>
                <small className="text-[10px] text-fg-muted uppercase tracking-wider">
                  {workspace.workspaceMode === 'chat' ? 'Chat mode' : 'Terminals mode'}
                </small>
              </div>
              <Button
                variant="primary"
                disabled={!draft.trim() || !selectedModel}
                onClick={() => void submit()}
                leftIcon={<Icon name="send" size="sm" />}
                glow
              >
                Send
              </Button>
            </div>
          </div>
        </footer>
      </div>

      <div className="absolute inset-0 pointer-events-none opacity-0" aria-hidden="true">
        <PaneLayout workspace={workspace} />
      </div>
    </section>
  );
}
