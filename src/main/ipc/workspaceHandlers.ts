import { ipcMain } from 'electron';
import type { BillingUsageManager } from '@main/services/BillingUsageManager';
import type { TemplateRunner } from '@main/services/TemplateRunner';
import type { WorkspaceManager } from '@main/services/WorkspaceManager';
import { exportEnvironmentToDirectory, listEnvironmentExports, loadEnvironmentExport } from '@main/services/EnvironmentFileManager';
import { assertExistingPath, assertNonEmptyString, assertWorkspacePayload } from './shared/validators';

interface Deps {
  workspaceManager: WorkspaceManager;
  templateRunner: TemplateRunner;
  billingUsageManager: BillingUsageManager;
}

export function registerWorkspaceHandlers({ workspaceManager, templateRunner, billingUsageManager }: Deps): void {
  ipcMain.handle('workspace:list', () => workspaceManager.list());
  ipcMain.handle('workspace:syncAccountState', () => workspaceManager.syncAccountState());
  ipcMain.handle('workspace:getProfile', () => workspaceManager.getProfile());
  ipcMain.handle('workspace:updateProfile', (_event, input: Partial<{
    displayName: string;
    company: string;
    role: string;
    timezone: string;
    notifications: boolean;
    theme: 'light' | 'dark' | 'system';
    defaultWorkspaceId: string;
  }>) => workspaceManager.updateProfile(input));
  ipcMain.handle('workspace:listTemplates', () => workspaceManager.templates());

  ipcMain.handle('workspace:create', async (
    _event,
    input: { name: string; rootDir: string; layoutPresetId?: string; templateId?: string; selectedModelId?: string; mode?: import('@shared/types').WorkspaceMode }
  ) => {
    assertNonEmptyString(input?.name, 'workspace name');
    assertExistingPath(input?.rootDir, 'workspace rootDir', 'dir');
    const workspace = await workspaceManager.create({
      name: input.name,
      rootDir: input.rootDir,
      layoutPresetId: input.layoutPresetId ?? input.templateId,
      selectedModelId: input.selectedModelId,
      mode: input.mode ?? 'space'
    });

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

  ipcMain.handle('workspace:updateSubscription', (_event, subscription) => {
    return workspaceManager.updateSubscription(subscription);
  });

  ipcMain.handle('billing:recordUsage', (_event, eventType: 'task' | 'swarm', amount = 1) => {
    return billingUsageManager.recordUsage(eventType, amount);
  });

  ipcMain.handle('workspace:exportToDirectory', async (_event, workspace: unknown, directory: unknown) => {
    assertWorkspacePayload(workspace);
    assertNonEmptyString(directory, 'directory');
    return { filePath: await exportEnvironmentToDirectory(workspace, directory) };
  });

  ipcMain.handle('workspace:listLocalExports', async (_event, directory: unknown) => {
    assertNonEmptyString(directory, 'directory');
    return listEnvironmentExports(directory);
  });

  ipcMain.handle('workspace:importFromFile', async (_event, filePath: unknown) => {
    assertNonEmptyString(filePath, 'filePath');
    const workspace = await loadEnvironmentExport(filePath);
    const current = workspaceManager.list();
    const index = current.workspaces.findIndex((item) => item.id === workspace.id);
    const workspaces =
      index >= 0
        ? current.workspaces.map((item) => (item.id === workspace.id ? workspace : item))
        : [...current.workspaces, workspace];

    await workspaceManager.replaceState({
      activeWorkspaceId: workspace.id,
      workspaces
    });

    return workspaceManager.list();
  });
}
