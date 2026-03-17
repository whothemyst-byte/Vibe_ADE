export type ShellType = 'powershell' | 'cmd';

export type PaneId = string;
export type WorkspaceId = string;
export type TaskId = string;

export type SplitDirection = 'horizontal' | 'vertical';

export interface PaneLayoutNode {
  id: string;
  type: 'pane';
  paneId: PaneId;
}

export interface SplitLayoutNode {
  id: string;
  type: 'split';
  direction: SplitDirection;
  sizes: number[];
  children: LayoutNode[];
}

export type LayoutNode = PaneLayoutNode | SplitLayoutNode;

export interface CommandBlock {
  id: string;
  paneId: PaneId;
  command: string;
  output: string;
  exitCode: number | null;
  startedAt: string;
  completedAt?: string;
  collapsed: boolean;
}

export type TaskStatus = 'backlog' | 'in-progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskSortMode = 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc' | 'priority-desc' | 'priority-asc' | 'due-asc' | 'due-desc';

export type SubscriptionTier = 'spark' | 'flux' | 'forge';

export interface SubscriptionUsage {
  month: string;
  tasksCreated: number;
  swarmsStarted: number;
}

export interface SubscriptionState {
  tier: SubscriptionTier;
  usage: SubscriptionUsage;
}

export interface TaskFilterState {
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  labels?: string[];
  attachedOnly?: boolean;
  archived?: boolean;
}

export interface TaskItem {
  id: TaskId;
  title: string;
  description: string;
  status: TaskStatus;
  priority?: TaskPriority;
  startAt?: string;
  endAt?: string;
  dueAt?: string;
  labels?: string[];
  archived?: boolean;
  order?: number;
  paneId?: PaneId;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  shell: ShellType;
  commands: string[];
}

export interface WorkspaceState {
  id: WorkspaceId;
  name: string;
  rootDir: string;
  layout: LayoutNode;
  paneShells: Record<PaneId, ShellType>;
  activePaneId: PaneId;
  commandBlocks: Record<PaneId, CommandBlock[]>;
  tasks: TaskItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  activeWorkspaceId: WorkspaceId | null;
  workspaces: WorkspaceState[];
  subscription: SubscriptionState;
}

export type UpdateStatusState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'disabled';

export interface UpdateStatus {
  state: UpdateStatusState;
  version?: string;
  releaseNotes?: string;
  progress?: number;
  error?: string;
  reason?: string;
}
