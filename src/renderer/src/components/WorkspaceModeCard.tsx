import { LayoutGrid, Users, Maximize2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { WorkspaceMode } from '@shared/types';

interface Props {
  mode: WorkspaceMode;
  selected: boolean;
  onClick: () => void;
}

const META: Record<WorkspaceMode, { icon: LucideIcon; title: string; sub: string }> = {
  space: { icon: LayoutGrid, title: 'Space', sub: 'Split-pane workspace for terminals + browser.' },
  swarm: { icon: Users, title: 'Swarm', sub: 'Multi-agent coordination with shared task board.' },
  canvas: { icon: Maximize2, title: 'Canvas', sub: 'Free-form board — drag terminals anywhere, pan and zoom.' }
};

export function WorkspaceModeCard({ mode, selected, onClick }: Props): JSX.Element {
  const { icon: Icon, title, sub } = META[mode];
  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={selected}
      className="text-left bg-bg-elev border border-line rounded-lg p-6 flex flex-col gap-3 hover:border-line-strong data-[selected=true]:border-line-brand data-[selected=true]:shadow-qs-glow transition-colors"
    >
      <Icon className="w-6 h-6 text-fg-accent" />
      <div className="font-display text-lg font-semibold text-fg">{title}</div>
      <div className="text-sm text-fg-muted">{sub}</div>
    </button>
  );
}
