import { app, BrowserWindow, nativeTheme } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createMainWindow } from './windows/mainWindow';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { WorkspaceManager } from './services/WorkspaceManager';
import { TerminalManager } from './services/TerminalManager';
import { AgentManager } from './services/AgentManager';
import { TemplateRunner } from './services/TemplateRunner';
import { CrashRecoveryManager } from './services/CrashRecoveryManager';
import { AuthManager } from './services/AuthManager';
import { CloudSyncManager } from './services/CloudSyncManager';
import { installAppMenu, setSaveMenuEnabled } from './windows/appMenu';

let workspaceManager: WorkspaceManager;
let terminalManager: TerminalManager;
let agentManager: AgentManager;
let templateRunner: TemplateRunner;
let crashRecoveryManager: CrashRecoveryManager;
let authManager: AuthManager;
let cloudSyncManager: CloudSyncManager;

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function ensureRuntimeEnvLoaded(): void {
  const cwd = process.cwd();
  const appPath = app.getAppPath();
  const resourcesPath = process.resourcesPath;
  const exeDir = path.dirname(process.execPath);
  const userDataDir = app.getPath('userData');
  const candidates = [
    path.join(cwd, '.env'),
    path.join(cwd, '.env.local'),
    path.join(appPath, '.env'),
    path.join(appPath, '.env.local'),
    path.join(resourcesPath, '.env'),
    path.join(resourcesPath, '.env.local'),
    path.join(exeDir, '.env'),
    path.join(exeDir, '.env.local'),
    path.join(userDataDir, 'vibe-ade.env')
  ];
  for (const candidate of candidates) {
    loadEnvFile(candidate);
  }
}

async function bootstrap(): Promise<void> {
  const userDataPath = app.getPath('userData');
  crashRecoveryManager = new CrashRecoveryManager(userDataPath);
  await crashRecoveryManager.initialize();

  workspaceManager = new WorkspaceManager(userDataPath);
  await workspaceManager.initialize();

  terminalManager = new TerminalManager(userDataPath);
  await terminalManager.initialize();
  agentManager = new AgentManager();
  templateRunner = new TemplateRunner();
  authManager = new AuthManager(userDataPath);
  cloudSyncManager = new CloudSyncManager({ authManager, workspaceManager });

  const win = createMainWindow();
  installAppMenu(win);
  registerIpcHandlers({
    workspaceManager,
    terminalManager,
    agentManager,
    templateRunner,
    authManager,
    cloudSyncManager,
    webContents: win.webContents,
    setSaveMenuEnabled
  });
}

app.whenReady().then(async () => {
  ensureRuntimeEnvLoaded();
  nativeTheme.themeSource = 'dark';
  await bootstrap();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void bootstrap();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  void terminalManager?.shutdown();
  void crashRecoveryManager?.markCleanShutdown();
});
