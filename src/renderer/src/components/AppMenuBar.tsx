import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { collectPaneIds } from '@renderer/services/layoutEngine';
import { LAYOUT_PRESETS } from '@renderer/services/layoutPresets';
import { applyAppearanceMode, getStoredAppearanceMode, setStoredAppearanceMode, type AppearanceMode } from '@renderer/theme/appearance';
import { THEME_LABELS, THEME_ORDER } from '@renderer/theme/theme';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';

type MenuId = 'file' | 'edit' | 'view' | 'terminal' | 'tasks' | 'swarm' | 'account' | 'help';

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
  children?: MenuItem[];
}

interface MenuDefinition {
  id: MenuId;
  label: string;
  items: MenuItem[];
}

export function AppMenuBar(): JSX.Element {
  const openCreateFlow = useWorkspaceStore((s) => s.openCreateFlow);
  const openEnvironmentOverlay = useWorkspaceStore((s) => s.openEnvironmentOverlay);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  const openSwarmDashboard = useWorkspaceStore((s) => s.openSwarmDashboard);
  const saveActiveWorkspace = useWorkspaceStore((s) => s.saveActiveWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const addPaneToLayout = useWorkspaceStore((s) => s.addPaneToLayout);
  const removePaneFromLayout = useWorkspaceStore((s) => s.removePaneFromLayout);
  const toggleTaskBoard = useWorkspaceStore((s) => s.toggleTaskBoard);
  const addTask = useWorkspaceStore((s) => s.addTask);
  const toggleTaskFilters = useWorkspaceStore((s) => s.toggleTaskFilters);
  const setLayoutPreset = useWorkspaceStore((s) => s.setLayoutPreset);
  const requestTerminalFind = useWorkspaceStore((s) => s.requestTerminalFind);
  const exportTasks = useWorkspaceStore((s) => s.exportTasks);
  const archiveCompletedTasks = useWorkspaceStore((s) => s.archiveCompletedTasks);
  const updateStatus = useWorkspaceStore((s) => s.ui.updateStatus);
  const addToast = useToastStore((s) => s.addToast);
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
  const recentWorkspaces = useMemo(() => {
    return [...appState.workspaces].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [appState.workspaces]);
  const appearanceMode = getStoredAppearanceMode();

  const withActivePane = (fn: (paneId: string) => void): (() => void) => {
    return () => {
      if (!activePaneId || !activeWorkspace) {
        return;
      }
      fn(activePaneId);
    };
  };

  const setWorkingDirectory = async (): Promise<void> => {
    if (!activePaneId || !activeWorkspace) {
      return;
    }
    const selected = await window.vibeAde.system.selectDirectory();
    if (!selected) {
      return;
    }
    const shell = activeWorkspace.paneShells[activePaneId];
    const command =
      shell === 'powershell'
        ? `Set-Location -LiteralPath "${selected.replace(/"/g, '""')}"`
        : `cd /d "${selected.replace(/"/g, '""')}"`;
    await window.vibeAde.terminal.executeInSession(activePaneId, command, true);
  };

  const findInTerminal = (): void => {
    const query = window.prompt('Find in terminal:');
    if (!query) {
      return;
    }
    requestTerminalFind(query);
  };

  const setAppearance = (mode: AppearanceMode): void => {
    setStoredAppearanceMode(mode);
    applyAppearanceMode(mode);
  };

  const openExternal = (url: string): (() => void) => {
    return () => {
      void window.vibeAde.system.openExternal(url);
    };
  };

  const checkForUpdates = (): void => {
    void window.vibeAde.update.check();
    setTimeout(() => {
      const status = useWorkspaceStore.getState().ui.updateStatus;
      if (status.state === 'not-available') {
        addToast('success', 'You are up to date.');
      }
      if (status.state === 'error') {
        addToast('error', status.error ?? 'Update check failed');
      }
    }, 1200);
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
      const recentWorkspaceItems: MenuItem[] =
        recentWorkspaces.length === 0
          ? [{ label: 'No recent workspaces', disabled: true }]
          : recentWorkspaces.map((workspace) => ({
              label: workspace.name,
              action: () => void setActiveWorkspace(workspace.id),
              disabled: workspace.id === activeWorkspace?.id
            }));

      const themeMenuItems: MenuItem[] = THEME_ORDER.map((themeId) => ({
        label: THEME_LABELS[themeId],
        action: () => setAppearance(themeId as AppearanceMode),
        disabled: appearanceMode === themeId
      }));

      const layoutMenuItems: MenuItem[] = LAYOUT_PRESETS.map((preset) => ({
        label: preset.label,
        action: () => setLayoutPreset(preset.id),
        disabled: subscription.tier === 'spark' && preset.slots > 4
      }));

      const next: MenuDefinition[] = [
      {
        id: 'file',
        label: 'File',
        items: [
          { label: 'New Workspace', shortcut: 'Ctrl+Shift+N', action: () => openCreateFlow('workspace') },
          { label: 'Open Workspace...', shortcut: 'Ctrl+O', action: () => openEnvironmentOverlay() },
          { label: 'Recent Workspaces', children: recentWorkspaceItems },
          { separator: true, label: 'sep-file-1' },
          { label: 'Save Layout', shortcut: 'Ctrl+S', action: () => void saveActiveWorkspace() },
          { separator: true, label: 'sep-file-2' },
          { label: 'Preferences', shortcut: 'Ctrl+,', action: () => openSettings('appearance') },
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
          { label: 'Find in Terminal...', shortcut: 'Ctrl+F', action: () => findInTerminal() },
          { label: 'Clear Active Pane', shortcut: 'Ctrl+L', action: withActivePane((paneId) => void window.vibeAde.terminal.executeInSession(paneId, 'cls', true)) },
          { separator: true, label: 'sep-edit-3' },
          { label: 'Keyboard Shortcuts', action: () => openSettings('shortcuts') }
        ]
      },
      {
        id: 'view',
        label: 'View',
        items: [
          { label: 'Theme', children: themeMenuItems },
          { separator: true, label: 'sep-view-1' },
          { label: 'Pane Layout', children: layoutMenuItems },
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
          { label: 'Set Working Dir...', action: () => void setWorkingDirectory() },
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
                { label: 'Filter Tasks', action: () => {
                  toggleTaskBoard(true);
                  toggleTaskFilters(true);
                } },
                { separator: true, label: 'sep-tasks-2' },
                {
                  label: 'Archive Completed',
                  action: () => {
                    toggleTaskBoard(true);
                    void archiveCompletedTasks();
                  }
                },
                { label: 'Export Tasks...', action: () => void exportTasks() }
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
                { label: 'Activity Stream', action: () => openSwarmDashboard() },
                { label: 'Logs & Alerts', action: () => openSwarmDashboard() },
                { separator: true, label: 'sep-swarm-2' },
                { label: 'Pause All Agents', action: () => openSwarmDashboard() },
                { label: 'Stop All Agents', action: () => openSwarmDashboard() }
              ]
            }
          ]
        : []),
      {
        id: 'account',
        label: 'Account',
        items: [
          { label: 'Profile...', action: () => openSettings('account') },
          { separator: true, label: 'sep-account-1' },
          { label: 'Subscription', action: () => openSettings('account') },
          { label: 'Usage Dashboard', action: () => openSettings('account') },
          { label: 'Billing & Invoices', action: openExternal('https://website-opal-seven-61.vercel.app/#pricing') },
          { separator: true, label: 'sep-account-2' },
          { label: 'Sign Out', action: () => void window.vibeAde.auth.logout().then(() => window.location.reload()) }
        ]
      },
      {
        id: 'help',
        label: 'Help',
        items: [
          { label: 'Documentation', shortcut: 'F1', action: openExternal('https://website-opal-seven-61.vercel.app/') },
          { label: 'Keyboard Shortcuts', action: () => openSettings('shortcuts') },
          { label: "What's New", action: openExternal('https://github.com/whothemyst-byte/Vibe_ADE/releases/latest') },
          { label: 'Check for Updates...', action: () => checkForUpdates() },
          { separator: true, label: 'sep-help-1' },
          { label: 'Send Feedback', action: openExternal('https://github.com/whothemyst-byte/Vibe_ADE/issues/new?template=feature_request.md') },
          { label: 'Report a Bug', action: openExternal('https://github.com/whothemyst-byte/Vibe_ADE/issues/new?template=bug_report.md') },
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
      openSwarmDashboard,
      plan.features.swarms,
      plan.features.taskBoard,
      removePaneFromLayout,
      requestTerminalFind,
      restartActiveSession,
      setActiveWorkspace,
      setLayoutPreset,
      saveActiveWorkspace,
      toggleTaskFilters,
      systemAction,
      toggleTaskBoard,
      exportTasks,
      archiveCompletedTasks
    ]
  );

  const renderMenuItem = (item: MenuItem, key: string): JSX.Element => {
    if (item.separator) {
      return <div key={key} className="app-menu-separator" />;
    }

    if (item.children && item.children.length > 0) {
      const disabledClass = item.disabled ? ' disabled' : '';
      return (
        <div
          key={key}
          className={`app-menu-item app-menu-submenu-trigger${disabledClass}`}
          role="menuitem"
          aria-disabled={item.disabled}
        >
          <span>{item.label}</span>
          <span className="app-menu-submenu-caret">›</span>
          <div className="app-menu-submenu" role="menu">
            {item.children.map((child, index) => renderMenuItem(child, `${key}-${index}`))}
          </div>
        </div>
      );
    }

    return (
      <button
        key={key}
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
    );
  };

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
              {menu.items.map((item, index) => renderMenuItem(item, `${menu.id}-${index}`))}
            </div>
          )}
        </div>
      ))}
      <div className="app-menu-actions">
        {updateStatus.state === 'error' && (
          <button
            className="app-update-button error"
            onClick={() => void window.vibeAde.update.check()}
            title={updateStatus.error ?? 'Update failed'}
          >
            Update Error
          </button>
        )}
        {(updateStatus.state === 'available' || updateStatus.state === 'downloaded' || updateStatus.state === 'downloading') && (
          <button
            className="app-update-button"
            onClick={() => {
              if (updateStatus.state === 'downloaded') {
                void window.vibeAde.update.install();
                return;
              }
              void window.vibeAde.update.download();
            }}
            disabled={updateStatus.state === 'downloading'}
          >
            {updateStatus.state === 'downloaded'
              ? 'Install Update'
              : updateStatus.state === 'downloading'
              ? 'Downloading...'
              : 'Update Available'}
          </button>
        )}
      </div>
    </div>
  );
}
