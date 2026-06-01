import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { deriveMindmap, type MindmapNode } from '@renderer/state/slices/mindmapSlice';
import type { FileOwnershipSnapshot } from '@shared/ipc';
import { MindmapTaskNode, MindmapAgentNode, MindmapFileNode } from './MindmapNode';

const NODE_TYPES = {
  task: MindmapTaskNode,
  agent: MindmapAgentNode,
  file: MindmapFileNode
};

const COLUMN_X = { task: 80, agent: 420, file: 760 } as const;
const Y_STEP = 80;

interface SerializedSwarmTask {
  taskId: string;
  context?: { goal?: string };
  tracking?: { assignedAgent?: string };
  fileOwnership?: { ownedBy?: string; files: string[] };
}

interface SerializedAgent {
  agentId: string;
  role: string;
}

interface SerializedSwarmState {
  swarmId: string;
  tasks: Record<string, SerializedSwarmTask>;
  agents: Record<string, SerializedAgent>;
  fileOwnershipMap: Record<string, string>;
}

interface MindmapInput {
  tasks: Array<{ id: string; title: string; assignedAgentIds: string[] }>;
  agents: Array<{ id: string; name: string }>;
  ownership: FileOwnershipSnapshot;
}

function buildFromSwarm(state: SerializedSwarmState): MindmapInput {
  const tasks = Object.values(state.tasks).map((t) => ({
    id: t.taskId,
    title: t.context?.goal || t.taskId,
    assignedAgentIds: t.tracking?.assignedAgent ? [t.tracking.assignedAgent] : []
  }));
  const agents = Object.values(state.agents).map((a) => ({
    id: a.agentId,
    name: `${a.role}:${a.agentId}`
  }));
  const byFile: Record<string, string> = {};
  const byTask: Record<string, string[]> = {};
  for (const [filePath, taskId] of Object.entries(state.fileOwnershipMap)) {
    const owner = state.tasks[taskId]?.fileOwnership?.ownedBy;
    if (owner) {
      byFile[filePath] = owner;
    }
    (byTask[taskId] ??= []).push(filePath);
  }
  return { tasks, agents, ownership: { byFile, byTask } };
}

function layoutLayered(nodes: MindmapNode[]): Array<{
  id: string;
  type: 'task' | 'agent' | 'file';
  position: { x: number; y: number };
  data: { label: string };
}> {
  const byType: Record<'task' | 'agent' | 'file', MindmapNode[]> = { task: [], agent: [], file: [] };
  for (const n of nodes) byType[n.type].push(n);
  return nodes.map((n) => {
    const col = byType[n.type];
    const i = col.findIndex((x) => x.id === n.id);
    return { id: n.id, type: n.type, position: { x: COLUMN_X[n.type], y: 60 + i * Y_STEP }, data: { label: n.label } };
  });
}

export function MindmapView(): JSX.Element {
  const ws = useWorkspaceStore((s) => s.appState.workspaces.find((w) => w.id === s.appState.activeWorkspaceId));
  const activeSwarmId = useWorkspaceStore((s) => s.ui.activeSwarmId);
  const [swarmState, setSwarmState] = useState<SerializedSwarmState | null>(null);

  useEffect(() => {
    if (!activeSwarmId) {
      setSwarmState(null);
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const snap = (await window.vibeAde.swarm.state(activeSwarmId)) as SerializedSwarmState | null;
        if (!cancelled) setSwarmState(snap ?? null);
      } catch {
        if (!cancelled) setSwarmState(null);
      }
    };
    void load();
    const unsubscribe = window.vibeAde.onSwarmUpdate((payload) => {
      if (payload.swarmId !== activeSwarmId) return;
      setSwarmState(payload.state as SerializedSwarmState);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeSwarmId]);

  const { tasks, agents, ownership } = useMemo<MindmapInput>(() => {
    if (swarmState) return buildFromSwarm(swarmState);
    const wsTasks = (ws?.tasks ?? []).map((t) => ({ id: t.id, title: t.title, assignedAgentIds: [] as string[] }));
    return { tasks: wsTasks, agents: [], ownership: { byFile: {}, byTask: {} } };
  }, [swarmState, ws?.tasks]);

  const { nodes, edges } = useMemo(() => deriveMindmap(tasks, agents, ownership), [tasks, agents, ownership]);
  const rfNodes = useMemo(() => layoutLayered(nodes), [nodes]);
  const rfEdges = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        style: { stroke: 'var(--qs-stone-500)' },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--qs-stone-500)' }
      })),
    [edges]
  );

  return (
    <div className="w-full h-full bg-bg">
      <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={NODE_TYPES} fitView>
        <Background color="var(--qs-ink-700)" gap={32} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
