import { useEffect, useMemo, useState } from 'react';
import { collectPaneIds } from '@renderer/services/layoutEngine';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { LayoutSelector } from './LayoutSelector';
import { Icon, Button, Input, cn } from './ui';

interface ContextState {
  id: string;
  x: number;
  y: number;
}

interface RenameState {
  id: string;
  value: string;
}

export function WorkspaceTabs(): JSX.Element {
  const appState = useWorkspaceStore((s) => s.appState);
  const ui = useWorkspaceStore((s) => s.ui);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const openCreateFlow = useWorkspaceStore((s) => s.openCreateFlow);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const requestCloseWorkspace = useWorkspaceStore((s) => s.requestCloseWorkspace);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  const toggleTaskBoard = useWorkspaceStore((s) => s.toggleTaskBoard);
  const setActiveSwarmSession = useWorkspaceStore((s) => s.setActiveSwarmSession);
  const closeSwarmSession = useWorkspaceStore((s) => s.closeSwarmSession);

  const [context, setContext] = useState<ContextState | null>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);

  const sorted = useMemo(() => [...appState.workspaces], [appState.workspaces]);
  const taskBoardActive = ui.taskBoardTabOpen && ui.activeView === 'task-board';
  const swarmActiveId = ui.activeView === 'swarm' ? ui.activeSwarmId : null;
  const subscription = useMemo(() => normalizeSubscriptionState(appState.subscription), [appState.subscription]);
  const taskBoardLocked = !SUBSCRIPTION_PLANS[subscription.tier].features.taskBoard;
  const updateStatus = ui.updateStatus;
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  useEffect(() => {
    if (updateStatus.state === 'available' && updateStatus.releaseNotes) {
      setShowReleaseNotes(true);
    }
  }, [updateStatus.state, updateStatus.releaseNotes]);

  const beginRename = (id: string): void => {
    const workspace = sorted.find((item) => item.id === id);
    if (!workspace) return;
    setRenameState({ id, value: workspace.name });
  };

  const submitRename = async (): Promise<void> => {
    if (!renameState) return;
    const trimmed = renameState.value.trim();
    if (!trimmed) {
      setRenameState(null);
      return;
    }
    const workspace = sorted.find((item) => item.id === renameState.id);
    if (!workspace) {
      setRenameState(null);
      return;
    }
    if (trimmed === workspace.name) {
      setRenameState(null);
      return;
    }
    try {
      await renameWorkspace(renameState.id, trimmed);
    } catch (error) {
      console.error('Failed to rename workspace:', error);
      return;
    }
    setRenameState(null);
  };

  return (
    <header
      className="flex items-center gap-1 h-8 px-1.5 bg-bg-header border-b border-line"
      onClick={() => setContext(null)}
    >
      {/* Tabs */}
      <div className="flex-1 min-w-0 flex items-center gap-0 overflow-x-auto app-drag-region">
        {sorted.map((workspace) => {
          const paneCount = collectPaneIds(workspace.layout).length;
          const active = workspace.id === appState.activeWorkspaceId;
          const dirty = ui.unsavedByWorkspace[workspace.id] ?? false;
          return (
            <Tab
              key={workspace.id}
              active={active}
              onContextMenu={(event) => {
                event.preventDefault();
                setContext({ id: workspace.id, x: event.clientX, y: event.clientY });
              }}
              onClick={() => void setActiveWorkspace(workspace.id)}
              onDoubleClick={() => beginRename(workspace.id)}
              onClose={() => void requestCloseWorkspace(workspace.id)}
              label={workspace.name}
              trailing={
                <>
                  <span
                    className={cn(
                      'text-[10px] font-medium px-1 h-3.5 grid place-items-center rounded-sm',
                      active ? 'bg-primary/20 text-primary' : 'bg-bg-panel-2 text-fg-muted'
                    )}
                  >
                    {paneCount}
                  </span>
                  {dirty && <span className="text-primary text-sm leading-none">•</span>}
                </>
              }
            />
          );
        })}

        {ui.swarmSessions.map((swarm) => {
          const active = swarm.swarmId === swarmActiveId;
          return (
            <Tab
              key={swarm.swarmId}
              active={active}
              accent
              icon="hub"
              onClick={() => setActiveSwarmSession(swarm.swarmId)}
              onClose={() => void closeSwarmSession(swarm.swarmId)}
              label={swarm.name || swarm.swarmId}
            />
          );
        })}

        {ui.taskBoardTabOpen && (
          <Tab
            active={taskBoardActive}
            icon="dashboard"
            onClick={() => toggleTaskBoard(true)}
            onClose={() => toggleTaskBoard(false)}
            label="Task Board"
            trailing={taskBoardLocked ? <Icon name="lock" size="xs" className="text-warn" /> : undefined}
          />
        )}

        <button
          type="button"
          className="ml-0.5 h-6 w-6 rounded-sm grid place-items-center text-fg-muted hover:text-primary hover:bg-primary/10 transition-colors"
          onClick={(event) => {
            event.stopPropagation();
            openCreateFlow('choose');
          }}
          title="New..."
          aria-label="New workspace"
        >
          <Icon name="add" size="xs" />
        </button>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-0.5">
        <LayoutSelector />
        <button
          type="button"
          className={cn(
            'h-6 px-2 rounded-sm text-[11px] font-medium flex items-center gap-1 transition-colors',
            ui.taskBoardTabOpen
              ? 'bg-primary/15 text-primary'
              : 'text-fg-muted hover:text-fg hover:bg-bg-panel-2'
          )}
          title="Task Board"
          onClick={() => toggleTaskBoard(true)}
        >
          <Icon name="dashboard" size="xs" />
          Task Board
          {taskBoardLocked && <Icon name="lock" size="xs" className="text-warn" />}
        </button>
        <IconButton icon="settings" label="Settings" onClick={() => openSettings('appearance')} />
      </div>

      {context && (
        <div
          className="fixed z-50 min-w-[160px] bg-bg-panel border border-line rounded shadow-premium overflow-hidden p-0.5 text-[11px]"
          style={{ left: context.x, top: context.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="w-full text-left px-2 py-1 rounded-sm hover:bg-bg-panel-2 text-fg transition-colors flex items-center gap-1.5"
            onClick={() => {
              beginRename(context.id);
              setContext(null);
            }}
          >
            <Icon name="edit" size="xs" /> Rename
          </button>
          <button
            className="w-full text-left px-2 py-1 rounded-sm hover:bg-bg-panel-2 text-danger transition-colors flex items-center gap-1.5"
            onClick={() => {
              void requestCloseWorkspace(context.id);
              setContext(null);
            }}
          >
            <Icon name="close" size="xs" /> Close Workspace
          </button>
        </div>
      )}

      {renameState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setRenameState(null)}
        >
          <section
            className="w-full max-w-xs bg-bg-panel border border-line rounded shadow-premium"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="px-3 h-7 border-b border-line bg-bg-panel-2 flex items-center">
              <h4 className="text-xs font-medium text-fg">Rename Environment</h4>
            </header>
            <div className="p-3">
              <Input
                value={renameState.value}
                onChange={(event) =>
                  setRenameState((prev) => (prev ? { ...prev, value: event.target.value } : prev))
                }
                autoFocus
                leftIcon={<Icon name="edit" size="xs" />}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void submitRename();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setRenameState(null);
                  }
                }}
              />
            </div>
            <footer className="px-3 py-2 border-t border-line bg-bg-panel-2 flex items-center justify-end gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setRenameState(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={() => void submitRename()}>
                Save
              </Button>
            </footer>
          </section>
        </div>
      )}

      {showReleaseNotes && updateStatus.releaseNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowReleaseNotes(false)}
        >
          <section
            className="w-full max-w-md bg-bg-panel border border-line rounded shadow-premium overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="px-3 h-8 border-b border-line bg-bg-panel-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="system_update" size="sm" className="text-primary" />
                <h3 className="text-xs font-medium text-fg">Update Available</h3>
                {updateStatus.version && (
                  <span className="text-[11px] text-fg-muted">· {updateStatus.version}</span>
                )}
              </div>
              <button
                className="h-5 w-5 rounded-sm grid place-items-center text-fg-muted hover:text-fg hover:bg-bg-elev transition-colors"
                onClick={() => setShowReleaseNotes(false)}
                aria-label="Close"
              >
                <Icon name="close" size="xs" />
              </button>
            </header>
            <div className="px-3 py-3 max-h-[50vh] overflow-y-auto">
              <pre className="text-[11px] text-fg-muted font-mono whitespace-pre-wrap leading-snug">
                {updateStatus.releaseNotes}
              </pre>
            </div>
            <footer className="px-3 py-2 border-t border-line bg-bg-panel-2 flex items-center justify-end gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setShowReleaseNotes(false)}>
                Later
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  void window.vibeAde.update.download();
                  setShowReleaseNotes(false);
                }}
                leftIcon={<Icon name="download" size="xs" />}
              >
                Download
              </Button>
            </footer>
          </section>
        </div>
      )}
    </header>
  );
}

