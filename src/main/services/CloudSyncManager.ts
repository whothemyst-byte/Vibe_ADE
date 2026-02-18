import type { AppState, LayoutNode, PaneId, WorkspaceState } from '@shared/types';
import type { AuthManager } from './AuthManager';
import type { WorkspaceManager } from './WorkspaceManager';

interface SupabaseWorkspaceRow {
  id: string;
  user_id: string;
  name: string;
  root_dir: string;
  selected_model: string | null;
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
  pane_shells: Record<PaneId, 'powershell' | 'cmd'>;
  pane_agents: WorkspaceState['paneAgents'];
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
  updatedAt: string;
}

function firstPaneId(layout: LayoutNode): string {
  if (layout.type === 'pane') {
    return layout.paneId;
  }
  return firstPaneId(layout.children[0]);
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
        updatedAt: metaById.get(row.id)?.updatedAt ?? row.updated_at
      }))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  async getSyncPreview(): Promise<CloudSyncPreview> {
    const { accessToken } = await this.requireSession();
    const localState = this.workspaceManager.list();
    const remoteById = await this.fetchRemoteWorkspaceMeta(accessToken);
    return this.buildPreview(localState.workspaces, remoteById);
  }

  async pushLocalState(): Promise<void> {
    const session = await this.requireSession();
    const local = this.workspaceManager.list();
    const remoteById = await this.fetchRemoteWorkspaceMeta(session.accessToken);
    const pushableWorkspaces = local.workspaces.filter((workspace) => {
      const remote = remoteById.get(workspace.id);
      if (!remote) {
        return true;
      }
      return this.compareIso(workspace.updatedAt, remote.updatedAt) >= 0;
    });

    const workspaceRows = pushableWorkspaces.map((workspace) => ({
      id: workspace.id,
      user_id: session.user.id,
      name: workspace.name,
      root_dir: workspace.rootDir,
      selected_model: workspace.selectedModel,
      active_pane_id: workspace.activePaneId,
      metadata: {
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
      id: workspace.id,
      workspace_id: workspace.id,
      user_id: session.user.id,
      version: 1,
      preset_id: null,
      pane_order: this.collectPaneIds(workspace.layout),
      layout: workspace.layout,
      pane_shells: workspace.paneShells,
      pane_agents: workspace.paneAgents,
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
      '/rest/v1/workspaces?select=id,name,root_dir,selected_model,active_pane_id,metadata,created_at,updated_at&order=updated_at.desc',
      { method: 'GET' },
      accessToken
    );
    const layouts = await this.fetchRows<SupabaseLayoutRow[]>(
      '/rest/v1/terminal_layouts?select=id,workspace_id,user_id,layout,pane_shells,pane_agents,command_blocks,tasks,is_current,updated_at&is_current=eq.true',
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
        return {
          id: workspace.id,
          name: workspace.name,
          rootDir: workspace.root_dir,
          layout,
          paneShells: layoutRow.pane_shells ?? {},
          activePaneId,
          selectedModel: workspace.selected_model ?? 'llama3.2',
          commandBlocks: layoutRow.command_blocks ?? {},
          tasks: layoutRow.tasks ?? [],
          paneAgents: layoutRow.pane_agents ?? {},
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
      throw new Error('No remote workspaces available to pull.');
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

  private async fetchRemoteWorkspaceMeta(accessToken: string): Promise<Map<string, RemoteWorkspaceMeta>> {
    const workspaces = await this.fetchRows<Array<Pick<SupabaseWorkspaceRow, 'id' | 'name' | 'updated_at'>>>(
      '/rest/v1/workspaces?select=id,name,updated_at',
      { method: 'GET' },
      accessToken
    );
    const layouts = await this.fetchRows<Array<Pick<SupabaseLayoutRow, 'workspace_id' | 'updated_at'>>>(
      '/rest/v1/terminal_layouts?select=workspace_id,updated_at&is_current=eq.true',
      { method: 'GET' },
      accessToken
    );

    const metaById = new Map<string, RemoteWorkspaceMeta>();
    for (const workspace of workspaces) {
      metaById.set(workspace.id, {
        id: workspace.id,
        name: workspace.name,
        updatedAt: workspace.updated_at
      });
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

    return metaById;
  }

  private buildPreview(localWorkspaces: WorkspaceState[], remoteById: Map<string, RemoteWorkspaceMeta>): CloudSyncPreview {
    const conflicts: CloudSyncConflict[] = [];
    let localWins = 0;
    let remoteWins = 0;
    let equal = 0;

    for (const local of localWorkspaces) {
      const remote = remoteById.get(local.id);
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
    const localById = new Map(local.workspaces.map((workspace) => [workspace.id, workspace]));
    const remoteById = new Map(remote.workspaces.map((workspace) => [workspace.id, workspace]));
    const mergedById = new Map<string, WorkspaceState>();

    for (const [workspaceId, localWorkspace] of localById.entries()) {
      const remoteWorkspace = remoteById.get(workspaceId);
      if (!remoteWorkspace) {
        mergedById.set(workspaceId, localWorkspace);
        continue;
      }
      const comparison = this.compareIso(localWorkspace.updatedAt, remoteWorkspace.updatedAt);
      mergedById.set(workspaceId, comparison > 0 ? localWorkspace : remoteWorkspace);
    }

    for (const [workspaceId, remoteWorkspace] of remoteById.entries()) {
      if (!mergedById.has(workspaceId)) {
        mergedById.set(workspaceId, remoteWorkspace);
      }
    }

    const mergedWorkspaces = Array.from(mergedById.values()).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const mergedIds = new Set(mergedWorkspaces.map((workspace) => workspace.id));
    const activeWorkspaceId = local.activeWorkspaceId && mergedIds.has(local.activeWorkspaceId)
      ? local.activeWorkspaceId
      : remote.activeWorkspaceId && mergedIds.has(remote.activeWorkspaceId)
        ? remote.activeWorkspaceId
        : mergedWorkspaces[0]?.id ?? null;

    return {
      activeWorkspaceId,
      workspaces: mergedWorkspaces
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
}
