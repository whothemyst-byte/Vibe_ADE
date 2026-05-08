import fs from 'node:fs';
import path from 'node:path';
import type { WorkspaceId, WorkspaceState } from '@shared/types';
import type { WorkspaceManager } from '@main/services/WorkspaceManager';

export const MAX_PANE_ID_LENGTH = 128;

export function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${field}`);
  }
}

export function assertPaneId(value: unknown): asserts value is string {
  assertNonEmptyString(value, 'paneId');
  if (value.length > MAX_PANE_ID_LENGTH || value.includes('\0')) {
    throw new Error('Invalid paneId');
  }
}

export function assertWorkspaceId(value: unknown): asserts value is WorkspaceId {
  assertNonEmptyString(value, 'workspaceId');
  if (value.length > 128 || value.includes('\0')) {
    throw new Error('Invalid workspaceId');
  }
}

export function assertWorkspacePayload(value: unknown): asserts value is WorkspaceState {
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

export function assertRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }
}

export function isPathInside(parentDir: string, candidatePath: string): boolean {
  const parent = path.resolve(parentDir);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function assertExistingPath(value: unknown, field: string, kind: 'dir' | 'file' | 'any'): asserts value is string {
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

export function assertWorkspaceCwd(workspaceManager: WorkspaceManager, cwd: unknown): asserts cwd is string {
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

export function assertWorkspacePath(
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
