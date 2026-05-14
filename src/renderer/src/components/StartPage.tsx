import { PlusCircle, Users, FolderOpen, Lock, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import { cn } from './ui';

export function StartPage(): JSX.Element {
  const appState = useWorkspaceStore((s) => s.appState);
  const openCreateFlow = useWorkspaceStore((s) => s.openCreateFlow);
  const openEnvironmentOverlay = useWorkspaceStore((s) => s.openEnvironmentOverlay);
  const openSwarmDashboard = useWorkspaceStore((s) => s.openSwarmDashboard);
  const subscription = useWorkspaceStore((s) => s.appState.subscription);
  const addToast = useToastStore((s) => s.addToast);

  const normalizedSub = normalizeSubscriptionState(subscription);
  const plan = SUBSCRIPTION_PLANS[normalizedSub.tier] ?? SUBSCRIPTION_PLANS.spark;
  const swarmLocked = !plan.features.swarms;
  const workspaceCount = appState.workspaces.length;

  return (
    <div className="min-h-screen w-full grid place-items-center bg-bg p-8">
      <section className="w-full max-w-xl">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-fg-accent mb-2">
            QuanSynd · Vibe-ADE
          </p>
          <h1 className="font-display text-3xl font-semibold text-fg">Get started</h1>
        </header>
        <div className="space-y-3">
          <StartActionRow
            Icon={PlusCircle}
            title="New Workspace"
            subtitle={`${workspaceCount} environment${workspaceCount === 1 ? '' : 's'}`}
            onClick={() => openCreateFlow('workspace')}
          />
          <StartActionRow
            Icon={Users}
            title="New Swarm"
            subtitle="Coordinated agent session"
            locked={swarmLocked}
            onClick={() => {
              if (swarmLocked) {
                addToast('info', 'QuanSwarm is available on Flux and Forge plans.');
                return;
              }
              openSwarmDashboard();
            }}
          />
          <StartActionRow
            Icon={FolderOpen}
            title="Open Environment"
            subtitle="Restore saved workspace"
            onClick={() => openEnvironmentOverlay()}
          />
        </div>
      </section>
    </div>
  );
}

interface StartActionRowProps {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  locked?: boolean;
  onClick: () => void;
}

function StartActionRow({ Icon, title, subtitle, locked, onClick }: StartActionRowProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group w-full flex items-center gap-4 px-4 py-4 rounded-md text-left bg-bg-elev border border-line',
        'hover:border-line-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fg-accent transition-colors'
      )}
    >
      <span className="h-10 w-10 rounded-md grid place-items-center text-fg-accent bg-fg-accent/10 shrink-0">
        <Icon className="w-5 h-5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-display font-semibold text-fg truncate">{title}</div>
        <div className="text-sm text-fg-muted truncate">{subtitle}</div>
      </div>
      {locked && <Lock className="w-4 h-4 text-qs-warning shrink-0" />}
      <ChevronRight className="w-4 h-4 text-fg-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
