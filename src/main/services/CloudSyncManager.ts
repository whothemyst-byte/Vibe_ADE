import type { AppState, BrowserPaneState, LayoutNode, PaneId, PaneType, WorkspaceState } from '@shared/types';
import { normalizeSubscriptionState } from '@shared/subscription';
import type { AuthManager } from './AuthManager';
import type { WorkspaceManager } from './WorkspaceManager';
import { getWorkspaceSyncKey } from './workspaceSync';

interface SupabaseWorkspaceRow {
  id: string;
  user_id: string;
  name: string;
  root_dir: string;
  active_pane_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface SupabaseLayoutRow {
  id: string;
  workspace_id: string;
  user_id: string;
  layout: LayoutNode;
  pane_types: Record<PaneId, PaneType>;
  pane_shells: Record<PaneId, 'powershell' | 'cmd'>;
  browser_panes: Record<PaneId, BrowserPaneState>;
  command_blocks: WorkspaceState['commandBlocks'];
  tasks: WorkspaceState['tasks'];
  is_current: boolean;
  updated_at: string;
}


export interface CloudWorkspaceSummary {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
}


export interface CloudSyncStatus {
  configured: boolean;
  authenticated: boolean;
}

export type CloudSyncWinner = 'local' | 'remote' | 'equal';

export interface CloudSyncConflict {
  workspaceId: string;
  workspaceName: string;
  localUpdatedAt: string | null;
  remoteUpdatedAt: string | null;
  winner: CloudSyncWinner;
}


export interface CloudSyncPreview {
  strategy: 'last_write_wins';
  compared: number;
  localWins: number;
  remoteWins: number;
  equal: number;
  conflicts: CloudSyncConflict[];
}

interface RemoteWorkspaceMeta {
  id: string;
  name: string;
  rootDir: string;
  updatedAt: string;
}

interface RemoteWorkspaceLookup {
  byId: Map<string, RemoteWorkspaceMeta>;
  byKey: Map<string, RemoteWorkspaceMeta>;
}


function firstPaneId(layout: LayoutNode): string {
  if (layout.type === 'pane') {
    return layout.paneId;
  }
  return firstPaneId(layout.children[0]);
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

export class CloudSyncManager {
  private readonly supabaseUrl: string | null;
  private readonly supabaseAnonKey: string | null;
  private readonly authManager: AuthManager;
  private readonly workspaceManager: WorkspaceManager;

  constructor(input: { authManager: AuthManager; workspaceManager: WorkspaceManager }) {
    this.supabaseUrl = process.env.SUPABASE_URL ?? null;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? null;
    this.authManager = input.authManager;
    this.workspaceManager = input.workspaceManager;
  }

  async getStatus(): Promise<CloudSyncStatus> {
    const configured = Boolean(this.supabaseUrl && this.supabaseAnonKey);
    if (!configured) {
      return { configured, authenticated: false };
    }
    const session = await this.authManager.getSession();
    return { configured, authenticated: Boolean(session) };
  }

  async listRemoteWorkspaces(): Promise<CloudWorkspaceSummary[]> {
    const { accessToken } = await this.requireSession();
    const rows = await this.fetchRows<SupabaseWorkspaceRow[]>(
      '/rest/v1/workspaces?select=id,name,created_at,updated_at',
      { method: 'GET' },
      accessToken
    );
    const metaById = await this.fetchRemoteWorkspaceMeta(accessToken);
    return rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: metaById.byId.get(row.id)?.updatedAt ?? row.updated_at
      }))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  async getSyncPreview(): Promise<CloudSyncPreview> {
    const { accessToken } = await this.requireSession();
    const localState = this.workspaceManager.list();
    const remoteLookup = await this.fetchRemoteWorkspaceMeta(accessToken);
    return this.buildPreview(localState.workspaces, remoteLookup.byKey);
  }

