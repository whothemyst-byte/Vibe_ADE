import { ipcMain } from 'electron';
import { FileOwnershipManager } from '../services/FileOwnershipManager';

export interface FileOwnershipSnapshot {
  byFile: Record<string, string>;
  byTask: Record<string, string[]>;
}

export function buildFileOwnershipSnapshot(): FileOwnershipSnapshot {
  const mgr = FileOwnershipManager.getInstance();
  const allFiles = mgr.getAllOwnedFiles();
  const byFile: Record<string, string> = {};
  for (const [filePath, owner] of allFiles.entries()) {
    byFile[filePath] = owner;
  }

  const byTask: Record<string, string[]> = {};
  const taskIds = (mgr as unknown as { taskFileMap: Map<string, Set<string>> }).taskFileMap.keys();
  for (const taskId of taskIds) {
    byTask[taskId] = Array.from(mgr.getFilesOwnedByTask(taskId));
  }
  return { byFile, byTask };
}

export function registerFileOwnershipHandlers(): void {
  ipcMain.handle('fileOwnership:list', () => buildFileOwnershipSnapshot());
}
