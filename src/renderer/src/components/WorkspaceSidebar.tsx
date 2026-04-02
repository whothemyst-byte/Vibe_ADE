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

const SIDEBAR_STORAGE_KEY = 'vibeAde.sidebarCollapsed';

export function WorkspaceSidebar(): JSX.Element {
  const workspaces = useWorkspaceStore((s) => s.appState.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.appState.activeWorkspaceId);
  const subscriptionState = useWorkspaceStore((s) => s.appState.subscription);
  const taskBoardTabOpen = useWorkspaceStore((s) => s.ui.taskBoardTabOpen);
  const activeView = useWorkspaceStore((s) => s.ui.activeView);
  const activeSwarmId = useWorkspaceStore((s) => s.ui.activeSwarmId);
  const swarmSessions = useWorkspaceStore((s) => s.ui.swarmSessions);
  const sidebarCollapsed = useWorkspaceStore((s) => s.ui.sidebarCollapsed);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const openCreateFlow = useWorkspaceStore((s) => s.openCreateFlow);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const requestCloseWorkspace = useWorkspaceStore((s) => s.requestCloseWorkspace);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  const toggleTaskBoard = useWorkspaceStore((s) => s.toggleTaskBoard);
  const setActiveSwarmSession = useWorkspaceStore((s) => s.setActiveSwarmSession);
  const closeSwarmSession = useWorkspaceStore((s) => s.closeSwarmSession);
  const setSidebarCollapsed = useWorkspaceStore((s) => s.setSidebarCollapsed);
  const toggleSidebarCollapsed = useWorkspaceStore((s) => s.toggleSidebarCollapsed);

  const [context, setContext] = useState<ContextState | null>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);

  const sorted = useMemo(() => [...workspaces], [workspaces]);
  const taskBoardActive = taskBoardTabOpen && activeView === 'task-board';
  const swarmActiveId = activeView === 'swarm' ? activeSwarmId : null;
  const subscription = useMemo(() => normalizeSubscriptionState(subscriptionState), [subscriptionState]);
  const taskBoardLocked = !SUBSCRIPTION_PLANS[subscription.tier].features.taskBoard;

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === 'true') {
      setSidebarCollapsed(true);
    }
    if (stored === 'false') {
      setSidebarCollapsed(false);
    }
  }, [setSidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? 'true' : 'false');
  }, [sidebarCollapsed]);

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

  const sidebarClass = sidebarCollapsed ? 'workspace-sidebar collapsed' : 'workspace-sidebar';

  return (
    <aside className={sidebarClass} onClick={() => setContext(null)}>
      <div className="sidebar-header">
        {!sidebarCollapsed && (
          <span className="sidebar-title">Workspaces</span>
        )}
        <button
          className="sidebar-collapse"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={(event) => {
            event.stopPropagation();
            toggleSidebarCollapsed();
          }}
        >
          <UiIcon name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'} className="ui-icon" />
        </button>
      </div>

      <div className="sidebar-tabs">
        {sorted.map((workspace) => {
          const paneCount = collectPaneIds(workspace.layout).length;
          const active = workspace.id === activeWorkspaceId;
          return (
            <div
              key={workspace.id}
              className={active ? 'sidebar-tab-item active' : 'sidebar-tab-item'}
              onContextMenu={(event) => {
                event.preventDefault();
                setContext({ id: workspace.id, x: event.clientX, y: event.clientY });
              }}
            >
              <button
                className="sidebar-tab"
                title={workspace.name}
                onClick={() => void setActiveWorkspace(workspace.id)}
                onDoubleClick={() => beginRename(workspace.id)}
              >
                <span className="sidebar-tab-icon">
                  <UiIcon name="folder" className="ui-icon ui-icon-sm" />
                </span>
                {!sidebarCollapsed && (
                  <span className="sidebar-tab-content">
                    <span className="sidebar-tab-name">{workspace.name}</span>
                    <span className="sidebar-tab-count">{paneCount}</span>
                  </span>
                )}
              </button>
              {!sidebarCollapsed && (
                <button
                  className="sidebar-tab-close"
                  title="Close workspace"
                  onClick={() => void requestCloseWorkspace(workspace.id)}
                >
                  <UiIcon name="close" className="ui-icon ui-icon-sm" />
                </button>
              )}
            </div>
          );
        })}

        {swarmSessions.map((swarm) => {
          const active = swarm.swarmId === swarmActiveId;
          return (
            <div key={swarm.swarmId} className={active ? 'sidebar-tab-item active' : 'sidebar-tab-item'}>
              <button
                className="sidebar-tab"
                title={swarm.name || swarm.swarmId}
                onClick={() => setActiveSwarmSession(swarm.swarmId)}
              >
                <span className="sidebar-tab-icon">
                  <UiIcon name="terminal" className="ui-icon ui-icon-sm" />
                </span>
                {!sidebarCollapsed && (
                  <span className="sidebar-tab-content">
                    <span className="sidebar-tab-name">{swarm.name || swarm.swarmId}</span>
                  </span>
                )}
              </button>
              {!sidebarCollapsed && (
                <button
                  className="sidebar-tab-close"
                  title="Stop swarm"
                  onClick={() => void closeSwarmSession(swarm.swarmId)}
                >
                  <UiIcon name="close" className="ui-icon ui-icon-sm" />
                </button>
              )}
            </div>
          );
        })}

        {taskBoardTabOpen && (
          <div className={taskBoardActive ? 'sidebar-tab-item active' : 'sidebar-tab-item'}>
            <button className="sidebar-tab" onClick={() => toggleTaskBoard(true)} title="Task Board">
              <span className="sidebar-tab-icon">
                <UiIcon name="board" className="ui-icon ui-icon-sm" />
              </span>
              {!sidebarCollapsed && (
                <span className="sidebar-tab-content">
                  <span className="sidebar-tab-name">
                    Task Board
                    {taskBoardLocked && <UiIcon name="lock" className="ui-icon ui-icon-sm lock-icon" />}
                  </span>
                </span>
              )}
            </button>
            {!sidebarCollapsed && (
              <button
                className="sidebar-tab-close"
                title="Close task board"
                onClick={() => toggleTaskBoard(false)}
              >
                <UiIcon name="close" className="ui-icon ui-icon-sm" />
              </button>
            )}
          </div>
        )}

      </div>

      <button
        className="sidebar-add"
        onClick={(event) => {
          event.stopPropagation();
          openCreateFlow('choose');
        }}
        title="New..."
      >
        <UiIcon name="plus" className="ui-icon" />
        {!sidebarCollapsed && <span>New Workspace</span>}
      </button>

      <div className="sidebar-footer">
        <LayoutSelector
          showLabel={!sidebarCollapsed}
          className="layout-selector-sidebar"
          placement="right-start"
        />
        <button
          className={taskBoardActive ? 'top-button icon-top-button active' : 'top-button icon-top-button'}
          title="Task Board"
          aria-label="Task Board"
          onClick={() => toggleTaskBoard(true)}
        >
          <UiIcon name="board" className="ui-icon" />
          {!sidebarCollapsed && <span>Task Board</span>}
          {taskBoardLocked && <UiIcon name="lock" className="ui-icon ui-icon-sm lock-icon" />}
        </button>
        <button
          className="top-button icon-top-button"
          title="Settings"
          aria-label="Settings"
          onClick={() => openSettings('appearance')}
        >
          <UiIcon name="settings" className="ui-icon" />
          {!sidebarCollapsed && <span>Settings</span>}
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
    </aside>
  );
}
