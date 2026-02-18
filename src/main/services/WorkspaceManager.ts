import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, LayoutNode, PaneAgentState, TaskItem, TaskPriority, TaskStatus, WorkspaceState } from '@shared/types';
import { DEFAULT_TEMPLATES } from './templates';

interface PersistedState extends AppState {
  version: 1;
}

const DEFAULT_TASK_PRIORITY: TaskPriority = 'medium';
const TASK_STATUSES: TaskStatus[] = ['backlog', 'in-progress', 'done'];

function normalizeTaskOrder(tasks: TaskItem[]): TaskItem[] {
  const byStatus: Record<TaskStatus, TaskItem[]> = {
    backlog: [],
    'in-progress': [],
    done: []
  };

  for (const task of tasks) {
    byStatus[task.status].push(task);
  }

  const normalized: TaskItem[] = [];
  for (const status of TASK_STATUSES) {
    const ordered = byStatus[status].sort((a, b) => {
      const byOrder = (a.order ?? 0) - (b.order ?? 0);
      if (byOrder !== 0) {
        return byOrder;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    ordered.forEach((task, index) => {
      normalized.push({ ...task, order: index + 1 });
    });
  }

  return normalized;
}

function normalizeTask(task: TaskItem): TaskItem {
  return {
    ...task,
    priority: task.priority ?? DEFAULT_TASK_PRIORITY,
    labels: Array.isArray(task.labels) ? task.labels.map((label) => label.trim()).filter(Boolean) : [],
    archived: task.archived ?? false,
    order: task.order ?? 0
  };
}

function normalizeWorkspace(workspace: WorkspaceState): WorkspaceState {
  return {
    ...workspace,
    tasks: normalizeTaskOrder((workspace.tasks ?? []).map(normalizeTask))
  };
}

function normalizePersistedState(state: PersistedState): PersistedState {
  const workspaces = state.workspaces.map(normalizeWorkspace);
  const activeWorkspaceId = workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
    ? state.activeWorkspaceId
    : (workspaces[0]?.id ?? null);
  return {
    version: 1,
    activeWorkspaceId,
    workspaces
  };
}

function createDefaultLayout(): LayoutNode {
  const paneId = uuidv4();
  return {
    id: uuidv4(),
    type: 'pane',
    paneId
  };
}

function getFirstPaneId(layout: LayoutNode): string {
  if (layout.type === 'pane') {
    return layout.paneId;
  }
  return getFirstPaneId(layout.children[0]);
}

export class WorkspaceManager {
  private readonly statePath: string;
  private readonly backupPath: string;
  private state: PersistedState = {
    version: 1,
    activeWorkspaceId: null,
    workspaces: []
  };

  constructor(userDataDir: string) {
    this.statePath = path.join(userDataDir, 'vibe-ade-state.json');
    this.backupPath = path.join(userDataDir, 'vibe-ade-state.backup.json');
  }

  async initialize(): Promise<void> {
    try {
      this.state = normalizePersistedState(await this.loadState(this.statePath));
    } catch (primaryError) {
      console.warn('Failed to load primary state file, attempting backup...', primaryError);
      try {
        this.state = normalizePersistedState(await this.loadState(this.backupPath));
        console.info('Loaded state from backup file');
        await this.persist();
      } catch (backupError) {
        console.warn('Failed to load backup state, initializing with empty state', backupError);
        await this.persist();
      }
    }
  }

  list(): AppState {
    return {
      activeWorkspaceId: this.state.activeWorkspaceId,
      workspaces: this.state.workspaces
    };
  }

  templates() {
    return DEFAULT_TEMPLATES;
  }

  async create(input: { name: string; rootDir: string }): Promise<WorkspaceState> {
    const now = new Date().toISOString();
    const layout = createDefaultLayout();
    const firstPaneId = getFirstPaneId(layout);
    const workspace: WorkspaceState = {
      id: uuidv4(),
      name: input.name,
      rootDir: input.rootDir,
      layout,
      paneShells: { [firstPaneId]: 'cmd' },
      activePaneId: firstPaneId,
      selectedModel: 'llama3.2',
      commandBlocks: { [firstPaneId]: [] },
      tasks: [],
      paneAgents: {
        [firstPaneId]: {
          paneId: firstPaneId,
          attached: false,
          model: 'llama3.2',
          running: false
        }
      },
      createdAt: now,
      updatedAt: now
    };

    this.state.workspaces.push(workspace);
    this.state.activeWorkspaceId = workspace.id;
    await this.persist();
    return workspace;
  }

  async clone(workspaceId: string, newName: string): Promise<WorkspaceState> {
    const source = this.requireWorkspace(workspaceId);
    const now = new Date().toISOString();
    const normalizedSource = normalizeWorkspace(source);
    const clone: WorkspaceState = {
      ...structuredClone(normalizedSource),
      id: uuidv4(),
      name: newName,
      createdAt: now,
      updatedAt: now,
      tasks: normalizedSource.tasks.map((task: TaskItem) => ({ ...task, id: uuidv4(), createdAt: now, updatedAt: now })),
      paneAgents: Object.fromEntries(
        Object.entries(normalizedSource.paneAgents).map(([paneId, state]) => {
          const next: PaneAgentState = {
            ...state,
            running: false
          };
          return [paneId, next];
        })
      )
    };

    this.state.workspaces.push(clone);
    this.state.activeWorkspaceId = clone.id;
    await this.persist();
    return clone;
  }

  async rename(workspaceId: string, name: string): Promise<void> {
    const workspace = this.requireWorkspace(workspaceId);
    workspace.name = name;
    workspace.updatedAt = new Date().toISOString();
    await this.persist();
  }

  async remove(workspaceId: string): Promise<void> {
    this.state.workspaces = this.state.workspaces.filter((w) => w.id !== workspaceId);
    if (this.state.activeWorkspaceId === workspaceId) {
      this.state.activeWorkspaceId = this.state.workspaces[0]?.id ?? null;
    }
    await this.persist();
  }

  async setActive(workspaceId: string): Promise<void> {
    this.requireWorkspace(workspaceId);
    this.state.activeWorkspaceId = workspaceId;
    await this.persist();
  }

  async save(workspace: WorkspaceState): Promise<void> {
    const index = this.state.workspaces.findIndex((w) => w.id === workspace.id);
    if (index < 0) {
      throw new Error('Workspace not found');
    }
    const normalizedWorkspace = normalizeWorkspace({
      ...workspace,
      updatedAt: new Date().toISOString()
    });
    this.state.workspaces[index] = normalizedWorkspace;
    await this.persist();
  }

  async replaceState(nextState: AppState): Promise<void> {
    this.state = normalizePersistedState({
      version: 1,
      activeWorkspaceId: nextState.activeWorkspaceId,
      workspaces: nextState.workspaces
    });
    await this.persist();
  }

  private requireWorkspace(workspaceId: string): WorkspaceState {
    const workspace = this.state.workspaces.find((w) => w.id === workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    return workspace;
  }

  private async persist(): Promise<void> {
    try {
      await fs.copyFile(this.statePath, this.backupPath);
    } catch (error) {
      // Only ignore ENOENT (file doesn't exist on first write)
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'ENOENT') {
        console.error('Failed to create backup before persist:', error);
      }
    }
    const tempPath = `${this.statePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(this.state, null, 2), 'utf8');
    await fs.rename(tempPath, this.statePath);
  }

  private async loadState(pathToLoad: string): Promise<PersistedState> {
    const raw = await fs.readFile(pathToLoad, 'utf8');
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.version !== 1 || !Array.isArray(parsed.workspaces)) {
      throw new Error('Invalid persisted state');
    }
    return normalizePersistedState(parsed);
  }
}
