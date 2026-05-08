import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import { Icon, cn } from './ui';

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
    <div className="fixed inset-0 flex items-center justify-center p-3 bg-bg-page">
      <section className="w-full max-w-sm">
        <div className="bg-bg-panel border border-line rounded shadow-premium overflow-hidden">
          <header className="px-3 h-7 border-b border-line bg-bg-panel-2 flex items-center">
            <h2 className="text-xs font-medium text-fg">Get Started</h2>
          </header>
          <div className="p-1">
            <StartActionRow
              icon="add_circle"
              title="New Workspace"
              subtitle={`${workspaceCount} environment${workspaceCount === 1 ? '' : 's'}`}
              onClick={() => openCreateFlow('workspace')}
            />
            <StartActionRow
              icon="hub"
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
              icon="folder_open"
              title="Open Environment"
              subtitle="Restore saved workspace"
              onClick={() => openEnvironmentOverlay()}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

interface StartActionRowProps {
  icon: string;
  title: string;
  subtitle: string;
  locked?: boolean;
  onClick: () => void;
}

function StartActionRow({ icon, title, subtitle, locked, onClick }: StartActionRowProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left transition-colors',
        'hover:bg-bg-panel-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary'
      )}
    >
      <span className="h-6 w-6 rounded-sm grid place-items-center text-primary bg-primary/10 shrink-0">
        <Icon name={icon} size="sm" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-fg truncate">{title}</div>
        <div className="text-[10px] text-fg-muted truncate">{subtitle}</div>
      </div>
      {locked && <Icon name="lock" size="xs" className="text-warn shrink-0" />}
      <Icon name="chevron_right" size="xs" className="text-fg-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
