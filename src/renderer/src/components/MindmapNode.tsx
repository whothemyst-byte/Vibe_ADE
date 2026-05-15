import { Handle, Position, type NodeProps } from '@xyflow/react';

export function MindmapTaskNode({ data }: NodeProps): JSX.Element {
  return (
    <div className="bg-bg-elev border border-line-brand rounded-md px-3 py-2 text-sm font-display text-fg shadow-qs-md">
      {data.label as string}
      <Handle type="source" position={Position.Right} />
      <Handle type="target" position={Position.Left} />
    </div>
  );
}

export function MindmapAgentNode({ data }: NodeProps): JSX.Element {
  return (
    <div className="bg-bg-elev border border-line rounded-pill px-3 py-1.5 text-xs text-fg-accent font-medium shadow-qs-sm">
      {data.label as string}
      <Handle type="source" position={Position.Right} />
      <Handle type="target" position={Position.Left} />
    </div>
  );
}

export function MindmapFileNode({ data }: NodeProps): JSX.Element {
  return (
    <div className="bg-bg-sunken border border-line rounded-xs px-2 py-1 text-xs font-mono text-fg-muted">
      {data.label as string}
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
