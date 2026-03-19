import { app, type WebContents } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateStatus } from '@shared/types';

export class UpdateManager {
  private status: UpdateStatus = { state: 'idle' };
  private webContents: WebContents | null = null;

  constructor(webContents: WebContents) {
    this.webContents = webContents;
    this.configure();
    this.bindEvents();
  }

  setWebContents(webContents: WebContents): void {
    this.webContents = webContents;
    this.emitStatus();
  }

  getStatus(): UpdateStatus {
    return this.status;
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (!app.isPackaged) {
      this.setStatus({ state: 'disabled', reason: 'dev' });
      return this.status;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.setStatus({ state: 'error', error: error instanceof Error ? error.message : 'Update check failed' });
    }
    return this.status;
  }

  async downloadUpdate(): Promise<UpdateStatus> {
    if (!app.isPackaged) {
      this.setStatus({ state: 'disabled', reason: 'dev' });
      return this.status;
    }
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.setStatus({ state: 'error', error: error instanceof Error ? error.message : 'Update download failed' });
    }
    return this.status;
  }

  installUpdate(): void {
    autoUpdater.quitAndInstall(true, true);
  }

  private configure(): void {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
  }

  private bindEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      this.setStatus({ state: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
      this.setStatus({ state: 'available', version: info.version, releaseNotes: normalizeReleaseNotes(info.releaseNotes) });
    });
    autoUpdater.on('update-not-available', () => {
      this.setStatus({ state: 'not-available' });
    });
    autoUpdater.on('download-progress', (progress) => {
      this.setStatus({ state: 'downloading', progress: progress.percent });
    });
    autoUpdater.on('update-downloaded', (info) => {
      this.setStatus({
        state: 'downloaded',
        version: info.version,
        progress: 100,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes)
      });
    });
    autoUpdater.on('error', (error) => {
      this.setStatus({ state: 'error', error: error?.message ?? 'Update error' });
    });
  }

  private setStatus(next: UpdateStatus): void {
    this.status = {
      ...this.status,
      ...next
    };
    this.emitStatus();
  }

  private emitStatus(): void {
    if (this.webContents) {
      this.webContents.send('update:status', this.status);
    }
  }
}

function normalizeReleaseNotes(notes: unknown): string | undefined {
  if (!notes) {
    return undefined;
  }
  if (typeof notes === 'string') {
    return notes.trim() || undefined;
  }
  if (Array.isArray(notes)) {
    return notes
      .map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && 'note' in item) {
          const value = (item as { note?: unknown }).note;
          return typeof value === 'string' ? value : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim() || undefined;
  }
  return undefined;
}
