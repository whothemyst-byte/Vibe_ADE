import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';

type MenuId = 'file' | 'edit' | 'view' | 'window' | 'help';

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
}

interface MenuDefinition {
  id: MenuId;
  label: string;
  items: MenuItem[];
}

export function AppMenuBar(): JSX.Element {
  const openStartPage = useWorkspaceStore((s) => s.openStartPage);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  const openSwarmDashboard = useWorkspaceStore((s) => s.openSwarmDashboard);
  const saveActiveWorkspace = useWorkspaceStore((s) => s.saveActiveWorkspace);
  const saveAsActiveWorkspace = useWorkspaceStore((s) => s.saveAsActiveWorkspace);

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

  const menus = useMemo<MenuDefinition[]>(
    () => [
      {
        id: 'file',
        label: 'File',
        items: [
          { label: 'New Environment', shortcut: 'Ctrl+N', action: () => openStartPage('home') },
          { label: 'Open Environment', shortcut: 'Ctrl+O', action: () => openStartPage('open') },
          { separator: true, label: 'sep-file-1' },
          { label: 'Save', shortcut: 'Ctrl+S', action: () => void saveActiveWorkspace() },
          { label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: () => void saveAsActiveWorkspace() },
          { separator: true, label: 'sep-file-2' },
          { label: 'Settings', shortcut: 'Ctrl+,', action: () => openSettings() },
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
          { label: 'Select All', shortcut: 'Ctrl+A', action: systemAction('selectAll') }
        ]
      },
      {
        id: 'view',
        label: 'View',
        items: [
          { label: 'Reload', shortcut: 'Ctrl+R', action: systemAction('reload') },
          { label: 'Force Reload', shortcut: 'Ctrl+Shift+R', action: systemAction('forceReload') },
          { label: 'Toggle DevTools', shortcut: 'Ctrl+Shift+I', action: systemAction('toggleDevTools') },
          { separator: true, label: 'sep-view-0' },
          { label: 'Swarm Dashboard', action: () => openSwarmDashboard() },
          { separator: true, label: 'sep-view-1' },
          { label: 'Reset Zoom', shortcut: 'Ctrl+0', action: systemAction('resetZoom') },
          { label: 'Zoom In', shortcut: 'Ctrl+=', action: systemAction('zoomIn') },
          { label: 'Zoom Out', shortcut: 'Ctrl+-', action: systemAction('zoomOut') },
          { separator: true, label: 'sep-view-2' },
          { label: 'Toggle Full Screen', shortcut: 'F11', action: systemAction('togglefullscreen') }
        ]
      },
      {
        id: 'window',
        label: 'Window',
        items: [
          { label: 'Minimize', action: systemAction('minimize') },
          { label: 'Zoom', action: systemAction('zoom') },
          { label: 'Close', action: systemAction('close') }
        ]
      },
      {
        id: 'help',
        label: 'Help',
        items: [{ label: 'About Vibe-ADE', action: systemAction('about') }]
      }
    ],
    [openSettings, openStartPage, openSwarmDashboard, saveActiveWorkspace, saveAsActiveWorkspace, systemAction]
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
                    onClick={() => {
                      item.action?.();
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