  async pushLocalState(): Promise<void> {
    const session = await this.requireSession();
    const local = this.workspaceManager.list();
    const remoteLookup = await this.fetchRemoteWorkspaceMeta(session.accessToken);
    const pushableWorkspaces = local.workspaces.filter((workspace) => {
      const remote = remoteLookup.byId.get(workspace.id) ?? remoteLookup.byKey.get(getWorkspaceSyncKey(workspace));
      if (!remote) {
        return true;
      }
      return this.compareIso(workspace.updatedAt, remote.updatedAt) >= 0;
    });

    const workspaceRows = pushableWorkspaces.map((workspace) => ({
      id: remoteLookup.byId.get(workspace.id)?.id ?? remoteLookup.byKey.get(getWorkspaceSyncKey(workspace))?.id ?? workspace.id,
      user_id: session.user.id,
      name: workspace.name,
      root_dir: workspace.rootDir,
      selected_model: null,
      active_pane_id: workspace.activePaneId,
      metadata: {
        sync_key: getWorkspaceSyncKey(workspace),
        local_updated_at: workspace.updatedAt,
        local_created_at: workspace.createdAt
      },
      created_at: workspace.createdAt,
      updated_at: workspace.updatedAt
    }));

    if (workspaceRows.length > 0) {
      await this.fetchRows(
        '/rest/v1/workspaces?on_conflict=id',
        {
          method: 'POST',
          headers: {
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(workspaceRows)
        },
        session.accessToken
      );
    }

    const layoutRows = pushableWorkspaces.map((workspace) => ({
      id: remoteLookup.byId.get(workspace.id)?.id ?? remoteLookup.byKey.get(getWorkspaceSyncKey(workspace))?.id ?? workspace.id,
      workspace_id: remoteLookup.byId.get(workspace.id)?.id ?? remoteLookup.byKey.get(getWorkspaceSyncKey(workspace))?.id ?? workspace.id,
      user_id: session.user.id,
      version: 1,
      preset_id: null,
      pane_order: this.collectPaneIds(workspace.layout),
      layout: workspace.layout,
      pane_types: workspace.paneTypes,
      pane_shells: workspace.paneShells,
      browser_panes: workspace.browserPanes,
      command_blocks: workspace.commandBlocks,
      tasks: workspace.tasks,
      is_current: true,
      updated_at: workspace.updatedAt
    }));

    if (layoutRows.length > 0) {
      await this.fetchRows(
        '/rest/v1/terminal_layouts?on_conflict=id',
        {
          method: 'POST',
          headers: {
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(layoutRows)
        },
        session.accessToken
      );
    }
  }

  async pullRemoteState(): Promise<AppState> {
    const { accessToken } = await this.requireSession();
    const workspaces = await this.fetchRows<SupabaseWorkspaceRow[]>(
      '/rest/v1/workspaces?select=id,name,root_dir,active_pane_id,metadata,created_at,updated_at&order=updated_at.desc',
      { method: 'GET' },
      accessToken
    );
    const layouts = await this.fetchRows<SupabaseLayoutRow[]>(
      '/rest/v1/terminal_layouts?select=id,workspace_id,user_id,layout,pane_types,pane_shells,browser_panes,command_blocks,tasks,is_current,updated_at&is_current=eq.true',
      { method: 'GET' },
      accessToken
    );

    const layoutByWorkspace = new Map<string, SupabaseLayoutRow>();
    for (const layout of layouts) {
      layoutByWorkspace.set(layout.workspace_id, layout);
    }

    const mapped = workspaces
      .map((workspace): WorkspaceState | null => {
        const layoutRow = layoutByWorkspace.get(workspace.id);
        if (!layoutRow) {
          return null;
        }
        const layout = layoutRow.layout;
        const activePaneId = workspace.active_pane_id ?? firstPaneId(layout);
        const paneIds = this.collectPaneIds(layout);
        const paneTypes = Object.fromEntries(
          paneIds.map((paneId) => [paneId, layoutRow.pane_types?.[paneId] ?? 'terminal'])
        ) as Record<PaneId, PaneType>;
        return {
          id: workspace.id,
          name: workspace.name,
          rootDir: workspace.root_dir,
          layout,
          paneTypes,
          paneShells: layoutRow.pane_shells ?? {},
          browserPanes: Object.fromEntries(
            paneIds
              .filter((paneId) => paneTypes[paneId] === 'browser')
              .map((paneId) => [paneId, normalizeBrowserPaneState(layoutRow.browser_panes?.[paneId])])
          ) as Record<PaneId, BrowserPaneState>,
          activePaneId,
          commandBlocks: layoutRow.command_blocks ?? {},
          tasks: layoutRow.tasks ?? [],
          createdAt: workspace.created_at,
          updatedAt: layoutRow.updated_at ?? workspace.updated_at
        };
      })
      .filter((workspace): workspace is WorkspaceState => workspace !== null);

    return {
      activeWorkspaceId: mapped[0]?.id ?? null,
      workspaces: mapped
    };
  }

  async pullRemoteToLocal(): Promise<void> {
    const remote = await this.pullRemoteState();
    const local = this.workspaceManager.list();
    if (remote.workspaces.length === 0 && local.workspaces.length === 0) {
      throw new Error('No remote data available to pull.');
    }
    const merged = this.mergeLocalAndRemote(local, remote);
    await this.workspaceManager.replaceState(merged);
  }

  private collectPaneIds(layout: LayoutNode): PaneId[] {
    if (layout.type === 'pane') {
      return [layout.paneId];
    }
    return layout.children.flatMap((child) => this.collectPaneIds(child));
  }

  private async requireSession(): Promise<{ accessToken: string; user: { id: string; email: string | null } }> {
    const configured = Boolean(this.supabaseUrl && this.supabaseAnonKey);
    if (!configured) {
      throw new Error('Cloud sync is not configured. Missing SUPABASE_URL / SUPABASE_ANON_KEY.');
    }
    const session = await this.authManager.getSessionWithToken();
    if (!session) {
      throw new Error('No authenticated user session.');
    }
    return {
      accessToken: session.accessToken,
      user: session.user
    };
  }

  private async fetchRows<T>(endpoint: string, init: RequestInit, accessToken: string): Promise<T> {
    const response = await fetch(`${this.supabaseUrl}${endpoint}`, {
      ...init,
      headers: {
        apikey: this.supabaseAnonKey as string,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    });
    const contentType = response.headers.get('content-type');
    const payload = contentType?.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      if (payload && typeof payload === 'object') {
        const message = (payload as { message?: string; hint?: string }).message
          ?? (payload as { message?: string; hint?: string }).hint;
        throw new Error(message ?? `Cloud sync request failed (${response.status}).`);
      }
      throw new Error(`Cloud sync request failed (${response.status}).`);
    }
    return payload as T;
  }

  private async fetchRemoteWorkspaceMeta(accessToken: string): Promise<RemoteWorkspaceLookup> {
    const workspaces = await this.fetchRows<Array<Pick<SupabaseWorkspaceRow, 'id' | 'name' | 'root_dir' | 'updated_at'>>>(
      '/rest/v1/workspaces?select=id,name,root_dir,updated_at',
      { method: 'GET' },
      accessToken
    );
    const layouts = await this.fetchRows<Array<Pick<SupabaseLayoutRow, 'workspace_id' | 'updated_at'>>>(
      '/rest/v1/terminal_layouts?select=workspace_id,updated_at&is_current=eq.true',
      { method: 'GET' },
      accessToken
    );

    const metaById = new Map<string, RemoteWorkspaceMeta>();
    const metaByKey = new Map<string, RemoteWorkspaceMeta>();
    for (const workspace of workspaces) {
      const meta = {
        id: workspace.id,
        name: workspace.name,
        rootDir: workspace.root_dir,
        updatedAt: workspace.updated_at
      };
      metaById.set(workspace.id, meta);
      metaByKey.set(getWorkspaceSyncKey({ id: workspace.id, rootDir: workspace.root_dir }), meta);
    }

    for (const layout of layouts) {
      const existing = metaById.get(layout.workspace_id);
      if (!existing) {
        continue;
      }
      if (this.compareIso(layout.updated_at, existing.updatedAt) > 0) {
        existing.updatedAt = layout.updated_at;
      }
    }

    return { byId: metaById, byKey: metaByKey };
  }

  private buildPreview(localWorkspaces: WorkspaceState[], remoteByKey: Map<string, RemoteWorkspaceMeta>): CloudSyncPreview {
    const conflicts: CloudSyncConflict[] = [];
    let localWins = 0;
    let remoteWins = 0;
    let equal = 0;

    for (const local of localWorkspaces) {
      const remote = remoteByKey.get(getWorkspaceSyncKey(local));
      if (!remote) {
        continue;
      }

      const comparison = this.compareIso(local.updatedAt, remote.updatedAt);
      const winner: CloudSyncWinner = comparison > 0 ? 'local' : comparison < 0 ? 'remote' : 'equal';
      if (winner === 'local') {
        localWins += 1;
      } else if (winner === 'remote') {
        remoteWins += 1;
      } else {
        equal += 1;
      }

      conflicts.push({
        workspaceId: local.id,
        workspaceName: local.name,
        localUpdatedAt: local.updatedAt,
        remoteUpdatedAt: remote.updatedAt,
        winner
      });
    }

    return {
      strategy: 'last_write_wins',
      compared: conflicts.length,
      localWins,
      remoteWins,
      equal,
      conflicts: conflicts.sort((a, b) => Date.parse(b.remoteUpdatedAt ?? '') - Date.parse(a.remoteUpdatedAt ?? ''))
    };
  }

  private mergeLocalAndRemote(local: AppState, remote: AppState): AppState {
    const localByKey = new Map(local.workspaces.map((workspace) => [getWorkspaceSyncKey(workspace), workspace]));
    const remoteByKey = new Map(remote.workspaces.map((workspace) => [getWorkspaceSyncKey(workspace), workspace]));
    const localActiveKey = this.findWorkspaceKey(local.workspaces, local.activeWorkspaceId);
    const remoteActiveKey = this.findWorkspaceKey(remote.workspaces, remote.activeWorkspaceId);
    const mergedByKey = new Map<string, WorkspaceState>();

    for (const [workspaceKey, localWorkspace] of localByKey.entries()) {
      const remoteWorkspace = remoteByKey.get(workspaceKey);
      if (!remoteWorkspace) {
        mergedByKey.set(workspaceKey, localWorkspace);
        continue;
      }
      const comparison = this.compareIso(localWorkspace.updatedAt, remoteWorkspace.updatedAt);
      const winner = comparison > 0 ? localWorkspace : remoteWorkspace;
      mergedByKey.set(workspaceKey, winner.id === remoteWorkspace.id ? winner : { ...winner, id: remoteWorkspace.id });
    }

    for (const [workspaceKey, remoteWorkspace] of remoteByKey.entries()) {
      if (!mergedByKey.has(workspaceKey)) {
        mergedByKey.set(workspaceKey, remoteWorkspace);
      }
    }

    const mergedWorkspaces = Array.from(mergedByKey.values()).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const activeWorkspaceId = (localActiveKey && mergedByKey.get(localActiveKey)?.id)
      ?? (remoteActiveKey && mergedByKey.get(remoteActiveKey)?.id)
      ?? mergedWorkspaces[0]?.id
      ?? null;

    return {
      activeWorkspaceId,
      workspaces: mergedWorkspaces,
      subscription: normalizeSubscriptionState(remote.subscription ?? local.subscription)
    };
  }

  private compareIso(a: string, b: string): number {
    const left = Date.parse(a);
    const right = Date.parse(b);
    if (Number.isNaN(left) && Number.isNaN(right)) {
      return 0;
    }
    if (Number.isNaN(left)) {
      return -1;
    }
    if (Number.isNaN(right)) {
      return 1;
    }
    if (left === right) {
      return 0;
    }
    return left > right ? 1 : -1;
  }

  private findWorkspaceKey(workspaces: WorkspaceState[], workspaceId: string | null): string | null {
    if (!workspaceId) {
      return null;
    }
    const workspace = workspaces.find((item) => item.id === workspaceId);
    return workspace ? getWorkspaceSyncKey(workspace) : null;
  }
}
