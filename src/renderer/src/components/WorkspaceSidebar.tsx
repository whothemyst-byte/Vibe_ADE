import { useEffect, useMemo, useState } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import {
  applyAppearanceMode,
  getStoredAppearanceMode,
  resolveEffectiveTheme,
  setStoredAppearanceMode
} from '@renderer/theme/appearance';
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

const SIDEBAR_STORAGE_KEY = 'vibeAde.sidebarCollapsed';

type ViewMode = 'code' | 'tasks';

export function WorkspaceSidebar(): JSX.Element {
  const workspaces = useWorkspaceStore((s) => s.appState.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.appState.activeWorkspaceId);
  const activeView = useWorkspaceStore((s) => s.ui.activeView);
  const activeSwarmId = useWorkspaceStore((s) => s.ui.activeSwarmId);
  const swarmSessions = useWorkspaceStore((s) => s.ui.swarmSessions);
  const sidebarCollapsed = useWorkspaceStore((s) => s.ui.sidebarCollapsed);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const requestCloseWorkspace = useWorkspaceStore((s) => s.requestCloseWorkspace);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  const toggleTaskBoard = useWorkspaceStore((s) => s.toggleTaskBoard);
  const setActiveSwarmSession = useWorkspaceStore((s) => s.setActiveSwarmSession);
  const closeSwarmSession = useWorkspaceStore((s) => s.closeSwarmSession);
  const setSidebarCollapsed = useWorkspaceStore((s) => s.setSidebarCollapsed);

  const [context, setContext] = useState<ContextState | null>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);
  const [appearance, setAppearance] = useState(() => getStoredAppearanceMode());

  const recents = useMemo(
    () => [...workspaces].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    ),
    [workspaces]
  );

  const currentMode: ViewMode = activeView === 'task-board' ? 'tasks' : 'code';
  const swarmActiveId = activeView === 'swarm' ? activeSwarmId : null;

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === 'true') setSidebarCollapsed(true);
    if (stored === 'false') setSidebarCollapsed(false);
  }, [setSidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? 'true' : 'false');
  }, [sidebarCollapsed]);

  const beginRename = (id: string): void => {
    const workspace = workspaces.find((item) => item.id === id);
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
    const workspace = workspaces.find((item) => item.id === renameState.id);
    if (!workspace || trimmed === workspace.name) {
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

  const switchMode = (mode: ViewMode): void => {
    if (mode === 'tasks') {
      toggleTaskBoard(true);
      return;
    }
    toggleTaskBoard(false);
    useWorkspaceStore.setState((state) => ({
      ui: { ...state.ui, activeView: 'workspace' }
    }));
  };

  const toggleTheme = (): void => {
    const effective = resolveEffectiveTheme(appearance);
    const next = effective === 'dark' ? 'light' : 'dark';
    setStoredAppearanceMode(next);
    applyAppearanceMode(next);
    setAppearance(next);
  };

  const themeEffective = resolveEffectiveTheme(appearance);

  if (sidebarCollapsed) {
    return (
      <aside
        className="workspace-sidebar flex flex-col items-center gap-0.5 h-full min-h-0 bg-bg-panel border-r border-line w-[44px] py-2"
        onClick={() => setContext(null)}
      >
        <FlatIcon icon="code" title="Workspace" active={currentMode === 'code'} onClick={() => switchMode('code')} />
        <FlatIcon icon="checklist" title="TaskBoard" active={currentMode === 'tasks'} onClick={() => switchMode('tasks')} />
        <div className="flex-1" />
        <FlatIcon
          icon={themeEffective === 'dark' ? 'light_mode' : 'dark_mode'}
          title="Toggle theme"
          onClick={toggleTheme}
        />
        <FlatIcon icon="tune" title="Customize" onClick={() => openSettings('appearance')} />
      </aside>
    );
  }

  return (
    <aside
      className="workspace-sidebar flex flex-col h-full min-h-0 bg-bg-panel border-r border-line w-[220px]"
      onClick={() => setContext(null)}
    >
      <div className="flex items-center gap-1 px-2.5 pt-2.5 pb-2">
        <ViewSwitch
          icon="code"
          label="Workspace"
          active={currentMode === 'code'}
          onClick={() => switchMode('code')}
        />
        <ViewSwitch
          icon="checklist"
          label="TaskBoard"
          active={currentMode === 'tasks'}
          onClick={() => switchMode('tasks')}
        />
      </div>

      <div className="mt-1 px-3">
        <span className="text-[11px] font-medium text-fg-muted">Workspaces</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-1.5 pt-1 pb-2 flex flex-col gap-px">
        {recents.length === 0 && swarmSessions.length === 0 ? (
          <p className="px-2 py-3 text-[11px] text-fg-muted">No workspaces yet.</p>
        ) : (
          <>
            {recents.map((workspace) => {
              const active = workspace.id === activeWorkspaceId && activeView === 'workspace';
              return (
                <ListRow
                  key={workspace.id}
                  icon="folder"
                  label={workspace.name}
                  active={active}
                  onClick={() => void setActiveWorkspace(workspace.id)}
                  onDoubleClick={() => beginRename(workspace.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContext({ id: workspace.id, x: event.clientX, y: event.clientY });
                  }}
                  onClose={() => void requestCloseWorkspace(workspace.id)}
                />
              );
            })}
            {swarmSessions.map((swarm) => {
              const active = swarm.swarmId === swarmActiveId;
              return (
                <ListRow
                  key={swarm.swarmId}
                  icon="hub"
                  label={swarm.name || swarm.swarmId}
                  active={active}
                  onClick={() => setActiveSwarmSession(swarm.swarmId)}
                  onClose={() => void closeSwarmSession(swarm.swarmId)}
                />
              );
            })}
          </>
        )}
      </div>

      <footer className="border-t border-line px-1.5 py-1.5 flex items-center gap-1">
        <button
          type="button"
          onClick={() => openSettings('appearance')}
          className="flex-1 min-w-0 flex items-center gap-2 h-7 px-2 rounded-sm text-fg hover:bg-bg-panel-2 transition-colors"
          title="Customize"
        >
          <Icon name="tune" size="sm" className="text-fg-muted" />
          <span className="text-[12px] font-medium truncate text-left">Customize</span>
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          title={themeEffective === 'dark' ? 'Switch to light' : 'Switch to dark'}
          aria-label="Toggle theme"
          className="h-7 w-7 grid place-items-center rounded-sm text-fg-muted hover:text-fg hover:bg-bg-panel-2 transition-colors"
        >
          <Icon name={themeEffective === 'dark' ? 'light_mode' : 'dark_mode'} size="sm" />
        </button>
      </footer>

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
    </aside>
  );
}

interface FlatIconProps {
  icon: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

function FlatIcon({ icon, title, onClick, active, disabled }: FlatIconProps): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-7 w-7 grid place-items-center rounded-sm transition-colors',
        active
          ? 'bg-bg-panel-2 text-fg'
          : 'text-fg-muted hover:text-fg hover:bg-bg-panel-2',
        disabled && 'opacity-30 cursor-default hover:bg-transparent'
      )}
    >
      <Icon name={icon} size="sm" />
    </button>
  );
}

