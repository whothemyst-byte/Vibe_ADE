import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { collectPaneIds } from '@renderer/services/layoutEngine';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';

type MenuId = 'file' | 'edit' | 'view' | 'terminal' | 'tasks' | 'swarm' | 'account' | 'help';

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
}

interface MenuDefinition {
  id: MenuId;
  label: string;
  items: MenuItem[];
}

export function AppMenuBar(): JSX.Element {
  const openStartPage = useWorkspaceStore((s) => s.openStartPage);
  const openCreateFlow = useWorkspaceStore((s) => s.openCreateFlow);
  const openEnvironmentOverlay = useWorkspaceStore((s) => s.openEnvironmentOverlay);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  const openSwarmDashboard = useWorkspaceStore((s) => s.openSwarmDashboard);
  const saveActiveWorkspace = useWorkspaceStore((s) => s.saveActiveWorkspace);
  const saveAsActiveWorkspace = useWorkspaceStore((s) => s.saveAsActiveWorkspace);
  const addPaneToLayout = useWorkspaceStore((s) => s.addPaneToLayout);
  const removePaneFromLayout = useWorkspaceStore((s) => s.removePaneFromLayout);
  const toggleTaskBoard = useWorkspaceStore((s) => s.toggleTaskBoard);
  const addTask = useWorkspaceStore((s) => s.addTask);
  const setTaskFilters = useWorkspaceStore((s) => s.setTaskFilters);
  const appState = useWorkspaceStore((s) => s.appState);

  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);

  const closeMenus = useCallback(() => setOpenMenu(null), []);

  useEffect(() => {
    if (!openMenu) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpenMenu(null);
      }
    };
    const onMouseDown = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.app-menu-bar')) {
        return;
      }
      setOpenMenu(null);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [openMenu]);

  const systemAction = (action: Parameters<typeof window.vibeAde.system.performMenuAction>[0]): (() => void) => {
    return () => {
      void window.vibeAde.system.performMenuAction(action);
    };
  };

  const activeWorkspace = useMemo(
    () => appState.workspaces.find((w) => w.id === appState.activeWorkspaceId),
    [appState.activeWorkspaceId, appState.workspaces]
  );
  const activePaneId = activeWorkspace?.activePaneId ?? null;
  const subscription = useMemo(() => normalizeSubscriptionState(appState.subscription), [appState.subscription]);
  const plan = SUBSCRIPTION_PLANS[subscription.tier];

  const withActivePane = (fn: (paneId: string) => void): (() => void) => {
    return () => {
      if (!activePaneId || !activeWorkspace) {
        return;
      }
      fn(activePaneId);
    };
  };

  const restartActiveSession = async (): Promise<void> => {
    if (!activePaneId || !activeWorkspace) {
      return;
    }
    const shell = activeWorkspace.paneShells[activePaneId];
    if (!shell) {
      return;
    }
    await window.vibeAde.terminal.stopSession(activePaneId);
    await window.vibeAde.terminal.startSession({
      workspaceId: activeWorkspace.id,
      paneId: activePaneId,
      shell,
      cwd: activeWorkspace.rootDir
    });
  };

  const closeAllPanes = async (): Promise<void> => {
    if (!activeWorkspace) {
      return;
    }
    const paneIds = collectPaneIds(activeWorkspace.layout);
    const keep = activeWorkspace.activePaneId ?? paneIds[0];
    for (const paneId of paneIds) {
      if (paneId === keep) {
        continue;
      }
      await removePaneFromLayout(paneId);
    }
  };

  const menus = useMemo<MenuDefinition[]>(
    () => {
      const next: MenuDefinition[] = [
      {
        id: 'file',
        label: 'File',
        items: [
          { label: 'New Workspace', shortcut: 'Ctrl+Shift+N', action: () => openCreateFlow('workspace') },
          { label: 'Open Workspace...', shortcut: 'Ctrl+O', action: () => openEnvironmentOverlay() },
          { label: 'Recent Workspaces', action: () => openStartPage('open') },
          { separator: true, label: 'sep-file-1' },
          { label: 'Save Layout', shortcut: 'Ctrl+S', action: () => void saveActiveWorkspace() },
          { label: 'Export Config...', action: () => void saveAsActiveWorkspace() },
          { label: 'Import Config...', action: () => openEnvironmentOverlay() },
          { separator: true, label: 'sep-file-2' },
          { label: 'Preferences', shortcut: 'Ctrl+,', action: () => openSettings() },
          { separator: true, label: 'sep-file-3' },
          { label: 'Exit', action: systemAction('quit') }
        ]
      },
      {
        id: 'edit',
        label: 'Edit',
        items: [
          { label: 'Undo', shortcut: 'Ctrl+Z', action: systemAction('undo') },
          { label: 'Redo', shortcut: 'Ctrl+Y', action: systemAction('redo') },
          { separator: true, label: 'sep-edit-1' },
          { label: 'Cut', shortcut: 'Ctrl+X', action: systemAction('cut') },
          { label: 'Copy', shortcut: 'Ctrl+C', action: systemAction('copy') },
          { label: 'Paste', shortcut: 'Ctrl+V', action: systemAction('paste') },
          { separator: true, label: 'sep-edit-2' },
          { label: 'Find in Terminal...', shortcut: 'Ctrl+F', disabled: true },
          { label: 'Clear Active Pane', shortcut: 'Ctrl+L', action: withActivePane((paneId) => void window.vibeAde.terminal.executeInSession(paneId, 'cls', true)) },
          { separator: true, label: 'sep-edit-3' },
          { label: 'Keyboard Shortcuts', action: () => openSettings() }
        ]
      },
      {
        id: 'view',
        label: 'View',
        items: [
          { label: 'Theme', action: () => openSettings() },
          { separator: true, label: 'sep-view-1' },
          { label: 'Pane Layout', disabled: true },
          { separator: true, label: 'sep-view-2' },
          { label: 'Reset Zoom', shortcut: 'Ctrl+0', action: systemAction('resetZoom') },
          { label: 'Zoom In', shortcut: 'Ctrl+=', action: systemAction('zoomIn') },
          { label: 'Zoom Out', shortcut: 'Ctrl+-', action: systemAction('zoomOut') },
          { separator: true, label: 'sep-view-3' },
          { label: 'Full Screen', shortcut: 'F11', action: systemAction('togglefullscreen') }
        ]
      },
      {
        id: 'terminal',
        label: 'Terminal',
        items: [
          { label: 'New Pane', shortcut: 'Ctrl+Shift+T', action: () => void addPaneToLayout() },
          { separator: true, label: 'sep-terminal-1' },
          { label: 'Set Working Dir...', disabled: true },
          { separator: true, label: 'sep-terminal-2' },
          { label: 'Kill Process', shortcut: 'Ctrl+C', action: withActivePane((paneId) => void window.vibeAde.terminal.sendInput(paneId, '\u0003')) },
          { label: 'Restart Session', action: () => void restartActiveSession() },
          { separator: true, label: 'sep-terminal-3' },
          { label: 'Close Pane', shortcut: 'Ctrl+W', action: withActivePane((paneId) => void removePaneFromLayout(paneId)) },
          { label: 'Close All Panes', action: () => void closeAllPanes() }
        ]
      },
      ...(plan.features.taskBoard
        ? [
            {
              id: 'tasks' as const,
              label: 'Tasks',
              items: [
                {
                  label: 'New Task...',
                  shortcut: 'Ctrl+N',
                  action: () => {
                    toggleTaskBoard(true);
                    void addTask('New task');
                  }
                },
                { separator: true, label: 'sep-tasks-1' },
                { label: 'View Board', action: () => toggleTaskBoard(true) },
                { label: 'Filter Tasks', action: () => toggleTaskBoard(true) },
                { separator: true, label: 'sep-tasks-2' },
                {
                  label: 'Archive Completed',
                  action: () => {
                    toggleTaskBoard(true);
                    setTaskFilters({ archived: true });
                  }
                },
                { label: 'Export Tasks...', disabled: true }
              ]
            }
          ]
        : []),
      ...(plan.features.swarms
        ? [
            {
              id: 'swarm' as const,
              label: 'Swarm',
              items: [
                { label: 'New Swarm...', action: () => openSwarmDashboard() },
                { separator: true, label: 'sep-swarm-1' },
                { label: 'Agent Dashboard', action: () => openSwarmDashboard() },
                { label: 'Activity Stream', disabled: true },
                { label: 'Logs & Alerts', disabled: true },
                { separator: true, label: 'sep-swarm-2' },
                { label: 'Pause All Agents', disabled: true },
                { label: 'Stop All Agents', disabled: true }
              ]
            }
          ]
        : []),
      {
        id: 'account',
        label: 'Account',
        items: [
          { label: 'Profile...', action: () => openSettings() },
          { separator: true, label: 'sep-account-1' },
          { label: 'Subscription', action: () => openSettings() },
          { label: 'Usage Dashboard', action: () => openSettings() },
          { label: 'Billing & Invoices', disabled: true },
          { separator: true, label: 'sep-account-2' },
          { label: 'Sign Out', action: () => void window.vibeAde.auth.logout().then(() => window.location.reload()) }
        ]
      },
      {
        id: 'help',
        label: 'Help',
        items: [
          { label: 'Documentation', shortcut: 'F1', disabled: true },
          { label: 'Keyboard Shortcuts', action: () => openSettings() },
          { label: "What's New", disabled: true },
          { label: 'Check for Updates...', action: () => void window.vibeAde.update.check() },
          { separator: true, label: 'sep-help-1' },
          { label: 'Send Feedback', disabled: true },
          { label: 'Report a Bug', disabled: true },
          { separator: true, label: 'sep-help-2' },
          { label: 'About Vibe-ADE', action: systemAction('about') }
        ]
      }
    ];
      return next;
    },
    [
      addPaneToLayout,
      addTask,
      appState.activeWorkspaceId,
      appState.subscription,
      appState.workspaces,
      closeAllPanes,
      openCreateFlow,
      openEnvironmentOverlay,
      openSettings,
      openStartPage,
      openSwarmDashboard,
      plan.features.swarms,
      plan.features.taskBoard,
      removePaneFromLayout,
      restartActiveSession,
      saveActiveWorkspace,
      saveAsActiveWorkspace,
      setTaskFilters,
      systemAction,
      toggleTaskBoard
    ]
  );

  return (
    <div className="app-menu-bar app-drag-region">
      {menus.map((menu) => (
        <div key={menu.id} className="app-menu-group">
          <button
            className={openMenu === menu.id ? 'app-menu-button active' : 'app-menu-button'}
            onClick={(event) => {
              event.stopPropagation();
              setOpenMenu((current) => (current === menu.id ? null : menu.id));
            }}
            onMouseEnter={() => {
              if (openMenu) {
                setOpenMenu(menu.id);
              }
            }}
          >
            {menu.label}
          </button>
          {openMenu === menu.id && (
            <div className="app-menu-popover" role="menu">
              {menu.items.map((item) =>
                item.separator ? (
                  <div key={item.label} className="app-menu-separator" />
                ) : (
                  <button
                    key={item.label}
                    className="app-menu-item"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      if (!item.disabled) {
                        item.action?.();
                      }
                      closeMenus();
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="app-menu-shortcut">{item.shortcut}</span>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
