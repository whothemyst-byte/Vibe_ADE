import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell, type WebContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type {
  CommandBlock,
  PaneId,
  TaskItem,
  TaskPriority,
  TaskStatus,
  WorkspaceId,
  WorkspaceState
} from '@shared/types';
import { isDestructiveCommand } from '@main/services/CommandSafety';
import type { AuthManager } from '@main/services/AuthManager';
import type { CloudSyncManager } from '@main/services/CloudSyncManager';
import type { TemplateRunner } from '@main/services/TemplateRunner';
import type { TerminalManager } from '@main/services/TerminalManager';
import type { UpdateManager } from '@main/services/UpdateManager';
import { buildMentionPayload, listDirectoryEntries } from '@main/services/TerminalMentionPayload';
import { exportEnvironmentToDirectory, listEnvironmentExports, loadEnvironmentExport } from '@main/services/EnvironmentFileManager';
import type { WorkspaceManager } from '@main/services/WorkspaceManager';
import { swarmManager } from '@main/services/SwarmManager';
import { swarmEventBus } from '@main/services/SwarmEventBus';
import type { SwarmEvent } from '@main/types/SwarmEvents';
import type { AgentState, SwarmState, SwarmTask } from '@main/types/SwarmOrchestration';

interface Dependencies {
  workspaceManager: WorkspaceManager;
  terminalManager: TerminalManager;
  templateRunner: TemplateRunner;
  authManager: AuthManager;
  cloudSyncManager: CloudSyncManager;
  updateManager: UpdateManager;
  webContents: WebContents;
  setSaveMenuEnabled: (enabled: boolean) => void;
}

const MAX_PANE_ID_LENGTH = 128;
const MAX_COMMAND_LENGTH = 8_000;
const MAX_INPUT_LENGTH = 64_000;
const MAX_TASK_TITLE_LENGTH = 200;
const MAX_TASK_DESCRIPTION_LENGTH = 5_000;
const MAX_TASK_LABELS = 20;
const MAX_TASK_LABEL_LENGTH = 32;
const MAX_CLIPBOARD_TEXT_LENGTH = 1_000_000;
const MIN_TERMINAL_COLS = 2;
const MIN_TERMINAL_ROWS = 1;
const MAX_TERMINAL_COLS = 500;
const MAX_TERMINAL_ROWS = 200;

