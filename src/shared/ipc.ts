import type {
  AppState,
  CommandBlock,
  PaneId,
  ShellType,
  TaskItem,
  TaskPriority,
  TaskStatus,
  WorkspaceId,
  WorkspaceState,
  WorkspaceTemplate
} from './types';

export interface TerminalDataEvent {
  paneId: PaneId;
  data: string;
}

export interface TerminalExitEvent {
  paneId: PaneId;
  exitCode: number;
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

export type SystemMenuAction =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'reload'
  | 'forceReload'
  | 'toggleDevTools'
  | 'resetZoom'
  | 'zoomIn'
  | 'zoomOut'
  | 'togglefullscreen'
  | 'minimize'
  | 'zoom'
  | 'close'
  | 'quit'
  | 'about';

export interface AuthSession {
  user: {
    id: string;
    email: string | null;
  };
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

// ---- QuanSwarm IPC shapes (serializable) ----

export type SwarmAgentRole = 'coordinator' | 'builder' | 'scout' | 'reviewer';
export type SwarmCliProvider = 'claude' | 'codex' | 'gemini';

export interface SwarmAgentConfig {
  agentId: string;
  role: SwarmAgentRole;
  cliProvider: SwarmCliProvider;
}

export interface SwarmCreateConfig {
  swarmId: string;
  goal: string;
  codebaseRoot: string;
  agents: SwarmAgentConfig[];
}

export type SwarmCreateResult =
  | { success: true; swarmState: unknown }
  | { success: false; error: string };

export interface SwarmAgentStatusEvent {
  swarmId: string;
  agent: unknown;
}

export interface SwarmUpdateEvent {
  swarmId: string;
  state: unknown;
}

export interface SwarmTranscriptEvent {
  swarmId: string;
  event: unknown;
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
    startSession: (input: {
      workspaceId: WorkspaceId;
      paneId: PaneId;
      shell: ShellType;
      cwd: string;
      cols?: number;
      rows?: number;
    }) => Promise<void>;
    stopSession: (paneId: PaneId) => Promise<void>;
    sendInput: (paneId: PaneId, input: string) => Promise<void>;
    executeInSession: (paneId: PaneId, command: string, forceSubmit?: boolean) => Promise<void>;
    resize: (paneId: PaneId, cols: number, rows: number) => Promise<void>;
    getSessionSnapshot: (paneId: PaneId) => Promise<{ paneId: PaneId; shell: ShellType; cwd: string; history: string } | null>;
    runStructuredCommand: (input: { paneId: PaneId; shell: ShellType; cwd: string; command: string }) => Promise<CommandBlock>;
  };
  system: {
    selectDirectory: () => Promise<string | null>;
    setSaveMenuEnabled: (enabled: boolean) => Promise<void>;
    setWindowTheme: (input: { base: 'light' | 'dark'; headerColor: string }) => Promise<void>;
    performMenuAction: (action: SystemMenuAction) => Promise<void>;
    readClipboardText: () => Promise<string>;
    readClipboardImageDataUrl: () => Promise<string | null>;
    writeClipboardText: (text: string) => Promise<void>;
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
  task: {
    list: (workspaceId: WorkspaceId) => Promise<TaskItem[]>;
    create: (
      workspaceId: WorkspaceId,
      input: {
        title: string;
        description?: string;
        status?: TaskStatus;
        priority?: TaskPriority;
        startAt?: string;
        endAt?: string;
        dueAt?: string;
        labels?: string[];
        paneId?: PaneId;
      }
    ) => Promise<TaskItem>;
    update: (
      workspaceId: WorkspaceId,
      taskId: string,
      patch: Partial<{
        title: string;
        description: string;
        status: TaskStatus;
        priority: TaskPriority;
        startAt?: string;
        endAt?: string;
        dueAt?: string;
        labels: string[];
        paneId?: PaneId;
        archived: boolean;
        order: number;
      }>
    ) => Promise<TaskItem>;
    delete: (workspaceId: WorkspaceId, taskId: string) => Promise<void>;
    move: (workspaceId: WorkspaceId, taskId: string, toStatus: TaskStatus, toIndex: number) => Promise<void>;
    archive: (workspaceId: WorkspaceId, taskId: string, archived?: boolean) => Promise<void>;
  };
  onTerminalData: (listener: (event: TerminalDataEvent) => void) => () => void;
  onTerminalExit: (listener: (event: TerminalExitEvent) => void) => () => void;
  onTemplateProgress: (listener: (event: TemplateProgressEvent) => void) => () => void;
  onMenuAction: (listener: (event: MenuActionEvent) => void) => () => void;
  swarm: {
    create: (config: SwarmCreateConfig) => Promise<SwarmCreateResult>;
    status: (swarmId: string) => Promise<unknown>;
    state: (swarmId: string) => Promise<unknown>;
    events: (swarmId: string, count?: number) => Promise<unknown[]>;
    agentOutput: (swarmId: string, maxLines?: number) => Promise<unknown[]>;
    stop: (swarmId: string) => Promise<{ success: true } | { success: false; error: string }>;
  };
  onSwarmUpdate: (listener: (event: SwarmUpdateEvent) => void) => () => void;
  onSwarmAgentStatus: (listener: (event: SwarmAgentStatusEvent) => void) => () => void;
  onSwarmEvent: (listener: (event: SwarmTranscriptEvent) => void) => () => void;
}
