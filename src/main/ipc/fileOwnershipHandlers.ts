import { ipcMain } from 'electron';
import { FileOwnershipManager } from '../services/FileOwnershipManager';

export interface FileOwnershipSnapshot {
  byFile: Record<string, string>;
  byTask: Record<string, string[]>;
}

export function buildFileOwnershipSnapshot(): FileOwnershipSnapshot {
  const mgr = FileOwnershipManager.getInstance();
  const byFile: Record<string, string> = {};
  for (const [filePath, owner] of mgr.getAllOwnedFiles().entries()) {
    byFile[filePath] = owner;
  }

  const byTask: Record<string, string[]> = {};
  for (const [taskId, files] of mgr.getTaskFileSnapshot().entries()) {
    byTask[taskId] = Array.from(files);
  }
  return { byFile, byTask };
}

export function registerFileOwnershipHandlers(): void {
  ipcMain.handle('fileOwnership:list', () => buildFileOwnershipSnapshot());
}
