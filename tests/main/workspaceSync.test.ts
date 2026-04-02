import { describe, expect, it } from 'vitest';
import { getWorkspaceSyncKey, normalizeWorkspaceRootDir } from '../../src/main/services/workspaceSync';

describe('workspace sync identity', () => {
  it('normalizes equivalent root paths to the same sync key', () => {
    expect(normalizeWorkspaceRootDir('C:\\Repo\\')).toBe('c:/repo');
    expect(getWorkspaceSyncKey({ id: 'local-1', rootDir: 'C:\\Repo\\' })).toBe('c:/repo');
    expect(getWorkspaceSyncKey({ id: 'local-2', rootDir: 'c:/repo' })).toBe('c:/repo');
  });
});
