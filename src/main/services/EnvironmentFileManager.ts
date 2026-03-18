import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { LayoutNode, PaneId, WorkspaceState } from '@shared/types';
import type { LocalEnvironmentExportSummary } from '@shared/ipc';
import type { TaskItem } from '@shared/types';

interface EnvironmentExportV2 {
  name: string;
  rootDir: string;
  layout: LayoutNode;
  activePaneId?: PaneId;
}

interface EnvironmentExportFileV2 {
  version: 2;
  exportedAt: string;
  environment: EnvironmentExportV2;
}

function isLayoutNode(value: unknown): value is LayoutNode {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const node = value as Record<string, unknown>;
  if (node.type === 'pane') {
    return typeof node.id === 'string' && typeof node.paneId === 'string';
  }
  if (node.type === 'split') {
    return (
      typeof node.id === 'string'
      && (node.direction === 'horizontal' || node.direction === 'vertical')
      && Array.isArray(node.sizes)
      && Array.isArray(node.children)
      && node.children.every(isLayoutNode)
    );
  }
  return false;
}

function collectPaneIds(layout: LayoutNode): PaneId[] {
  if (layout.type === 'pane') {
    return [layout.paneId];
  }
  return layout.children.flatMap(collectPaneIds);
}

function sanitizeFileComponent(value: string): string {
  const replaced = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return replaced.length > 0 ? replaced.slice(0, 80) : 'Environment';
}

function toExportEnvironment(workspace: WorkspaceState): EnvironmentExportV2 {
  if (!isLayoutNode(workspace.layout)) {
    throw new Error('Invalid environment export: missing layout');
  }

  return {
    name: workspace.name,
    rootDir: workspace.rootDir,
    layout: workspace.layout,
    activePaneId: workspace.activePaneId
  };
}

function cloneLayoutWithNewIds(node: LayoutNode, paneIdMap: Map<PaneId, PaneId>): LayoutNode {
  if (node.type === 'pane') {
    const nextPaneId = uuidv4();
    paneIdMap.set(node.paneId, nextPaneId);
    return {
      id: uuidv4(),
      type: 'pane',
      paneId: nextPaneId
    };
  }

  return {
    id: uuidv4(),
    type: 'split',
    direction: node.direction,
    sizes: Array.isArray(node.sizes) ? [...node.sizes] : [],
    children: node.children.map((child) => cloneLayoutWithNewIds(child, paneIdMap))
  };
}

function toImportedWorkspace(environment: EnvironmentExportV2): WorkspaceState {
  if (!isLayoutNode(environment.layout)) {
    throw new Error('Invalid environment export: missing layout');
  }
  const initialPaneIds = collectPaneIds(environment.layout);
  if (initialPaneIds.length === 0) {
    throw new Error('Invalid environment export: no panes found');
  }

  const snapshot = {
    id: uuidv4(),
    name: environment.name,
    rootDir: environment.rootDir,
    layout: environment.layout,
    activePaneId: environment.activePaneId ?? initialPaneIds[0],
    paneShells: {},
    commandBlocks: {},
    tasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  } satisfies WorkspaceState;

  const paneIdMap = new Map<PaneId, PaneId>();
  const nextLayout = cloneLayoutWithNewIds(snapshot.layout, paneIdMap);
  const nextPaneIds = collectPaneIds(nextLayout);
  const nextActivePaneId = paneIdMap.get(snapshot.activePaneId) ?? nextPaneIds[0];
  const now = new Date().toISOString();

  return {
    ...snapshot,
    layout: nextLayout,
    activePaneId: nextActivePaneId,
    paneShells: Object.fromEntries(nextPaneIds.map((paneId) => [paneId, 'powershell'])),
    commandBlocks: Object.fromEntries(nextPaneIds.map((paneId) => [paneId, []])),
    tasks: [],
    createdAt: now,
    updatedAt: now
  };
}

export async function exportEnvironmentToDirectory(workspace: WorkspaceState, directory: string): Promise<string> {
  const environment = toExportEnvironment(workspace);
  const payload: EnvironmentExportFileV2 = {
    version: 2,
    exportedAt: new Date().toISOString(),
    environment
  };

  await fs.mkdir(directory, { recursive: true });

  const safeName = sanitizeFileComponent(environment.name);
  const fileName = `${safeName}.vibe-ade.json`;
  const targetPath = path.join(directory, fileName);
  const tempPath = `${targetPath}.tmp-${Date.now()}`;

  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), 'utf8');
  await fs.rename(tempPath, targetPath);
  return targetPath;
}