interface TabProps {
  active: boolean;
  label: string;
  icon?: string;
  accent?: boolean;
  trailing?: React.ReactNode;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  onClose: () => void;
}

function Tab({ active, label, icon, trailing, onClick, onDoubleClick, onContextMenu, onClose }: TabProps): JSX.Element {
  return (
    <div
      className={cn(
        'group relative shrink-0 flex items-center border-r border-line transition-colors',
        active
          ? 'bg-bg-panel text-fg'
          : 'bg-bg-header text-fg-muted hover:text-fg hover:bg-bg-panel-2'
      )}
      onContextMenu={onContextMenu}
    >
      {active && <span className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />}
      <button
        type="button"
        className="h-7 pl-2.5 pr-1.5 flex items-center gap-1.5 text-[11px] font-medium"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        title={label}
      >
        {icon && <Icon name={icon} size="xs" className={active ? 'text-primary' : ''} />}
        <span className="max-w-[140px] truncate">{label}</span>
        {trailing}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        title="Close"
        className="mr-1 h-4 w-4 rounded-sm grid place-items-center text-fg-muted hover:text-danger hover:bg-danger/10 transition-colors opacity-60 group-hover:opacity-100"
      >
        <Icon name="close" size="xs" />
      </button>
    </div>
  );
}

interface IconButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
}

function IconButton({ icon, label, onClick }: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="h-6 w-6 rounded-sm grid place-items-center text-fg-muted hover:text-fg hover:bg-bg-panel-2 transition-colors"
    >
      <Icon name={icon} size="xs" />
    </button>
  );
}
