import type { FileOwnershipSnapshot } from '@shared/ipc';

export interface MindmapNode {
  id: string;
  type: 'task' | 'agent' | 'file';
  label: string;
}
export interface MindmapEdge {
  id: string;
  source: string;
  target: string;
  kind: 'task-agent' | 'agent-file' | 'task-file';
}

interface TaskLike {
  id: string;
  title: string;
  assignedAgentIds?: string[];
}
interface AgentLike {
  id: string;
  name: string;
}

export function deriveMindmap(
  tasks: TaskLike[],
  agents: AgentLike[],
  ownership: FileOwnershipSnapshot
): { nodes: MindmapNode[]; edges: MindmapEdge[] } {
  const nodes: MindmapNode[] = [];
  const edges: MindmapEdge[] = [];

  for (const t of tasks) nodes.push({ id: `task:${t.id}`, type: 'task', label: t.title });
  for (const a of agents) nodes.push({ id: `agent:${a.id}`, type: 'agent', label: a.name });
  for (const f of Object.keys(ownership.byFile)) nodes.push({ id: `file:${f}`, type: 'file', label: f });

  for (const t of tasks) {
    for (const aid of t.assignedAgentIds ?? []) {
      edges.push({
        id: `task:${t.id}->agent:${aid}`,
        source: `task:${t.id}`,
        target: `agent:${aid}`,
        kind: 'task-agent'
      });
    }
  }
  for (const [filePath, agentId] of Object.entries(ownership.byFile)) {
    edges.push({
      id: `agent:${agentId}->file:${filePath}`,
      source: `agent:${agentId}`,
      target: `file:${filePath}`,
      kind: 'agent-file'
    });
  }
  for (const [taskId, files] of Object.entries(ownership.byTask)) {
    for (const f of files) {
      edges.push({
        id: `task:${taskId}->file:${f}`,
        source: `task:${taskId}`,
        target: `file:${f}`,
        kind: 'task-file'
      });
    }
  }
  return { nodes, edges };
}
