import { useEffect } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import { SwarmDashboardDialog } from './SwarmDashboardDialog';
import { Button, Icon, cn } from './ui';

export function CreateFlowOverlay(): JSX.Element {
  const ui = useWorkspaceStore((s) => s.ui);
  const openCreateFlow = useWorkspaceStore((s) => s.openCreateFlow);
  const closeCreateFlow = useWorkspaceStore((s) => s.closeCreateFlow);
  const subscription = useWorkspaceStore((s) => s.appState.subscription);
  const addToast = useToastStore((s) => s.addToast);
  const plan = SUBSCRIPTION_PLANS[normalizeSubscriptionState(subscription).tier];
  const swarmLocked = !plan.features.swarms;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCreateFlow();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeCreateFlow]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={() => closeCreateFlow()}
    >
      {ui.createFlowMode === 'choose' && (
        <section
          className="w-full max-w-sm bg-bg-panel border border-line rounded shadow-premium overflow-hidden"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="px-3 h-7 border-b border-line bg-bg-panel-2 flex items-center justify-between">
            <h2 className="text-xs font-medium text-fg">Create</h2>
            <button
              className="h-5 w-5 grid place-items-center rounded-sm text-fg-muted hover:text-fg hover:bg-bg-elev transition-colors"
              onClick={closeCreateFlow}
              aria-label="Close"
            >
              <Icon name="close" size="xs" />
            </button>
          </header>

          <div className="p-1">
            <button
              className="group w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left transition-colors hover:bg-bg-panel-2"
              onClick={() => openCreateFlow('workspace')}
            >
              <span className="h-6 w-6 rounded-sm bg-primary/15 text-primary grid place-items-center shrink-0">
                <Icon name="add_circle" size="sm" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-fg">New Workspace</div>
                <div className="text-[10px] text-fg-muted">Create a fresh environment with terminals.</div>
              </div>
              <Icon name="chevron_right" size="xs" className="text-fg-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button
              className={cn(
                'group w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left transition-colors hover:bg-bg-panel-2',
                swarmLocked && 'opacity-70'
              )}
              onClick={() => {
                if (swarmLocked) {
                  addToast('info', 'QuanSwarm is available on Flux and Forge plans.');
                  return;
                }
                openCreateFlow('swarm');
              }}
            >
              <span className="h-6 w-6 rounded-sm bg-bg-panel-2 text-primary grid place-items-center shrink-0">
                <Icon name="hub" size="sm" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-fg">New Swarm</div>
                <div className="text-[10px] text-fg-muted">Launch a QuanSwarm for your codebase.</div>
              </div>
              {swarmLocked && <Icon name="lock" size="xs" className="text-warn" />}
            </button>
          </div>

          <footer className="px-3 py-2 border-t border-line bg-bg-panel-2 flex justify-end">
            <Button variant="ghost" size="sm" onClick={closeCreateFlow}>Cancel</Button>
          </footer>
        </section>
      )}

      {ui.createFlowMode === 'workspace' && (
        <div onClick={(event) => event.stopPropagation()}>
          <CreateWorkspaceForm onCancel={closeCreateFlow} onCreated={closeCreateFlow} />
        </div>
      )}

      {ui.createFlowMode === 'swarm' && (
        <div onClick={(event) => event.stopPropagation()}>
          <SwarmDashboardDialog embedded onRequestClose={closeCreateFlow} />
        </div>
      )}
    </div>
  );
}
