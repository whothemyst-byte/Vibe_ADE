import type { AgentStructuredOutput, AppState, CommandBlock, PaneId, ShellType, TaskItem, WorkspaceId, WorkspaceState, WorkspaceTemplate } from './types';

export interface TerminalDataEvent {
  paneId: PaneId;
  data: string;
}

export interface TerminalExitEvent {
  paneId: PaneId;
  exitCode: number;
}

export interface AgentUpdateEvent {
  paneId: PaneId;
  output: AgentStructuredOutput;
}

export interface TemplateProgressEvent {
  workspaceId: WorkspaceId;
  command: string;
  output: string;
  done: boolean;
  success: boolean;
}

export interface MenuActionEvent {
  action: 'new-environment' | 'open-environment' | 'settings' | 'save-environment' | 'save-as-environment';
}

export interface AuthSession {
  user: {
    id: string;
    email: string | null;
  };
  accessToken: string;
  expiresAt: number;
}

export interface CloudSyncStatus {
  configured: boolean;
  authenticated: boolean;
}

export interface CloudWorkspaceSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
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

export interface VibeAdeApi {
  workspace: {
    list: () => Promise<AppState>;
    create: (input: { name: string; rootDir: string; templateId?: string }) => Promise<WorkspaceState>;
    clone: (workspaceId: WorkspaceId, newName: string) => Promise<WorkspaceState>;
    rename: (workspaceId: WorkspaceId, name: string) => Promise<void>;
    remove: (workspaceId: WorkspaceId) => Promise<void>;
    setActive: (workspaceId: WorkspaceId) => Promise<void>;
    save: (workspace: WorkspaceState) => Promise<void>;
    listTemplates: () => Promise<WorkspaceTemplate[]>;
  };
  terminal: {
    startSession: (input: { workspaceId: WorkspaceId; paneId: PaneId; shell: ShellType; cwd: string }) => Promise<void>;
    stopSession: (paneId: PaneId) => Promise<void>;
    sendInput: (paneId: PaneId, input: string) => Promise<void>;
    executeInSession: (paneId: PaneId, command: string, forceSubmit?: boolean) => Promise<void>;
    resize: (paneId: PaneId, cols: number, rows: number) => Promise<void>;
    runStructuredCommand: (input: { paneId: PaneId; shell: ShellType; cwd: string; command: string }) => Promise<CommandBlock>;
  };
  agent: {
    start: (input: { paneId: PaneId; model: string; prompt: string; cwd: string }) => Promise<void>;
    stop: (paneId: PaneId) => Promise<void>;
  };
  system: {
    selectDirectory: () => Promise<string | null>;
    setSaveMenuEnabled: (enabled: boolean) => Promise<void>;
  };
  auth: {
    getSession: () => Promise<AuthSession | null>;
    login: (email: string, password: string) => Promise<AuthSession>;
    signup: (email: string, password: string) => Promise<AuthSession>;
    logout: () => Promise<void>;
  };
  cloud: {
    getStatus: () => Promise<CloudSyncStatus>;
    listRemoteWorkspaces: () => Promise<CloudWorkspaceSummary[]>;
    getSyncPreview: () => Promise<CloudSyncPreview>;
    pushLocalState: () => Promise<void>;
    pullRemoteToLocal: () => Promise<void>;
  };
  onTerminalData: (listener: (event: TerminalDataEvent) => void) => () => void;
  onTerminalExit: (listener: (event: TerminalExitEvent) => void) => () => void;
  onAgentUpdate: (listener: (event: AgentUpdateEvent) => void) => () => void;
  onTemplateProgress: (listener: (event: TemplateProgressEvent) => void) => () => void;
  onMenuAction: (listener: (event: MenuActionEvent) => void) => () => void;
}