export async function listEnvironmentExports(directory: string): Promise<LocalEnvironmentExportSummary[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(directory);
  } catch {
    return [];
  }

  const candidates = entries
    .filter((name) => name.toLowerCase().endsWith('.vibe-ade.json'))
    .map((name) => path.join(directory, name));

  const summaries = await Promise.all(
    candidates.map(async (filePath): Promise<LocalEnvironmentExportSummary | null> => {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<EnvironmentExportFileV2> | Partial<{ workspace: WorkspaceState; exportedAt?: string }>;

        if ((parsed as Partial<EnvironmentExportFileV2>).version === 2 && (parsed as Partial<EnvironmentExportFileV2>).environment) {
          const file = parsed as Partial<EnvironmentExportFileV2>;
          const env = file.environment as Partial<EnvironmentExportV2>;
          if (!env?.name || !env.rootDir || !env.layout) {
            return null;
          }
          const exportedAt = typeof file.exportedAt === 'string' ? file.exportedAt : new Date().toISOString();
          return {
            filePath,
            workspaceId: path.basename(filePath),
            name: env.name,
            rootDir: env.rootDir,
            exportedAt,
            updatedAt: exportedAt
          };
        }

        // Backward compatibility: older exports that stored a full WorkspaceState.
        const legacy = parsed as Partial<{ workspace?: Partial<WorkspaceState>; exportedAt?: string }> & Partial<WorkspaceState>;
        const workspace = legacy.workspace ?? legacy;
        if (!workspace?.name || !workspace.rootDir || !workspace.layout) {
          return null;
        }
        const exportedAt = typeof legacy.exportedAt === 'string' ? legacy.exportedAt : new Date().toISOString();
        return {
          filePath,
          workspaceId: path.basename(filePath),
          name: workspace.name,
          rootDir: workspace.rootDir,
          exportedAt,
          updatedAt: exportedAt
        };
      } catch {
        return null;
      }
    })
  );

  return summaries
    .filter((item): item is LocalEnvironmentExportSummary => Boolean(item))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function loadEnvironmentExport(filePath: string): Promise<WorkspaceState> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<EnvironmentExportFileV2> | Partial<{ workspace?: Partial<WorkspaceState> }> | Partial<WorkspaceState>;

  if ((parsed as Partial<EnvironmentExportFileV2>).version === 2 && (parsed as Partial<EnvironmentExportFileV2>).environment) {
    const env = (parsed as Partial<EnvironmentExportFileV2>).environment as Partial<EnvironmentExportV2>;
    if (!env?.name || !env.rootDir || !env.layout) {
      throw new Error('Invalid environment export: missing environment metadata');
    }
    return toImportedWorkspace(env as EnvironmentExportV2);
  }

  // Backward compatibility: older exports that stored a full WorkspaceState.
  const legacy = parsed as Partial<{ workspace?: Partial<WorkspaceState> }> & Partial<WorkspaceState>;
  const workspace = legacy.workspace ?? legacy;
  if (!workspace?.name || !workspace.rootDir || !workspace.layout) {
    throw new Error('Invalid environment export: missing workspace metadata');
  }
  return toImportedWorkspace({
    name: workspace.name,
    rootDir: workspace.rootDir,
    layout: workspace.layout as LayoutNode,
    activePaneId: workspace.activePaneId as PaneId | undefined
  });
}

export async function exportTasksToDirectory(workspace: WorkspaceState, directory: string): Promise<string> {
  await fs.mkdir(directory, { recursive: true });
  const safeName = sanitizeFileComponent(workspace.name);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${safeName}-tasks-${timestamp}.json`;
  const targetPath = path.join(directory, fileName);
  const tempPath = `${targetPath}.tmp-${Date.now()}`;
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      rootDir: workspace.rootDir
    },
    tasks: workspace.tasks as TaskItem[]
  };
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), 'utf8');
  await fs.rename(tempPath, targetPath);
  return targetPath;
}