const TASK_STATUSES: TaskStatus[] = ['backlog', 'in-progress', 'done'];
const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high'];

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${field}`);
  }
}

function assertPaneId(value: unknown): asserts value is string {
  assertNonEmptyString(value, 'paneId');
  if (value.length > MAX_PANE_ID_LENGTH || value.includes('\0')) {
    throw new Error('Invalid paneId');
  }
}

function assertWorkspacePayload(value: unknown): asserts value is WorkspaceState {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid workspace');
  }
  const workspace = value as Partial<WorkspaceState>;
  assertWorkspaceId(workspace.id);
  assertNonEmptyString(workspace.name, 'workspace.name');
  assertNonEmptyString(workspace.rootDir, 'workspace.rootDir');
  if (!workspace.layout) {
    throw new Error('Invalid workspace.layout');
  }
}

function clampTerminalDimension(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.floor(value);
  if (!Number.isFinite(rounded)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, rounded));
}

function assertWorkspaceId(value: unknown): asserts value is WorkspaceId {
  assertNonEmptyString(value, 'workspaceId');
  if (value.length > 128 || value.includes('\0')) {
    throw new Error('Invalid workspaceId');
  }
}

function assertTaskId(value: unknown): asserts value is string {
  assertNonEmptyString(value, 'taskId');
  if (value.length > 128 || value.includes('\0')) {
    throw new Error('Invalid taskId');
  }
}

function assertTaskStatus(value: unknown): asserts value is TaskStatus {
  if (typeof value !== 'string' || !TASK_STATUSES.includes(value as TaskStatus)) {
    throw new Error('Invalid task status');
  }
}

function assertTaskPriority(value: unknown): asserts value is TaskPriority {
  if (typeof value !== 'string' || !TASK_PRIORITIES.includes(value as TaskPriority)) {
    throw new Error('Invalid task priority');
  }
}

function assertIsoDate(value: unknown, field: string): asserts value is string {
  assertNonEmptyString(value, field);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new Error(`Invalid ${field}`);
  }
}

function assertTaskLabels(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.length > MAX_TASK_LABELS) {
    throw new Error('Invalid task labels');
  }
  for (const label of value) {
    if (typeof label !== 'string') {
      throw new Error('Invalid task labels');
    }
    const trimmed = label.trim();
    if (!trimmed || trimmed.length > MAX_TASK_LABEL_LENGTH || trimmed.includes('\0')) {
      throw new Error('Invalid task labels');
    }
  }
}

function sanitizeTaskLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const trimmed = value
    .filter((item): item is string => typeof item === 'string')
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, MAX_TASK_LABELS)
    .map((label) => label.slice(0, MAX_TASK_LABEL_LENGTH));
  return [...new Set(trimmed)];
}

function normalizeTaskOrder(tasks: TaskItem[]): TaskItem[] {
  const byStatus: Record<TaskStatus, TaskItem[]> = {
    backlog: [],
    'in-progress': [],
    done: []
  };

  for (const task of tasks) {
    byStatus[task.status].push(task);
  }

  const normalized: TaskItem[] = [];
  for (const status of TASK_STATUSES) {
    const ordered = byStatus[status].sort((a, b) => {
      const byOrder = (a.order ?? 0) - (b.order ?? 0);
      if (byOrder !== 0) {
        return byOrder;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    ordered.forEach((task, index) => {
      normalized.push({ ...task, order: index + 1 });
    });
  }

  return normalized;
}

function nextTaskOrder(tasks: TaskItem[], status: TaskStatus): number {
  const max = tasks
    .filter((task) => task.status === status)
    .reduce((acc, task) => Math.max(acc, task.order ?? 0), 0);
  return max + 1;
}

function assertRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }
}

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

function assertCommand(value: unknown): asserts value is string {
  assertNonEmptyString(value, 'command');
  if (value.length > MAX_COMMAND_LENGTH || value.includes('\0')) {
    throw new Error('Invalid command payload');
  }
}

function assertTerminalInput(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > MAX_INPUT_LENGTH || value.includes('\0')) {
    throw new Error('Invalid terminal input payload');
  }
}

function isPathInside(parentDir: string, candidatePath: string): boolean {
  const parent = path.resolve(parentDir);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertWorkspaceCwd(workspaceManager: WorkspaceManager, cwd: unknown): asserts cwd is string {
  assertNonEmptyString(cwd, 'cwd');
  const resolved = path.resolve(cwd);
  if (!path.isAbsolute(resolved)) {
    throw new Error('Terminal cwd must be an absolute path.');
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error('Terminal cwd does not exist.');
  }
  const state = workspaceManager.list();
  const allowed = state.workspaces.some((workspace) => isPathInside(workspace.rootDir, resolved));
  if (!allowed) {
    throw new Error('Terminal cwd must be inside a known workspace root.');
  }
}

function assertWorkspacePath(
  workspace: WorkspaceState,
  value: unknown,
  field: string,
  kind: 'dir' | 'file' | 'any'
): asserts value is string {
  assertNonEmptyString(value, field);
  const resolved = path.resolve(value);
  if (!path.isAbsolute(resolved)) {
    throw new Error(`${field} must be an absolute path.`);
  }
  if (!isPathInside(workspace.rootDir, resolved)) {
    throw new Error(`${field} must be inside the workspace root.`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`${field} does not exist.`);
  }
  const stat = fs.statSync(resolved);
  if (kind === 'dir' && !stat.isDirectory()) {
    throw new Error(`${field} must be a directory.`);
  }
  if (kind === 'file' && !stat.isFile()) {
    throw new Error(`${field} must be a file.`);
  }
}

function assertExistingPath(value: unknown, field: string, kind: 'dir' | 'file' | 'any'): asserts value is string {
  assertNonEmptyString(value, field);
  const resolved = path.resolve(value);
  if (!path.isAbsolute(resolved)) {
    throw new Error(`${field} must be an absolute path.`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`${field} does not exist.`);
  }
  const stat = fs.statSync(resolved);
  if (kind === 'dir' && !stat.isDirectory()) {
    throw new Error(`${field} must be a directory.`);
  }
  if (kind === 'file' && !stat.isFile()) {
    throw new Error(`${field} must be a file.`);
  }
}

export function registerIpcHandlers(deps: Dependencies): void {
  const {
    workspaceManager,
    terminalManager,
    templateRunner,
    authManager,
    cloudSyncManager,
    updateManager,
    webContents,
    setSaveMenuEnabled
  } = deps;

  // Bridge swarm events to the renderer for real-time UI.
  swarmEventBus.attachUiBridge({
    emitEvent: (event) => {
      const transcript = toTranscriptEvent(event);
      if (!transcript) return;
      webContents.send('swarm:event', { swarmId: event.swarmId, event: transcript });
    },
    emitSwarmUpdate: (swarmId, state) => {
      webContents.send('swarm:update', { swarmId, state: serializeSwarmState(state) });
    },
    emitAgentStatus: (swarmId, agent) => {
      webContents.send('swarm:agent-status', { swarmId, agent });
    }
  });

  // Bridge raw agent output for the Swarm "terminal view" in the renderer.
  swarmManager.onAgentOutput((payload) => {
    webContents.send('swarm:agent-output', payload);
  });

  const loadWorkspace = (workspaceId: WorkspaceId): WorkspaceState => {
    const state = workspaceManager.list();
    const workspace = state.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    return workspace;
  };

  const saveWorkspace = async (workspace: WorkspaceState): Promise<void> => {
    await workspaceManager.save(workspace);
  };

  terminalManager.onData((paneId, data) => {
    webContents.send('terminal:data', { paneId, data });
  });

  terminalManager.onExit((paneId, exitCode) => {
    webContents.send('terminal:exit', { paneId, exitCode });
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

  ipcMain.handle('workspace:updateSubscription', (_event, subscription) => {
    return workspaceManager.updateSubscription(subscription);
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

  ipcMain.handle('terminal:startSession', (_event, input) => {
    assertPaneId(input?.paneId);
    assertWorkspaceCwd(workspaceManager, input?.cwd);
    const cols = clampTerminalDimension(input?.cols, 120, MIN_TERMINAL_COLS, MAX_TERMINAL_COLS);
    const rows = clampTerminalDimension(input?.rows, 30, MIN_TERMINAL_ROWS, MAX_TERMINAL_ROWS);
    terminalManager.startSession({ ...input, cols, rows });
  });

  ipcMain.handle('terminal:stopSession', (_event, paneId: string) => {
    assertPaneId(paneId);
    terminalManager.stopSession(paneId);
  });

  ipcMain.handle('terminal:sendInput', (_event, paneId: string, input: string) => {
    assertPaneId(paneId);
    assertTerminalInput(input);
    terminalManager.sendInput(paneId, input);
  });

  ipcMain.handle('terminal:executeInSession', (_event, paneId: string, command: string, forceSubmit?: boolean) => {
    assertPaneId(paneId);
    assertCommand(command);
    terminalManager.executeInSession(paneId, command, forceSubmit);
  });

  ipcMain.handle('terminal:resize', (_event, paneId: string, cols: number, rows: number) => {
    assertPaneId(paneId);
    const safeCols = clampTerminalDimension(cols, 120, MIN_TERMINAL_COLS, MAX_TERMINAL_COLS);
    const safeRows = clampTerminalDimension(rows, 30, MIN_TERMINAL_ROWS, MAX_TERMINAL_ROWS);
    terminalManager.resize(paneId, safeCols, safeRows);
  });

  ipcMain.handle('terminal:getSessionSnapshot', (_event, paneId: string) => {
    assertPaneId(paneId);
    return terminalManager.getSessionSnapshot(paneId);
  });

  ipcMain.handle('terminal:runStructuredCommand', async (_event, input): Promise<CommandBlock & { warning?: string }> => {
    assertPaneId(input?.paneId);
    assertWorkspaceCwd(workspaceManager, input?.cwd);
    assertCommand(input?.command);
    const block = await terminalManager.runStructuredCommand(input);
    if (isDestructiveCommand(input.command)) {
      return {
        ...block,
        warning: 'Destructive command detected. Review carefully before re-running.'
      };
    }
    return block;
  });

  ipcMain.handle('terminal:listDirectory', async (_event, input: unknown) => {
    assertRecord(input, 'terminal listDirectory payload');
    const workspaceId = input.workspaceId;
    assertWorkspaceId(workspaceId);
    const directoryValue = input.directory;
    assertExistingPath(directoryValue, 'directory', 'dir');
    const directory = path.resolve(directoryValue);
    return listDirectoryEntries(directory);
  });

  ipcMain.handle('terminal:buildMentionPayload', async (_event, input: unknown) => {
    assertRecord(input, 'terminal buildMentionPayload payload');
    const workspaceId = input.workspaceId;
    assertWorkspaceId(workspaceId);
    const workspace = loadWorkspace(workspaceId);
    const targetPathValue = input.targetPath;
    assertExistingPath(targetPathValue, 'targetPath', 'any');
    const targetPath = path.resolve(targetPathValue);

    const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
      const rounded = Math.floor(value);
      if (!Number.isFinite(rounded)) return fallback;
      return Math.max(min, Math.min(max, rounded));
    };

    const tree = input.tree as Record<string, unknown> | undefined;
    const keyFiles = input.keyFiles as Record<string, unknown> | undefined;

    const payload = await buildMentionPayload(workspace.rootDir, targetPath, {
      tree: {
        maxDepth: clamp(tree?.maxDepth, 4, 0, 10),
        maxEntries: clamp(tree?.maxEntries, 1200, 50, 20_000),
        maxLines: clamp(tree?.maxLines, 400, 20, 5000)
      },
      keyFiles: {
        maxFiles: clamp(keyFiles?.maxFiles, 6, 0, 50),
        maxCharsPerFile: clamp(keyFiles?.maxCharsPerFile, 2200, 200, 50_000)
      },
      maxTotalChars: clamp(input.maxTotalChars, 60_000, 5_000, 250_000)
    });

    return payload;
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
    return shell.openExternal(url);
  });

  ipcMain.handle('update:getStatus', () => updateManager.getStatus());
  ipcMain.handle('update:check', () => updateManager.checkForUpdates());
  ipcMain.handle('update:download', () => updateManager.downloadUpdate());
  ipcMain.handle('update:install', () => updateManager.installUpdate());

  ipcMain.handle('auth:getSession', () => authManager.getSession());
  ipcMain.handle('auth:login', (_event, email: string, password: string) => authManager.login(email, password));
  ipcMain.handle('auth:signup', (_event, email: string, password: string) => authManager.signup(email, password));
  ipcMain.handle('auth:logout', () => authManager.logout());

  ipcMain.handle('cloud:getStatus', () => cloudSyncManager.getStatus());
  ipcMain.handle('cloud:listRemoteWorkspaces', () => cloudSyncManager.listRemoteWorkspaces());
  ipcMain.handle('cloud:getSyncPreview', () => cloudSyncManager.getSyncPreview());
  ipcMain.handle('cloud:pushLocalState', () => cloudSyncManager.pushLocalState());
  ipcMain.handle('cloud:pullRemoteToLocal', () => cloudSyncManager.pullRemoteToLocal());

  ipcMain.handle('task:list', (_event, workspaceId: WorkspaceId) => {
    assertWorkspaceId(workspaceId);
    const workspace = loadWorkspace(workspaceId);
    return workspace.tasks;
  });

  ipcMain.handle('task:create', async (_event, workspaceId: WorkspaceId, input: unknown) => {
    assertWorkspaceId(workspaceId);
    assertRecord(input, 'task create payload');
    assertNonEmptyString(input.title, 'task title');
    const title = input.title.trim();
    if (title.length > MAX_TASK_TITLE_LENGTH) {
      throw new Error('Task title is too long');
    }

    if (input.description !== undefined && typeof input.description !== 'string') {
      throw new Error('Invalid task description');
    }
    if (typeof input.description === 'string' && input.description.length > MAX_TASK_DESCRIPTION_LENGTH) {
      throw new Error('Task description is too long');
    }
    if (input.status !== undefined) {
      assertTaskStatus(input.status);
    }
    if (input.priority !== undefined) {
      assertTaskPriority(input.priority);
    }
    if (input.startAt !== undefined) {
      assertIsoDate(input.startAt, 'task startAt');
    }
    if (input.endAt !== undefined) {
      assertIsoDate(input.endAt, 'task endAt');
    }
    if (input.dueAt !== undefined) {
      assertIsoDate(input.dueAt, 'task dueAt');
    }
    if (input.labels !== undefined) {
      assertTaskLabels(input.labels);
    }
    if (input.paneId !== undefined) {
      assertPaneId(input.paneId);
    }

    const workspace = loadWorkspace(workspaceId);
    const now = new Date().toISOString();
    const status = (input.status as TaskStatus | undefined) ?? 'backlog';
    const task: TaskItem = {
      id: uuidv4(),
      title,
      description: (input.description as string | undefined) ?? '',
      status,
      priority: (input.priority as TaskPriority | undefined) ?? 'medium',
      startAt: input.startAt as string | undefined,
      endAt: input.endAt as string | undefined,
      dueAt: (input.endAt as string | undefined) ?? (input.dueAt as string | undefined),
      labels: sanitizeTaskLabels(input.labels),
      archived: false,
      order: nextTaskOrder(workspace.tasks, status),
      paneId: input.paneId as PaneId | undefined,
      createdAt: now,
      updatedAt: now
    };

    const nextWorkspace: WorkspaceState = {
      ...workspace,
      tasks: normalizeTaskOrder([...workspace.tasks, task]),
      updatedAt: now
    };
    await saveWorkspace(nextWorkspace);
    return nextWorkspace.tasks.find((item) => item.id === task.id) ?? task;
  });

  ipcMain.handle('task:update', async (_event, workspaceId: WorkspaceId, taskId: string, patch: unknown) => {
    assertWorkspaceId(workspaceId);
    assertTaskId(taskId);
    assertRecord(patch, 'task update payload');

    if (patch.title !== undefined) {
      assertNonEmptyString(patch.title, 'task title');
      if (patch.title.trim().length > MAX_TASK_TITLE_LENGTH) {
        throw new Error('Task title is too long');
      }
    }
    if (patch.description !== undefined) {
      if (typeof patch.description !== 'string' || patch.description.length > MAX_TASK_DESCRIPTION_LENGTH) {
        throw new Error('Invalid task description');
      }
    }
    if (patch.status !== undefined) {
      assertTaskStatus(patch.status);
    }
    if (patch.priority !== undefined) {
      assertTaskPriority(patch.priority);
    }
    if (patch.startAt !== undefined && patch.startAt !== null) {
      assertIsoDate(patch.startAt, 'task startAt');
    }
    if (patch.endAt !== undefined && patch.endAt !== null) {
      assertIsoDate(patch.endAt, 'task endAt');
    }
    if (patch.dueAt !== undefined && patch.dueAt !== null) {
      assertIsoDate(patch.dueAt, 'task dueAt');
    }
    if (patch.labels !== undefined) {
      assertTaskLabels(patch.labels);
    }
    if (patch.paneId !== undefined && patch.paneId !== null) {
      assertPaneId(patch.paneId);
    }
    if (patch.archived !== undefined && typeof patch.archived !== 'boolean') {
      throw new Error('Invalid archived flag');
    }
    if (patch.order !== undefined && (!Number.isInteger(patch.order) || patch.order < 1)) {
      throw new Error('Invalid task order');
    }

    const workspace = loadWorkspace(workspaceId);
    const now = new Date().toISOString();
    let updatedTask: TaskItem | null = null;

    const updatedTasks = workspace.tasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }
      const nextStatus = (patch.status as TaskStatus | undefined) ?? task.status;
      const nextTask: TaskItem = {
        ...task,
        title: patch.title !== undefined ? String(patch.title).trim() : task.title,
        description: patch.description !== undefined ? String(patch.description) : task.description,
        status: nextStatus,
        priority: (patch.priority as TaskPriority | undefined) ?? task.priority ?? 'medium',
        startAt: patch.startAt === null ? undefined : (patch.startAt as string | undefined) ?? task.startAt,
        endAt: patch.endAt === null ? undefined : (patch.endAt as string | undefined) ?? task.endAt,
        dueAt:
          patch.endAt === null
            ? (patch.dueAt === null ? undefined : (patch.dueAt as string | undefined) ?? task.dueAt)
            : (patch.endAt as string | undefined) ?? (patch.dueAt as string | undefined) ?? task.dueAt,
        labels: patch.labels !== undefined ? sanitizeTaskLabels(patch.labels) : task.labels ?? [],
        paneId: patch.paneId === null ? undefined : (patch.paneId as PaneId | undefined) ?? task.paneId,
        archived: (patch.archived as boolean | undefined) ?? task.archived ?? false,
        order: (patch.order as number | undefined)
          ?? (((patch.status as TaskStatus | undefined) && patch.status !== task.status) ? nextTaskOrder(workspace.tasks, nextStatus) : task.order),
        updatedAt: now
      };
      updatedTask = nextTask;
      return nextTask;
    });

    if (!updatedTask) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const nextWorkspace: WorkspaceState = {
      ...workspace,
      tasks: normalizeTaskOrder(updatedTasks),
      updatedAt: now
    };
    await saveWorkspace(nextWorkspace);
    const persisted = nextWorkspace.tasks.find((item) => item.id === taskId);
    if (!persisted) {
      throw new Error(`Task not found after save: ${taskId}`);
    }
    return persisted;
  });

  ipcMain.handle('task:delete', async (_event, workspaceId: WorkspaceId, taskId: string) => {
    assertWorkspaceId(workspaceId);
    assertTaskId(taskId);
    const workspace = loadWorkspace(workspaceId);
    if (!workspace.tasks.some((task) => task.id === taskId)) {
      return;
    }
    const now = new Date().toISOString();
    const nextWorkspace: WorkspaceState = {
      ...workspace,
      tasks: normalizeTaskOrder(workspace.tasks.filter((task) => task.id !== taskId)),
      updatedAt: now
    };
    await saveWorkspace(nextWorkspace);
  });

  ipcMain.handle('task:move', async (_event, workspaceId: WorkspaceId, taskId: string, toStatus: TaskStatus, toIndex: number) => {
    assertWorkspaceId(workspaceId);
    assertTaskId(taskId);
    assertTaskStatus(toStatus);
    if (!Number.isInteger(toIndex) || toIndex < 0) {
      throw new Error('Invalid task target index');
    }

    const workspace = loadWorkspace(workspaceId);
    const now = new Date().toISOString();
    const targetExists = workspace.tasks.some((task) => task.id === taskId);
    if (!targetExists) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const movedBase = workspace.tasks.map((task) =>
      task.id === taskId
        ? {
          ...task,
          status: toStatus,
          updatedAt: now
        }
        : task
    );

    const inStatus = movedBase
      .filter((task) => task.status === toStatus)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const moving = inStatus.find((task) => task.id === taskId);
    if (!moving) {
      throw new Error(`Task not found in target status: ${taskId}`);
    }
    const withoutMoving = inStatus.filter((task) => task.id !== taskId);
    const clampedIndex = Math.max(0, Math.min(toIndex, withoutMoving.length));
    withoutMoving.splice(clampedIndex, 0, moving);
    const rank = new Map<string, number>();
    withoutMoving.forEach((task, index) => rank.set(task.id, index + 1));

    const nextWorkspace: WorkspaceState = {
      ...workspace,
      tasks: normalizeTaskOrder(
        movedBase.map((task) =>
          task.status === toStatus ? { ...task, order: rank.get(task.id) ?? task.order } : task
        )
      ),
      updatedAt: now
    };
    await saveWorkspace(nextWorkspace);
  });

  ipcMain.handle('task:archive', async (_event, workspaceId: WorkspaceId, taskId: string, archived?: boolean) => {
    assertWorkspaceId(workspaceId);
    assertTaskId(taskId);
    if (archived !== undefined && typeof archived !== 'boolean') {
      throw new Error('Invalid archived flag');
    }
    const workspace = loadWorkspace(workspaceId);
    const now = new Date().toISOString();
    const nextWorkspace: WorkspaceState = {
      ...workspace,
      tasks: normalizeTaskOrder(
        workspace.tasks.map((task) =>
          task.id === taskId
            ? {
              ...task,
              archived: archived ?? true,
              updatedAt: now
            }
            : task
        )
      ),
      updatedAt: now
    };
    await saveWorkspace(nextWorkspace);
  });

  // ---- QuanSwarm IPC ----

  ipcMain.handle('swarm:create', async (_event, config: unknown) => {
    try {
      const validated = validateSwarmCreateConfig(config);
      const state = await swarmManager.initializeSwarm(validated);
      return { success: true, swarmState: serializeSwarmState(state) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('swarm:status', async (_event, swarmId: unknown) => {
    assertNonEmptyString(swarmId, 'swarmId');
    return swarmManager.getSwarmStatus(swarmId);
  });

  ipcMain.handle('swarm:state', async (_event, swarmId: unknown) => {
    assertNonEmptyString(swarmId, 'swarmId');
    const state = swarmManager.getSwarmState(swarmId);
    return serializeSwarmState(state);
  });

  ipcMain.handle('swarm:events', async (_event, swarmId: unknown, count: unknown = 10) => {
    assertNonEmptyString(swarmId, 'swarmId');
    const n = typeof count === 'number' && Number.isFinite(count) ? count : 10;
    const events = swarmManager.getRecentEvents(swarmId, n);
    return events.map((e) => serializeSwarmEvent(e));
  });

  ipcMain.handle('swarm:agentOutput', async (_event, swarmId: unknown, maxLines: unknown = 200) => {
    assertNonEmptyString(swarmId, 'swarmId');
    const n = typeof maxLines === 'number' && Number.isFinite(maxLines) ? maxLines : 200;
    return swarmManager.getAgentOutputSnapshot(swarmId, n);
  });

  ipcMain.handle('swarm:stop', async (_event, swarmId: unknown) => {
    assertNonEmptyString(swarmId, 'swarmId');
    await swarmManager.stopSwarm(swarmId);
    return { success: true };
  });
}

type SwarmCreateAgent = { agentId: string; role: 'coordinator' | 'builder' | 'scout' | 'reviewer'; cliProvider: 'claude' | 'codex' | 'gemini' };
type SwarmCreateConfig = { swarmId: string; goal: string; codebaseRoot: string; agents: SwarmCreateAgent[] };

function validateSwarmCreateConfig(input: unknown): SwarmCreateConfig {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid swarm:create config');
  }
  const obj = input as Record<string, unknown>;
  assertNonEmptyString(obj.swarmId, 'swarmId');
  assertNonEmptyString(obj.goal, 'goal');
  assertNonEmptyString(obj.codebaseRoot, 'codebaseRoot');
  if (!Array.isArray(obj.agents) || obj.agents.length === 0) {
    throw new Error('Invalid agents');
  }

  const agents: SwarmCreateAgent[] = [];
  for (const raw of obj.agents) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid agents');
    }
    const a = raw as Record<string, unknown>;
    assertNonEmptyString(a.agentId, 'agentId');
    if (typeof a.role !== 'string' || !['coordinator', 'builder', 'scout', 'reviewer'].includes(a.role)) {
      throw new Error('Invalid agent role');
    }
    if (typeof a.cliProvider !== 'string' || !['claude', 'codex', 'gemini'].includes(a.cliProvider)) {
      throw new Error('Invalid cliProvider');
    }
    agents.push({ agentId: a.agentId, role: a.role as SwarmCreateAgent['role'], cliProvider: a.cliProvider as SwarmCreateAgent['cliProvider'] });
  }

  return {
    swarmId: obj.swarmId,
    goal: obj.goal,
    codebaseRoot: obj.codebaseRoot,
    agents
  };
}

function serializeSwarmState(state: SwarmState): unknown {
  const tasks: Record<string, unknown> = {};
  for (const [id, task] of state.tasks.entries()) {
    tasks[id] = serializeSwarmTask(task);
  }

  const agents: Record<string, AgentState> = {};
  for (const [id, agent] of state.agents.entries()) {
    agents[id] = agent;
  }

  const ownership: Record<string, string> = {};
  for (const [filePath, taskId] of state.fileOwnershipMap.entries()) {
    ownership[filePath] = taskId;
  }

  const dependencies: Record<string, string[]> = {};
  for (const [taskId, deps] of state.dependencies.entries()) {
    dependencies[taskId] = [...deps];
  }

  return {
    swarmId: state.swarmId,
    overallGoal: state.overallGoal,
    createdAt: state.createdAt,
    tasks,
    agents,
    fileOwnershipMap: ownership,
    parallelGroups: state.parallelGroups.map((g) => [...g]),
    dependencies,
    sharedContext: state.sharedContext
  };
}

function serializeSwarmTask(task: SwarmTask): unknown {
  return {
    ...task,
    fileOwnership: {
      ...task.fileOwnership,
      files: Array.from(task.fileOwnership.files)
    }
  };
}

function serializeSwarmEvent(event: SwarmEvent): unknown {
  // Events may contain SwarmTask instances (with Set). Serialize those fields when present.
  if (event.type === 'task-created') {
    return { ...event, task: serializeSwarmTask(event.task) };
  }
  if (event.type === 'tasks-decomposed') {
    return { ...event, tasks: event.tasks.map((t) => serializeSwarmTask(t)) };
  }
  return event;
}

type TranscriptEventType =
  | 'swarm-started'
  | 'tasks-decomposed'
  | 'task-started'
  | 'task-completed'
  | 'review-started'
  | 'review-approved'
  | 'review-rejected'
  | 'agent-ready'
  | 'agent-stopped'
  | 'agent-blocked'
  | 'error';

type TranscriptEvent = {
  id: string;
  timestamp: number;
  type: TranscriptEventType;
  message: string;
  meta?: Record<string, string>;
};

function toTranscriptEvent(event: SwarmEvent): TranscriptEvent | null {
  const id = `${event.type}:${event.timestamp}`;
  switch (event.type) {
    case 'swarm-created':
      return { id, timestamp: event.timestamp, type: 'swarm-started', message: 'Swarm started' };
    case 'tasks-decomposed':
      return {
        id,
        timestamp: event.timestamp,
        type: 'tasks-decomposed',
        message: `Tasks decomposed (${event.taskCount} tasks)`
      };
    case 'task-assigned':
    case 'task-started':
      return {
        id,
        timestamp: event.timestamp,
        type: 'task-started',
        message: `${event.agentId} started ${event.taskId}`,
        meta: { taskId: event.taskId, agentId: event.agentId }
      };
    case 'task-completed':
      return {
        id,
        timestamp: event.timestamp,
        type: 'task-completed',
        message: `${event.agentId} completed ${event.taskId}`,
        meta: { taskId: event.taskId, agentId: event.agentId }
      };
    case 'task-review-started':
      return {
        id,
        timestamp: event.timestamp,
        type: 'review-started',
        message: `${event.reviewerId} started review (${event.taskId})`,
        meta: { taskId: event.taskId, reviewerId: event.reviewerId }
      };
    case 'task-approved':
      return {
        id,
        timestamp: event.timestamp,
        type: 'review-approved',
        message: `Review approved ${event.taskId}`,
        meta: { taskId: event.taskId, reviewerId: event.reviewerId }
      };
    case 'task-rejected':
      return {
        id,
        timestamp: event.timestamp,
        type: 'review-rejected',
        message: `Review rejected ${event.taskId}`,
        meta: { taskId: event.taskId, reviewerId: event.reviewerId }
      };
    case 'agent-started':
      return {
        id,
        timestamp: event.timestamp,
        type: 'agent-ready',
        message: `Agent started: ${event.agentId} (${event.role})`,
        meta: { agentId: event.agentId, role: event.role }
      };
    case 'agent-stopped':
      return {
        id,
        timestamp: event.timestamp,
        type: 'agent-stopped',
        message: `Agent stopped: ${event.agentId}`,
        meta: { agentId: event.agentId }
      };
    case 'agent-blocked':
      return {
        id,
        timestamp: event.timestamp,
        type: 'agent-blocked',
        message: `Agent blocked: ${event.agentId} (${event.taskId})`,
        meta: { agentId: event.agentId, taskId: event.taskId }
      };
    case 'error-occurred':
      return {
        id,
        timestamp: event.timestamp,
        type: 'error',
        message: event.message,
        meta: { severity: event.severity, component: event.component }
      };
    default:
      return null;
  }
}
