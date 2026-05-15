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
  const [ownership, setOwnership] = useState<FileOwnershipSnapshot>({ byFile: {}, byTask: {} });

  useEffect(() => {
    let cancelled = false;
    window.vibeAde.fileOwnership.list().then((snap) => {
      if (!cancelled) setOwnership(snap);
    });
    return () => {
      cancelled = true;
    };
  }, [ws?.id]);

  const tasks = useMemo(
    () => (ws?.tasks ?? []).map((t) => ({ id: t.id, title: t.title, assignedAgentIds: [] as string[] })),
    [ws?.tasks]
  );

  const { nodes, edges } = useMemo(() => deriveMindmap(tasks, [], ownership), [tasks, ownership]);
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
