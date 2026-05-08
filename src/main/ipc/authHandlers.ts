import { ipcMain } from 'electron';
import type { AuthManager } from '@main/services/AuthManager';
import type { CloudSyncManager } from '@main/services/CloudSyncManager';

interface Deps {
  authManager: AuthManager;
  cloudSyncManager: CloudSyncManager;
}

export function registerAuthHandlers({ authManager, cloudSyncManager }: Deps): void {
  ipcMain.handle('auth:getSession', () => authManager.getSession());
  ipcMain.handle('auth:isConfigured', () => authManager.isConfigured());
  ipcMain.handle('auth:login', (_event, email: string, password: string) => authManager.login(email, password));
  ipcMain.handle('auth:signup', (_event, email: string, password: string) => authManager.signup(email, password));
  ipcMain.handle('auth:logout', () => authManager.logout());

  ipcMain.handle('cloud:getStatus', () => cloudSyncManager.getStatus());
  ipcMain.handle('cloud:listRemoteWorkspaces', () => cloudSyncManager.listRemoteWorkspaces());
  ipcMain.handle('cloud:getSyncPreview', () => cloudSyncManager.getSyncPreview());
  ipcMain.handle('cloud:pushLocalState', () => cloudSyncManager.pushLocalState());
  ipcMain.handle('cloud:pullRemoteToLocal', () => cloudSyncManager.pullRemoteToLocal());
}
