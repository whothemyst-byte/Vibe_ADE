import type { WorkspaceMode } from '@shared/types';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import { WorkspaceModeCard } from './WorkspaceModeCard';

export function StartPage(): JSX.Element {
  const openCreateFlow = useWorkspaceStore((s) => s.openCreateFlow);
  const subscription = useWorkspaceStore((s) => s.appState.subscription);
  const addToast = useToastStore((s) => s.addToast);

  const normalizedSub = normalizeSubscriptionState(subscription);
  const plan = SUBSCRIPTION_PLANS[normalizedSub.tier] ?? SUBSCRIPTION_PLANS.spark;
  const swarmLocked = !plan.features.swarms;

  const handleSelect = (mode: WorkspaceMode): void => {
    if (mode === 'swarm') {
      if (swarmLocked) {
        addToast('info', 'QuanSwarm is available on Flux and Forge plans.');
        return;
      }
      openCreateFlow('swarm');
      return;
    }
    window.localStorage.setItem('vibeAde.pendingWorkspaceMode', mode);
    if (mode === 'canvas') {
      openCreateFlow('canvas');
    } else {
      openCreateFlow('workspace');
    }
  };

  return (
    <div className="min-h-screen w-full grid place-items-center bg-bg p-8 overflow-auto">
      <section className="w-full max-w-4xl">
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-fg-accent mb-2">
            QuanSynd · Vibe-ADE
          </p>
          <h1 className="font-display text-3xl font-semibold text-fg mb-2">What are you building today?</h1>
          <p className="text-fg-muted">Pick a mode to start.</p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['space', 'swarm', 'canvas'] as WorkspaceMode[]).map((m) => (
            <WorkspaceModeCard
              key={m}
              mode={m}
              selected={false}
              locked={m === 'swarm' && swarmLocked}
              onClick={() => handleSelect(m)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