interface ViewSwitchProps {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

function ViewSwitch({ icon, label, active, onClick }: ViewSwitchProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'h-7 inline-flex items-center gap-1.5 rounded-md transition-colors',
        active
          ? 'px-2 bg-bg-panel-2 text-fg'
          : 'w-7 justify-center text-fg-muted hover:text-fg hover:bg-bg-panel-2'
      )}
    >
      <Icon name={icon} size="sm" />
      {active && <span className="text-[12px] font-medium">{label}</span>}
    </button>
  );
}

interface ListRowProps {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  onClose: () => void;
}

function ListRow({ icon, label, active, onClick, onDoubleClick, onContextMenu, onClose }: ListRowProps): JSX.Element {
  return (
    <div className="group relative flex items-center" onContextMenu={onContextMenu}>
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className={cn(
          'flex-1 min-w-0 h-7 px-2 flex items-center gap-2 rounded-sm text-[12px] transition-colors',
          active ? 'bg-bg-panel-2 text-fg' : 'text-fg-muted hover:text-fg hover:bg-bg-panel-2'
        )}
        title={label}
      >
        <Icon name={icon} size="sm" className={active ? 'text-fg' : 'text-fg-muted'} />
        <span className="flex-1 min-w-0 truncate text-left">{label}</span>
      </button>
      <button
        type="button"
        title="Close"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="absolute right-1 h-4 w-4 rounded-sm grid place-items-center opacity-0 group-hover:opacity-100 text-fg-muted hover:text-danger hover:bg-danger/10 transition-opacity"
      >
        <Icon name="close" size="xs" />
      </button>
    </div>
  );
}
