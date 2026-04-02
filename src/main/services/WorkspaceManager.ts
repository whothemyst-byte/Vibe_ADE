import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type {
  BrowserPaneState,
  AppState,
  CommandBlock,
  LayoutNode,
  TaskItem,
  TaskPriority,
  TaskStatus,
  PaneType,
  SubscriptionTier,
  WorkspaceState
} from '@shared/types';
import { currentUsageMonth, normalizeSubscriptionState, SUBSCRIPTION_PLANS } from '@shared/subscription';
import type { AuthManager } from './AuthManager';
import { DEFAULT_TEMPLATES } from './templates';

interface PersistedStateV2 extends AppState {
  version: 2;
}

interface LegacyPersistedStateV1 {
  version: 1;
  activeWorkspaceId: string | null;
  workspaces: WorkspaceState[];
  // Swarm fields were present in v1 and are intentionally ignored now.
  activeSwarmId?: unknown;
  swarms?: unknown;
}

interface SupabaseProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  company: string | null;
  role: string | null;
  timezone: string | null;
  notifications_enabled: boolean | null;
  theme: string | null;
  default_workspace_id: string | null;
  tier: SubscriptionTier | null;
  usage_month: string | null;
  tasks_created: number | null;
  swarms_started: number | null;
}

interface SupabaseProfileSettings {
  id: string;
  email: string | null;
  displayName: string;
  company: string;
  role: string;
  timezone: string;
  notifications: boolean;
  theme: 'light' | 'dark' | 'system';
  defaultWorkspaceId: string;
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
  const { paneAgents, selectedModel, ...rest } = workspace as WorkspaceState & {
    paneAgents?: unknown;
    selectedModel?: unknown;
  };
  const paneIds = collectPaneIds(rest.layout);
  const normalizedPaneTypes = Object.fromEntries(
    paneIds.map((paneId) => [paneId, rest.paneTypes?.[paneId] ?? 'terminal'])
  ) as Record<string, PaneType>;
  const normalizedPaneShells = Object.fromEntries(
    paneIds
      .filter((paneId) => normalizedPaneTypes[paneId] === 'terminal')
      .map((paneId) => [paneId, 'powershell'])
  );
  const normalizedBrowserPanes = Object.fromEntries(
    paneIds
      .filter((paneId) => normalizedPaneTypes[paneId] === 'browser')
      .map((paneId) => [paneId, normalizeBrowserPaneState(workspace.browserPanes?.[paneId])])
  ) as Record<string, BrowserPaneState>;
  return {
    ...rest,
    paneTypes: normalizedPaneTypes,
    paneShells: normalizedPaneShells,
    browserPanes: normalizedBrowserPanes,
    tasks: normalizeTaskOrder((workspace.tasks ?? []).map(normalizeTask))
  };
}

function normalizeBrowserPaneState(pane: Partial<BrowserPaneState> | undefined, fallbackUrl = 'about:blank'): BrowserPaneState {
  const url = typeof pane?.url === 'string' && pane.url.trim() ? pane.url : fallbackUrl;
  const history = Array.isArray(pane?.history)
    ? pane.history.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const nextHistory = history.length > 0 ? history : [url];
  const historyIndex = typeof pane?.historyIndex === 'number' && Number.isFinite(pane.historyIndex)
    ? Math.max(0, Math.min(nextHistory.length - 1, Math.floor(pane.historyIndex)))
    : nextHistory.length - 1;

  return {
    url,
    title: typeof pane?.title === 'string' && pane.title.trim() ? pane.title : url,
    isLoading: Boolean(pane?.isLoading),
    history: nextHistory,
    historyIndex
  };
}

function collectPaneIds(layout: LayoutNode): string[] {
  if (layout.type === 'pane') {
    return [layout.paneId];
  }
  return layout.children.flatMap(collectPaneIds);
}

