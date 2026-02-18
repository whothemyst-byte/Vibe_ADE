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

export interface AgentStep {
  title: string;
  details: string;
}

export interface AgentCommandSuggestion {
  command: string;
  rationale: string;
  destructive: boolean;
}

export interface AgentStructuredOutput {
  raw: string;
  plan: string;
  steps: AgentStep[];
  commands: AgentCommandSuggestion[];
  explanation: string;
}

export interface PaneAgentState {
  paneId: PaneId;
  attached: boolean;
  model: string;
  running: boolean;
  lastOutput?: AgentStructuredOutput;
}

export type TaskStatus = 'backlog' | 'in-progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskSortMode = 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc' | 'priority-desc' | 'priority-asc' | 'due-asc' | 'due-desc';

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
  selectedModel: string;
  commandBlocks: Record<PaneId, CommandBlock[]>;
  tasks: TaskItem[];
  paneAgents: Record<PaneId, PaneAgentState>;
  createdAt: string;
  updatedAt: string;
}

export interface AppState {
  activeWorkspaceId: WorkspaceId | null;
  workspaces: WorkspaceState[];
}
