import { useEffect, useMemo, useState } from 'react';
import { collectPaneIds } from '@renderer/services/layoutEngine';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { LayoutSelector } from './LayoutSelector';
import { UiIcon } from './UiIcon';

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
  const showUpdateButton =
    updateStatus.state === 'available'
    || updateStatus.state === 'downloading'
    || updateStatus.state === 'downloaded';
  const updateLabel =
    updateStatus.state === 'downloaded'
      ? 'Install Update'
      : updateStatus.state === 'downloading'
        ? `Downloading ${Math.round(updateStatus.progress ?? 0)}%`
        : 'Update Available';
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  useEffect(() => {
    if (updateStatus.state === 'available' && updateStatus.releaseNotes) {
      setShowReleaseNotes(true);
    }
  }, [updateStatus.state, updateStatus.releaseNotes]);

  const beginRename = (id: string): void => {
    const workspace = sorted.find((item) => item.id === id);
    if (!workspace) {
      return;
    }
    setRenameState({ id, value: workspace.name });
  };

  const submitRename = async (): Promise<void> => {
    if (!renameState) {
      return;
    }
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
    <header className="top-nav" onClick={() => {
      setContext(null);
    }}>
      <div className="top-nav-center app-drag-region">
        {sorted.map((workspace) => {
          const paneCount = collectPaneIds(workspace.layout).length;
          const active = workspace.id === appState.activeWorkspaceId;
          return (
            <div
              key={workspace.id}
              className={active ? 'workspace-tab-item active' : 'workspace-tab-item'}
              onContextMenu={(event) => {
                event.preventDefault();
                setContext({ id: workspace.id, x: event.clientX, y: event.clientY });
              }}
            >
              <button
                className="workspace-tab"
                onClick={() => void setActiveWorkspace(workspace.id)}
                onDoubleClick={() => beginRename(workspace.id)}
              >
                <span className="workspace-tab-name">{workspace.name}</span>
                <span className="workspace-tab-count">{paneCount}</span>
                {(ui.unsavedByWorkspace[workspace.id] ?? false) && <span className="workspace-dirty-dot">*</span>}
              </button>
              <button
                className="workspace-tab-close"
                title="Close workspace"
                onClick={() => void requestCloseWorkspace(workspace.id)}
              >
                <UiIcon name="close" className="ui-icon ui-icon-sm" />
              </button>
            </div>
          );
        })}

        {ui.swarmSessions.map((swarm) => {
          const active = swarm.swarmId === swarmActiveId;
          return (
            <div key={swarm.swarmId} className={active ? 'workspace-tab-item active' : 'workspace-tab-item'}>
              <button className="workspace-tab" onClick={() => setActiveSwarmSession(swarm.swarmId)}>
                <span className="workspace-tab-name">{swarm.name || swarm.swarmId}</span>
              </button>
              <button
                className="workspace-tab-close"
                title="Stop swarm"
                onClick={() => void closeSwarmSession(swarm.swarmId)}
              >
                <UiIcon name="close" className="ui-icon ui-icon-sm" />
              </button>
            </div>
          );
        })}
        {ui.taskBoardTabOpen && (
          <div className={taskBoardActive ? 'workspace-tab-item active' : 'workspace-tab-item'}>
            <button
              className="workspace-tab"
              onClick={() => toggleTaskBoard(true)}
            >
              <span className="workspace-tab-name">
                Task Board
                {taskBoardLocked && <UiIcon name="lock" className="ui-icon ui-icon-sm lock-icon" />}
              </span>
            </button>
            <button
              className="workspace-tab-close"
              title="Close task board"
              onClick={() => toggleTaskBoard(false)}
            >
              <UiIcon name="close" className="ui-icon ui-icon-sm" />
            </button>
          </div>
        )}
        <button
          className="top-button workspace-add-button"
          onClick={(event) => {
            event.stopPropagation();
            openCreateFlow('choose');
          }}
          title="New..."
        >
          <UiIcon name="plus" className="ui-icon" />
        </button>
      </div>

      <div className="top-nav-right">
        <LayoutSelector />
        {showUpdateButton && (
          <button
            className="top-button update-button"
            onClick={() => {
              if (updateStatus.state === 'downloaded') {
                void window.vibeAde.update.install();
                return;
              }
              if (updateStatus.state === 'available') {
                void window.vibeAde.update.download();
              }
            }}
            disabled={updateStatus.state === 'downloading'}
            title={updateLabel}
          >
            <UiIcon name="bolt" className="ui-icon ui-icon-sm" />
            {updateLabel}
          </button>
        )}
        <button
          className={ui.taskBoardTabOpen ? 'top-button active task-board-nav-button' : 'top-button task-board-nav-button'}
          title="Task Board"
          aria-label="Task Board"
          onClick={() => toggleTaskBoard(true)}
        >
          Task Board
          {taskBoardLocked && <UiIcon name="lock" className="ui-icon ui-icon-sm lock-icon" />}
        </button>
        <button className="top-button icon-top-button" title="Settings" aria-label="Settings" onClick={openSettings}>
          <UiIcon name="settings" className="ui-icon" />
        </button>
      </div>

      {context && (
        <div className="workspace-context-menu" style={{ left: context.x, top: context.y }} onClick={(event) => event.stopPropagation()}>
          <button
            onClick={() => {
              beginRename(context.id);
              setContext(null);
            }}
          >
            Rename
          </button>
          <button
            onClick={() => {
              void requestCloseWorkspace(context.id);
              setContext(null);
            }}
          >
            Close Workspace
          </button>
        </div>
      )}

      {renameState && (
        <div className="workspace-rename-overlay" onClick={() => setRenameState(null)}>
          <section className="workspace-rename-card" onClick={(event) => event.stopPropagation()}>
            <h4>Rename Environment</h4>
            <input
              value={renameState.value}
              onChange={(event) => setRenameState((prev) => (prev ? { ...prev, value: event.target.value } : prev))}
              autoFocus
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
            <div className="workspace-rename-actions">
              <button onClick={() => setRenameState(null)}>Cancel</button>
              <button className="primary" onClick={() => void submitRename()}>
                Save
              </button>
            </div>
          </section>
        </div>
      )}

      {showReleaseNotes && updateStatus.releaseNotes && (
        <div className="update-notes-overlay" onClick={() => setShowReleaseNotes(false)}>
          <section className="update-notes-card" onClick={(event) => event.stopPropagation()}>
            <header className="update-notes-header">
              <div>
                <h3>Update Available</h3>
                {updateStatus.version && <small>Version {updateStatus.version}</small>}
              </div>
              <button className="icon-only-button" onClick={() => setShowReleaseNotes(false)} aria-label="Close">
                <UiIcon name="close" className="ui-icon ui-icon-sm" />
              </button>
            </header>
            <div className="update-notes-body">
              <pre>{updateStatus.releaseNotes}</pre>
            </div>
            <footer className="update-notes-footer">
              <button onClick={() => setShowReleaseNotes(false)}>Later</button>
              <button
                className="primary"
                onClick={() => {
                  void window.vibeAde.update.download();
                  setShowReleaseNotes(false);
                }}
              >
                Download update
              </button>
            </footer>
          </section>
        </div>
      )}
    </header>
  );
}
