import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell, type WebContents } from 'electron';
import type { UpdateManager } from '@main/services/UpdateManager';
import { assertNonEmptyString, assertRecord } from './shared/validators';

const MAX_CLIPBOARD_TEXT_LENGTH = 1_000_000;

function assertThemeBase(value: unknown): asserts value is 'light' | 'dark' {
  if (value !== 'light' && value !== 'dark') {
    throw new Error('Invalid theme base');
  }
}

function assertThemeColor(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 32 || value.includes('\0')) {
    throw new Error('Invalid theme color');
  }
}

function assertMenuAction(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 64 || value.includes('\0')) {
    throw new Error('Invalid menu action');
  }
}

interface Deps {
  webContents: WebContents;
  updateManager: UpdateManager;
  setSaveMenuEnabled: (enabled: boolean) => void;
}

export function registerSystemHandlers({ webContents, updateManager, setSaveMenuEnabled }: Deps): void {
  ipcMain.handle('system:setWindowTheme', (_event, input) => {
    assertRecord(input, 'theme');
    assertThemeBase(input.base);
    assertThemeColor(input.headerColor);
    const win = BrowserWindow.fromWebContents(webContents);
    if (!win) {
      return;
    }
    nativeTheme.themeSource = input.base;
    win.setBackgroundColor(input.headerColor);
  });

  ipcMain.handle('system:performMenuAction', (_event, action) => {
    assertMenuAction(action);
    const win = BrowserWindow.fromWebContents(webContents);
    if (!win) {
      return;
    }

    switch (action) {
      case 'undo':
        webContents.undo();
        return;
      case 'redo':
        webContents.redo();
        return;
      case 'cut':
        webContents.cut();
        return;
      case 'copy':
        webContents.copy();
        return;
      case 'paste':
        webContents.paste();
        return;
      case 'selectAll':
        webContents.selectAll();
        return;
      case 'reload':
        webContents.reload();
        return;
      case 'forceReload':
        webContents.reloadIgnoringCache();
        return;
      case 'toggleDevTools':
        webContents.toggleDevTools();
        return;
      case 'resetZoom':
        webContents.setZoomLevel(0);
        return;
      case 'zoomIn':
        webContents.setZoomLevel(webContents.getZoomLevel() + 0.5);
        return;
      case 'zoomOut':
        webContents.setZoomLevel(webContents.getZoomLevel() - 0.5);
        return;
      case 'togglefullscreen':
        win.setFullScreen(!win.isFullScreen());
        return;
      case 'minimize':
        win.minimize();
        return;
      case 'zoom':
        if (win.isMaximized()) {
          win.unmaximize();
        } else {
          win.maximize();
        }
        return;
      case 'close':
        win.close();
        return;
      case 'quit':
        app.quit();
        return;
      case 'about':
        void dialog.showMessageBox(win, {
          title: 'About Vibe-ADE',
          message: 'Vibe-ADE',
          detail: 'Windows-native Development Environment',
          buttons: ['OK']
        });
        return;
      default:
        throw new Error('Unsupported menu action');
    }
  });

  ipcMain.handle('system:selectDirectory', async () => {
    const window = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(window ?? undefined, {
      properties: ['openDirectory', 'dontAddToRecent']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('system:setSaveMenuEnabled', (_event, enabled: boolean) => {
    setSaveMenuEnabled(enabled);
  });

  ipcMain.handle('system:readClipboardText', () => {
    return clipboard.readText();
  });

  ipcMain.handle('system:readClipboardImageDataUrl', () => {
    const image = clipboard.readImage();
    if (image.isEmpty()) {
      return null;
    }
    return image.toDataURL();
  });

  ipcMain.handle('system:writeClipboardText', (_event, text: unknown) => {
    if (typeof text !== 'string' || text.length > MAX_CLIPBOARD_TEXT_LENGTH) {
      throw new Error('Invalid clipboard text payload');
    }
    clipboard.writeText(text);
  });

  ipcMain.handle('system:openExternal', (_event, url: unknown) => {
    assertNonEmptyString(url, 'url');
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http and https URLs can be opened externally.');
    }
    return shell.openExternal(parsed.href);
  });

  ipcMain.handle('update:getStatus', () => updateManager.getStatus());
  ipcMain.handle('update:check', () => updateManager.checkForUpdates());
  ipcMain.handle('update:download', () => updateManager.downloadUpdate());
  ipcMain.handle('update:install', () => updateManager.installUpdate());
}
