import { LayoutGrid, Users, Maximize2, Lock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { WorkspaceMode } from '@shared/types';

interface Props {
  mode: WorkspaceMode;
  selected: boolean;
  locked?: boolean;
  onClick: () => void;
}

const META: Record<WorkspaceMode, { icon: LucideIcon; title: string; sub: string }> = {
  space:  { icon: LayoutGrid, title: 'Environment', sub: 'Split-pane workspace for terminals + browser.' },
  swarm:  { icon: Users,      title: 'Swarm',       sub: 'Multi-agent coordination with shared task board.' },
  canvas: { icon: Maximize2,  title: 'Wall',        sub: 'Free-form board — drag terminals anywhere, pan and zoom.' }
};

export function WorkspaceModeCard({ mode, selected, locked, onClick }: Props): JSX.Element {
  const { icon: Icon, title, sub } = META[mode];
  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={selected}
      data-locked={locked ? 'true' : 'false'}
      aria-disabled={locked || undefined}
      className="relative text-left bg-bg-elev border border-line rounded-lg p-6 flex flex-col gap-3 hover:border-line-strong data-[selected=true]:border-line-brand data-[selected=true]:shadow-qs-glow data-[locked=true]:opacity-70 data-[locked=true]:cursor-not-allowed transition-colors"
    >
      {locked && (
        <span className="absolute top-3 right-3 text-qs-warning">
          <Lock className="w-4 h-4" />
        </span>
      )}
      <Icon className="w-6 h-6 text-fg-accent" />
      <div className="font-display text-lg font-semibold text-fg">{title}</div>
      <div className="text-sm text-fg-muted">{sub}</div>
    </button>
  );
}
