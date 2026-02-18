import { useMemo, useState } from 'react';
import { collectPaneIds } from '@renderer/services/layoutEngine';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { LayoutSelector } from './LayoutSelector';

interface ContextState {
  workspaceId: string;
  x: number;
  y: number;
}

interface RenameState {
  workspaceId: string;
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
  const toggleAgentPanel = useWorkspaceStore((s) => s.toggleAgentPanel);

  const [context, setContext] = useState<ContextState | null>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);

  const sorted = useMemo(() => [...appState.workspaces], [appState.workspaces]);
  const taskBoardActive = ui.taskBoardTabOpen && ui.activeView === 'task-board';

  const beginRename = (workspaceId: string): void => {
    const workspace = sorted.find((item) => item.id === workspaceId);
    if (!workspace) {
      return;
    }
    setRenameState({ workspaceId, value: workspace.name });
  };

  const submitRename = async (): Promise<void> => {
    if (!renameState) {
      return;
    }
    const workspace = sorted.find((item) => item.id === renameState.workspaceId);
    if (!workspace) {
      setRenameState(null);
      return;
    }
    const trimmed = renameState.value.trim();
    if (!trimmed || trimmed === workspace.name) {
      setRenameState(null);
      return;
    }
    try {
      await renameWorkspace(renameState.workspaceId, trimmed);
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
          {'\u26A1'}
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
                setContext({ workspaceId: workspace.id, x: event.clientX, y: event.clientY });
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
                {'\u2715'}
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
              {'\u2715'}
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
          {'\u002B'}
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
        <button
          className={ui.agentPanelOpen ? 'top-button active icon-top-button' : 'top-button icon-top-button'}
          title="Agent Panel"
          aria-label="Agent Panel"
          onClick={() => toggleAgentPanel()}
        >
          {'\uD83E\uDD16'}
        </button>
        <button className="top-button icon-top-button" title="Settings" aria-label="Settings" onClick={openSettings}>
          {'\u2699\uFE0F'}
        </button>
      </div>

      {context && (
        <div className="workspace-context-menu" style={{ left: context.x, top: context.y }} onClick={(event) => event.stopPropagation()}>
          <button
            onClick={() => {
              beginRename(context.workspaceId);
              setContext(null);
            }}
          >
            Rename
          </button>
          <button
            onClick={() => {
              void requestCloseWorkspace(context.workspaceId);
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
