import { BrowserWindow, Menu, dialog } from 'electron';

const SAVE_MENU_ID = 'file-save';
const SAVE_AS_MENU_ID = 'file-save-as';

function sendMenuAction(
  win: BrowserWindow,
  action: 'new-environment' | 'open-environment' | 'settings' | 'save-environment' | 'save-as-environment'
): void {
  win.webContents.send('app:menuAction', { action });
}

export function installAppMenu(win: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Environment',
          accelerator: 'Ctrl+N',
          click: () => sendMenuAction(win, 'new-environment')
        },
        {
          label: 'Open Environment',
          accelerator: 'Ctrl+O',
          click: () => sendMenuAction(win, 'open-environment')
        },
        { type: 'separator' },
        {
          label: 'Save',
          id: SAVE_MENU_ID,
          accelerator: 'Ctrl+S',
          click: () => sendMenuAction(win, 'save-environment')
        },
        {
          label: 'Save As...',
          id: SAVE_AS_MENU_ID,
          accelerator: 'Ctrl+Shift+S',
          click: () => sendMenuAction(win, 'save-as-environment')
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'Ctrl+,',
          click: () => sendMenuAction(win, 'settings')
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Windows',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Vibe-ADE',
          click: () => {
            void dialog.showMessageBox(win, {
              title: 'About Vibe-ADE',
              message: 'Vibe-ADE',
              detail: 'Windows-native Agent Development Environment',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function setSaveMenuEnabled(enabled: boolean): void {
  const menu = Menu.getApplicationMenu();
  if (!menu) {
    return;
  }
  const saveItem = menu.getMenuItemById(SAVE_MENU_ID);
  const saveAsItem = menu.getMenuItemById(SAVE_AS_MENU_ID);
  if (saveItem) {
    saveItem.enabled = enabled;
  }
  if (saveAsItem) {
    saveAsItem.enabled = enabled;
  }
}
