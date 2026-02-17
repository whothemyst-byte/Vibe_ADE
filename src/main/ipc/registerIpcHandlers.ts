import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron';
import type { CommandBlock } from '@shared/types';
import { isDestructiveCommand } from '@main/services/CommandSafety';
import type { AgentManager } from '@main/services/AgentManager';
import type { AuthManager } from '@main/services/AuthManager';
import type { CloudSyncManager } from '@main/services/CloudSyncManager';
import type { TemplateRunner } from '@main/services/TemplateRunner';
import type { TerminalManager } from '@main/services/TerminalManager';
import type { WorkspaceManager } from '@main/services/WorkspaceManager';

interface Dependencies {
  workspaceManager: WorkspaceManager;
  terminalManager: TerminalManager;
  agentManager: AgentManager;
  templateRunner: TemplateRunner;
  authManager: AuthManager;
  cloudSyncManager: CloudSyncManager;
  webContents: WebContents;
  setSaveMenuEnabled: (enabled: boolean) => void;
}

export function registerIpcHandlers(deps: Dependencies): void {
  const { workspaceManager, terminalManager, agentManager, templateRunner, authManager, cloudSyncManager, webContents, setSaveMenuEnabled } = deps;

  terminalManager.onData((paneId, data) => {
    webContents.send('terminal:data', { paneId, data });
  });

  terminalManager.onExit((paneId, exitCode) => {
    webContents.send('terminal:exit', { paneId, exitCode });
  });

  agentManager.onUpdate((paneId, output) => {
    webContents.send('agent:update', { paneId, output });
  });

  templateRunner.onProgress((event) => {
    webContents.send('template:progress', event);
  });

  ipcMain.handle('workspace:list', () => workspaceManager.list());
  ipcMain.handle('workspace:listTemplates', () => workspaceManager.templates());

  ipcMain.handle('workspace:create', async (_event, input: { name: string; rootDir: string; templateId?: string }) => {
    const workspace = await workspaceManager.create({ name: input.name, rootDir: input.rootDir });

    if (input.templateId) {
      const template = workspaceManager.templates().find((item) => item.id === input.templateId);
      if (template) {
        void templateRunner.run({ workspaceId: workspace.id, cwd: workspace.rootDir, template });
      }
    }

    return workspace;
  });

  ipcMain.handle('workspace:clone', (_event, workspaceId: string, newName: string) => {
    return workspaceManager.clone(workspaceId, newName);
  });

  ipcMain.handle('workspace:rename', (_event, workspaceId: string, name: string) => {
    return workspaceManager.rename(workspaceId, name);
  });

  ipcMain.handle('workspace:remove', (_event, workspaceId: string) => {
    return workspaceManager.remove(workspaceId);
  });

  ipcMain.handle('workspace:setActive', (_event, workspaceId: string) => {
    return workspaceManager.setActive(workspaceId);
  });

  ipcMain.handle('workspace:save', (_event, workspace) => {
    return workspaceManager.save(workspace);
  });

  ipcMain.handle('terminal:startSession', (_event, input) => {
    terminalManager.startSession(input);
  });

  ipcMain.handle('terminal:stopSession', (_event, paneId: string) => {
    terminalManager.stopSession(paneId);
  });

  ipcMain.handle('terminal:sendInput', (_event, paneId: string, input: string) => {
    terminalManager.sendInput(paneId, input);
  });

  ipcMain.handle('terminal:executeInSession', (_event, paneId: string, command: string, forceSubmit?: boolean) => {
    terminalManager.executeInSession(paneId, command, forceSubmit);
  });

  ipcMain.handle('terminal:resize', (_event, paneId: string, cols: number, rows: number) => {
    terminalManager.resize(paneId, cols, rows);
  });

  ipcMain.handle('terminal:runStructuredCommand', async (_event, input): Promise<CommandBlock & { warning?: string }> => {
    const block = await terminalManager.runStructuredCommand(input);
    if (isDestructiveCommand(input.command)) {
      return {
        ...block,
        warning: 'Destructive command detected. Review carefully before re-running.'
      };
    }
    return block;
  });

  ipcMain.handle('agent:start', (_event, input) => {
    agentManager.start(input);
  });

  ipcMain.handle('agent:stop', (_event, paneId: string) => {
    agentManager.stop(paneId);
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

  ipcMain.handle('auth:getSession', () => authManager.getSession());
  ipcMain.handle('auth:login', (_event, email: string, password: string) => authManager.login(email, password));
  ipcMain.handle('auth:signup', (_event, email: string, password: string) => authManager.signup(email, password));
  ipcMain.handle('auth:logout', () => authManager.logout());

  ipcMain.handle('cloud:getStatus', () => cloudSyncManager.getStatus());
  ipcMain.handle('cloud:listRemoteWorkspaces', () => cloudSyncManager.listRemoteWorkspaces());
  ipcMain.handle('cloud:getSyncPreview', () => cloudSyncManager.getSyncPreview());
  ipcMain.handle('cloud:pushLocalState', () => cloudSyncManager.pushLocalState());
  ipcMain.handle('cloud:pullRemoteToLocal', () => cloudSyncManager.pullRemoteToLocal());
}
