import path from 'node:path';
import type { WorkspaceState } from '@shared/types';

export function normalizeWorkspaceRootDir(rootDir: string): string {
  const trimmed = rootDir.trim();
  if (!trimmed) {
    return '';
  }
  return path
    .normalize(trimmed)
    .replace(/\\/g, '/')
    .replace(/\/+$/g, '')
    .toLowerCase();
}

export function getWorkspaceSyncKey(workspace: Pick<WorkspaceState, 'id' | 'rootDir'>): string {
  const normalizedRootDir = normalizeWorkspaceRootDir(workspace.rootDir);
  return normalizedRootDir || workspace.id;
}
