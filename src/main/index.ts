import { app, BrowserWindow, nativeTheme } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createMainWindow } from './windows/mainWindow';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { WorkspaceManager } from './services/WorkspaceManager';
import { TerminalManager } from './services/TerminalManager';
import { TemplateRunner } from './services/TemplateRunner';
import { CrashRecoveryManager } from './services/CrashRecoveryManager';
import { AuthManager } from './services/AuthManager';
import { BillingUsageManager } from './services/BillingUsageManager';
import { CloudSyncManager } from './services/CloudSyncManager';
import { UpdateManager } from './services/UpdateManager';
import { installAppMenu, setSaveMenuEnabled } from './windows/appMenu';

let workspaceManager: WorkspaceManager;
let terminalManager: TerminalManager;
let templateRunner: TemplateRunner;
let crashRecoveryManager: CrashRecoveryManager;
let authManager: AuthManager;
let billingUsageManager: BillingUsageManager;
let cloudSyncManager: CloudSyncManager;
let updateManager: UpdateManager;
let finalizingQuit = false;

const isDev = !app.isPackaged;
if (isDev) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Vibe-ADE-dev'));
}

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

function loadAppConfig(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };
    if (parsed.SUPABASE_URL && !process.env.SUPABASE_URL) {
      process.env.SUPABASE_URL = parsed.SUPABASE_URL;
    }
    if (parsed.SUPABASE_ANON_KEY && !process.env.SUPABASE_ANON_KEY) {
      process.env.SUPABASE_ANON_KEY = parsed.SUPABASE_ANON_KEY;
    }
  } catch (error) {
    console.warn('Failed to read app config:', error);
  }
}

function ensureRuntimeEnvLoaded(): void {
  const cwd = process.cwd();
  const appPath = app.getAppPath();
  const resourcesPath = process.resourcesPath;
  const exeDir = path.dirname(process.execPath);
  const userDataDir = app.getPath('userData');
  const configCandidates = [
    path.join(resourcesPath, 'app-config.json'),
    path.join(appPath, 'app-config.json'),
    path.join(exeDir, 'app-config.json'),
    path.join(userDataDir, 'vibe-ade.config.json')
  ];
  for (const candidate of configCandidates) {
    loadAppConfig(candidate);
  }
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
  templateRunner = new TemplateRunner();
  authManager = new AuthManager(userDataPath);
  billingUsageManager = new BillingUsageManager(authManager);
  cloudSyncManager = new CloudSyncManager({ authManager, workspaceManager });

  const win = createMainWindow();
  if (!updateManager) {
    updateManager = new UpdateManager(win.webContents);
    setTimeout(() => {
      void updateManager.checkForUpdates();
    }, 8_000);
  } else {
    updateManager.setWebContents(win.webContents);
  }
  installAppMenu(win);
  registerIpcHandlers({
    workspaceManager,
    terminalManager,
    templateRunner,
    authManager,
    billingUsageManager,
    cloudSyncManager,
    updateManager,
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

app.on('before-quit', (event) => {
  if (finalizingQuit) {
    return;
  }
  finalizingQuit = true;
  event.preventDefault();

  void (async () => {
    try {
      await workspaceManager?.replaceState({
        activeWorkspaceId: null,
        workspaces: []
      });
    } catch (error) {
      console.error('Failed to clear workspace state during shutdown:', error);
    }

    await Promise.allSettled([
      terminalManager?.shutdown(),
      crashRecoveryManager?.markCleanShutdown()
    ]);

    app.exit(0);
  })();
});
