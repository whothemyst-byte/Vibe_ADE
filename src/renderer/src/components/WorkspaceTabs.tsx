import { useMemo, useState } from 'react';
import { collectPaneIds } from '@renderer/services/layoutEngine';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
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
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
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
    <header className="top-nav" onClick={() => setContext(null)}>
      <div className="top-nav-left app-drag-region">
        <div className="brand-mark" aria-hidden="true">
          <UiIcon name="bolt" className="ui-icon ui-icon-lg" />
        </div>
        <div className="brand-text">Vibe-ADE</div>
      </div>

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
              <span className="workspace-tab-name">Task Board</span>
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
          onClick={() =>
            void createWorkspace({
              name: `Workspace ${sorted.length + 1}`,
              rootDir: 'C:\\'
            })
          }
          title="Create workspace"
        >
          <UiIcon name="plus" className="ui-icon" />
        </button>
      </div>

      <div className="top-nav-right">
        <LayoutSelector />
        <button
          className={ui.taskBoardTabOpen ? 'top-button active task-board-nav-button' : 'top-button task-board-nav-button'}
          title="Task Board"
          aria-label="Task Board"
          onClick={() => toggleTaskBoard(true)}
        >
          Task Board
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
    </header>
  );
}
