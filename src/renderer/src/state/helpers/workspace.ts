import type {
  BrowserPaneState,
  CommandBlock,
  PaneId,
  PaneType,
  ShellType,
  WorkspaceState
} from '@shared/types';
import { normalizeBrowserPaneState } from '@shared/browserPane';
import { collectPaneIds } from '@renderer/services/layoutEngine';
import { getPresetIdForPaneCount, type LayoutPresetId } from '@renderer/services/layoutPresets';
import { loadEnvironmentSaveDirectory, saveEnvironmentSaveDirectory } from '@renderer/services/preferences';

export interface UiDirtyMaps {
  layoutPresetByWorkspace: Record<string, LayoutPresetId>;
  paneOrderByWorkspace: Record<string, PaneId[]>;
  unsavedByWorkspace: Record<string, boolean>;
}

export function activeWorkspace(
  appState: { activeWorkspaceId: string | null; workspaces: WorkspaceState[] }
): WorkspaceState | undefined {
  if (!appState.activeWorkspaceId) {
    return undefined;
  }
  return appState.workspaces.find((w) => w.id === appState.activeWorkspaceId);
}

export function normalizeWorkspacePanes(workspace: WorkspaceState): WorkspaceState {
  const paneIds = collectPaneIds(workspace.layout);
  const paneTypes = Object.fromEntries(
    paneIds.map((paneId) => [paneId, workspace.paneTypes?.[paneId] ?? 'terminal'])
  ) as Record<PaneId, PaneType>;
  const paneShells = Object.fromEntries(
    paneIds.filter((paneId) => paneTypes[paneId] === 'terminal').map((paneId) => [paneId, workspace.paneShells?.[paneId] ?? 'powershell'])
  ) as Record<PaneId, ShellType>;
  const browserPanes = Object.fromEntries(
    paneIds
      .filter((paneId) => paneTypes[paneId] === 'browser')
      .map((paneId) => [paneId, normalizeBrowserPaneState(workspace.browserPanes?.[paneId])])
  ) as Record<PaneId, BrowserPaneState>;
  const commandBlocks = Object.fromEntries(
    paneIds.map((paneId) => [paneId, workspace.commandBlocks?.[paneId] ?? []])
  ) as Record<PaneId, CommandBlock[]>;
  const activePaneId = paneIds.includes(workspace.activePaneId) ? workspace.activePaneId : (paneIds[0] ?? workspace.activePaneId);

  return {
    ...workspace,
    paneTypes,
    paneShells,
    browserPanes,
    commandBlocks,
    activePaneId
  };
}

export async function resolveEnvironmentSaveDirectory(): Promise<string | null> {
  const existing = loadEnvironmentSaveDirectory();
  if (existing) {
    return existing;
  }
  const selected = await window.vibeAde.system.selectDirectory();
  if (!selected) {
    return null;
  }
  saveEnvironmentSaveDirectory(selected);
  return selected;
}

export function deriveUiMaps(workspaces: WorkspaceState[]): UiDirtyMaps {
  const layoutPresetByWorkspace: Record<string, LayoutPresetId> = {};
  const paneOrderByWorkspace: Record<string, PaneId[]> = {};
  const unsavedByWorkspace: Record<string, boolean> = {};

  for (const workspace of workspaces) {
    const paneIds = collectPaneIds(workspace.layout);
    paneOrderByWorkspace[workspace.id] = paneIds;
    layoutPresetByWorkspace[workspace.id] = getPresetIdForPaneCount(paneIds.length);
    unsavedByWorkspace[workspace.id] = false;
  }

  return { layoutPresetByWorkspace, paneOrderByWorkspace, unsavedByWorkspace };
}