function normalizePersistedState(state: PersistedStateV2): PersistedStateV2 {
  const workspaces = state.workspaces.map(normalizeWorkspace);
  const activeWorkspaceId = workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
    ? state.activeWorkspaceId
    : (workspaces[0]?.id ?? null);
  return {
    version: 2,
    activeWorkspaceId,
    workspaces,
    subscription: normalizeSubscriptionState(state.subscription)
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

function paneCountForLayoutPreset(layoutPresetId?: string): number {
  switch (layoutPresetId) {
    case '16-pane-grid':
      return 16;
    case '12-pane-grid':
      return 12;
    case '8-pane-grid':
      return 8;
    case '6-pane-grid':
      return 6;
    case '4-pane-grid':
      return 4;
    case '3-pane-left-large':
      return 3;
    case '2-pane-horizontal':
    case '2-pane-vertical':
      return 2;
    case '1-pane':
    default:
      return 1;
  }
}

function createLayoutForPaneCount(count: number, depth = 0): LayoutNode {
  const normalizedCount = Math.max(1, Math.floor(count));
  if (normalizedCount <= 1) {
    return createDefaultLayout();
  }

  const leftCount = Math.ceil(normalizedCount / 2);
  const rightCount = normalizedCount - leftCount;
  const leftShare = (leftCount / normalizedCount) * 100;
  const rightShare = 100 - leftShare;
  const direction = depth % 2 === 0 ? 'vertical' : 'horizontal';

  return {
    id: uuidv4(),
    type: 'split',
    direction,
    sizes: [leftShare, rightShare],
    children: [
      createLayoutForPaneCount(leftCount, depth + 1),
      createLayoutForPaneCount(rightCount, depth + 1)
    ]
  };
}

function createWorkspaceLayout(layoutPresetId?: string): LayoutNode {
  return createLayoutForPaneCount(paneCountForLayoutPreset(layoutPresetId));
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
  private readonly authManager: AuthManager | null;
  private readonly supabaseUrl: string | null;
  private readonly supabaseAnonKey: string | null;
  private state: PersistedStateV2 = {
    version: 2,
    activeWorkspaceId: null,
    workspaces: [],
    subscription: normalizeSubscriptionState()
  };

  constructor(userDataDir: string, authManager: AuthManager | null = null) {
    this.statePath = path.join(userDataDir, 'vibe-ade-state.json');
    this.backupPath = path.join(userDataDir, 'vibe-ade-state.backup.json');
    this.authManager = authManager;
    this.supabaseUrl = process.env.SUPABASE_URL ?? null;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? null;
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

  async syncAccountState(): Promise<AppState> {
    const remote = await this.fetchRemoteSubscription().catch(() => null);
    if (remote) {
      this.state = normalizePersistedState({
        version: 2,
        activeWorkspaceId: this.state.activeWorkspaceId,
        workspaces: this.state.workspaces,
        subscription: remote
      });
      await this.persist();
    }
    return this.list();
  }

  async getProfile(): Promise<SupabaseProfileSettings | null> {
    if (!this.isSupabaseConfigured()) {
      return null;
    }
    const session = await this.requireSession();
    return this.fetchRemoteProfile(session.accessToken, session.user.id);
  }

  async updateProfile(input: Partial<Omit<SupabaseProfileSettings, 'id' | 'email'>>): Promise<SupabaseProfileSettings> {
    if (!this.isSupabaseConfigured()) {
      throw new Error('Supabase is not configured.');
    }
    const session = await this.requireSession();
    const current = await this.fetchRemoteProfile(session.accessToken, session.user.id);
    const next = {
      displayName: input.displayName ?? current?.displayName ?? '',
      company: input.company ?? current?.company ?? '',
      role: input.role ?? current?.role ?? '',
      timezone: input.timezone ?? current?.timezone ?? 'Asia/Calcutta',
      notifications: input.notifications ?? current?.notifications ?? true,
      theme: input.theme ?? current?.theme ?? 'system',
      defaultWorkspaceId: input.defaultWorkspaceId ?? current?.defaultWorkspaceId ?? ''
    };

    await this.upsertRemoteProfile(session.accessToken, session.user.id, session.user.email, next);
    const updated = await this.fetchRemoteProfile(session.accessToken, session.user.id);
    if (!updated) {
      throw new Error('Failed to reload updated profile.');
    }
    return updated;
  }

  list(): AppState {
    return {
      activeWorkspaceId: this.state.activeWorkspaceId,
      workspaces: this.state.workspaces,
      subscription: normalizeSubscriptionState(this.state.subscription)
    };
  }

  templates() {
    return DEFAULT_TEMPLATES;
  }

  async create(input: { name: string; rootDir: string; layoutPresetId?: string }): Promise<WorkspaceState> {
    await this.ensureWorkspaceCapacity();
    const now = new Date().toISOString();
    const layout = createWorkspaceLayout(input.layoutPresetId);
    const paneIds = collectPaneIds(layout);
    const firstPaneId = paneIds[0] ?? getFirstPaneId(layout);
    const paneTypes = Object.fromEntries(paneIds.map((paneId) => [paneId, 'terminal'])) as Record<string, PaneType>;
    const paneShells = Object.fromEntries(paneIds.map((paneId) => [paneId, 'powershell'])) as Record<string, 'powershell'>;
    const browserPanes = Object.fromEntries([]) as Record<string, BrowserPaneState>;
    const commandBlocks = Object.fromEntries(
      paneIds.map((paneId) => [paneId, [] as CommandBlock[]])
    ) as Record<string, CommandBlock[]>;
    const workspace: WorkspaceState = {
      id: uuidv4(),
      name: input.name,
      rootDir: input.rootDir,
      layout,
      paneTypes,
      paneShells,
      browserPanes,
      activePaneId: firstPaneId,
      commandBlocks,
      tasks: [],
      createdAt: now,
      updatedAt: now
    };

    this.state.workspaces.push(workspace);
    this.state.activeWorkspaceId = workspace.id;
    await this.persist();
    return workspace;
  }

  async clone(workspaceId: string, newName: string): Promise<WorkspaceState> {
    await this.ensureWorkspaceCapacity();
    const source = this.requireWorkspace(workspaceId);
    const now = new Date().toISOString();
    const normalizedSource = normalizeWorkspace(source);
    const clone: WorkspaceState = {
      ...structuredClone(normalizedSource),
      id: uuidv4(),
      name: newName,
      createdAt: now,
      updatedAt: now,
      tasks: normalizedSource.tasks.map((task: TaskItem) => ({ ...task, id: uuidv4(), createdAt: now, updatedAt: now }))
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
    if (this.isSupabaseConfigured()) {
      const session = await this.authManager?.getSessionWithToken().catch(() => null);
      if (session) {
        try {
          await this.deleteRemoteWorkspace(workspaceId, session.user.id, session.accessToken);
        } catch (error) {
          console.warn('Failed to delete remote workspace; continuing with local removal:', error);
        }
      }
    }
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
    const nextSubscription = normalizeSubscriptionState(nextState.subscription ?? this.state.subscription);
    this.state = normalizePersistedState({
      version: 2,
      activeWorkspaceId: nextState.activeWorkspaceId,
      workspaces: nextState.workspaces,
      subscription: nextSubscription
    });
    await this.persist();
  }

  async updateSubscription(subscription: AppState['subscription']): Promise<void> {
    const nextSubscription = normalizeSubscriptionState(subscription);
    this.state = normalizePersistedState({
      version: 2,
      activeWorkspaceId: this.state.activeWorkspaceId,
      workspaces: this.state.workspaces,
      subscription: nextSubscription
    });
    await this.persist();
    void this.upsertRemoteSubscription(nextSubscription);
  }

  private requireWorkspace(workspaceId: string): WorkspaceState {
    const workspace = this.state.workspaces.find((w) => w.id === workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    return workspace;
  }

  private async ensureWorkspaceCapacity(): Promise<void> {
    const subscription = normalizeSubscriptionState(this.state.subscription);
    const limit = SUBSCRIPTION_PLANS[subscription.tier].limits.maxCloudSyncedWorkspaces;
    if (limit === null) {
      return;
    }
    if (this.state.workspaces.length < limit) {
      return;
    }
    if (!this.isSupabaseConfigured()) {
      return;
    }
    const session = await this.authManager?.getSession().catch(() => null);
    if (!session) {
      return;
    }
    throw new Error(`Spark plan allows up to ${limit} cloud-synced workspaces. Remove one or upgrade to create another.`);
  }

  private async deleteRemoteWorkspace(workspaceId: string, userId: string, accessToken: string): Promise<void> {
    await this.fetchJson(
      `/rest/v1/terminal_layouts?workspace_id=eq.${encodeURIComponent(workspaceId)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: {
          Prefer: 'return=minimal'
        }
      },
      accessToken
    );
    await this.fetchJson(
      `/rest/v1/workspaces?id=eq.${encodeURIComponent(workspaceId)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: {
          Prefer: 'return=minimal'
        }
      },
      accessToken
    );
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

  private async loadState(pathToLoad: string): Promise<PersistedStateV2> {
    const raw = await fs.readFile(pathToLoad, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid persisted state');
    }

    const version = (parsed as { version?: unknown }).version;
    if (version === 2) {
      const v2 = parsed as PersistedStateV2;
      if (!Array.isArray(v2.workspaces)) {
        throw new Error('Invalid persisted state');
      }
      return normalizePersistedState(v2);
    }

    if (version === 1) {
      const v1 = parsed as LegacyPersistedStateV1;
      if (!Array.isArray(v1.workspaces)) {
        throw new Error('Invalid persisted state');
      }
      // Migrate v1 -> v2 by dropping swarm fields entirely.
      return normalizePersistedState({
        version: 2,
        activeWorkspaceId: v1.activeWorkspaceId ?? null,
        workspaces: v1.workspaces
      });
    }

    throw new Error('Invalid persisted state');
  }

  private isSupabaseConfigured(): boolean {
    return Boolean(this.supabaseUrl && this.supabaseAnonKey && this.authManager);
  }

  private async requireSession(): Promise<{ accessToken: string; user: { id: string; email: string | null } }> {
    if (!this.authManager) {
      throw new Error('Auth manager is not configured.');
    }
    const session = await this.authManager.getSessionWithToken();
    if (!session) {
      throw new Error('No authenticated user session.');
    }
    return session;
  }

  private async fetchJson<T>(endpoint: string, init: RequestInit, accessToken: string): Promise<T> {
    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      throw new Error('Supabase is not configured.');
    }
    const response = await fetch(`${this.supabaseUrl}${endpoint}`, {
      ...init,
      headers: {
        apikey: this.supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    });
    const contentType = response.headers.get('content-type');
    const payload = contentType?.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = typeof payload === 'string'
        ? payload
        : (payload as { message?: string; error?: string; hint?: string }).message
          ?? (payload as { message?: string; error?: string; hint?: string }).error
          ?? (payload as { message?: string; error?: string; hint?: string }).hint
          ?? `Supabase request failed (${response.status})`;
      throw new Error(message);
    }
    return payload as T;
  }

  private async fetchRemoteSubscription(): Promise<AppState['subscription'] | null> {
    if (!this.isSupabaseConfigured()) {
      return null;
    }
    const session = await this.requireSession();
    const rows = await this.fetchJson<SupabaseProfileRow[]>(
      `/rest/v1/profiles?select=id,tier,usage_month,tasks_created,swarms_started&id=eq.${session.user.id}&limit=1`,
      { method: 'GET' },
      session.accessToken
    ).catch(() => []);
    const profile = rows[0];
    if (!profile) {
      return null;
    }
    return normalizeSubscriptionState({
      tier: profile.tier ?? 'spark',
      usage: {
        month: profile.usage_month ?? currentUsageMonth(),
        tasksCreated: profile.tasks_created ?? 0,
        swarmsStarted: profile.swarms_started ?? 0
      }
    });
  }

  private async fetchRemoteProfile(accessToken: string, userId: string): Promise<SupabaseProfileSettings | null> {
    const rows = await this.fetchJson<SupabaseProfileRow[]>(
      `/rest/v1/profiles?select=id,email,display_name,company,role,timezone,notifications_enabled,theme,default_workspace_id&id=eq.${userId}&limit=1`,
      { method: 'GET' },
      accessToken
    ).catch(() => []);
    const profile = rows[0];
    if (!profile) {
      return null;
    }
    return {
      id: profile.id,
      email: profile.email,
      displayName: profile.display_name ?? '',
      company: profile.company ?? '',
      role: profile.role ?? '',
      timezone: profile.timezone ?? 'Asia/Calcutta',
      notifications: profile.notifications_enabled ?? true,
      theme: profile.theme === 'light' || profile.theme === 'dark' ? profile.theme : 'system',
      defaultWorkspaceId: profile.default_workspace_id ?? ''
    };
  }

  private async upsertRemoteSubscription(subscription: AppState['subscription']): Promise<void> {
    if (!this.isSupabaseConfigured()) {
      return;
    }
    try {
      const session = await this.requireSession();
      await this.fetchJson(
        '/rest/v1/profiles?on_conflict=id',
        {
          method: 'POST',
          headers: {
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify([
            {
              id: session.user.id,
              email: session.user.email,
              tier: subscription.tier
            }
          ])
        },
        session.accessToken
      );
    } catch (error) {
      console.warn('Failed to sync subscription to Supabase:', error);
    }
  }

  private async upsertRemoteProfile(
    accessToken: string,
    userId: string,
    email: string | null,
    profile: Omit<SupabaseProfileSettings, 'id' | 'email'>
  ): Promise<void> {
    try {
      await this.fetchJson(
        '/rest/v1/profiles?on_conflict=id',
        {
          method: 'POST',
          headers: {
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify([
            {
              id: userId,
              email,
              display_name: profile.displayName,
              company: profile.company,
              role: profile.role,
              timezone: profile.timezone,
              notifications_enabled: profile.notifications,
              theme: profile.theme,
              default_workspace_id: profile.defaultWorkspaceId || null
            }
          ])
        },
        accessToken
      );
    } catch (error) {
      console.warn('Failed to sync profile to Supabase:', error);
    }
  }
}
