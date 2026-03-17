import { useEffect } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import { UiIcon } from './UiIcon';
import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import { SwarmDashboardDialog } from './SwarmDashboardDialog';

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
    <div className="create-flow-overlay" onClick={() => closeCreateFlow()}>
      {ui.createFlowMode === 'choose' && (
        <section className="create-flow-card" onClick={(event) => event.stopPropagation()}>
          <header className="create-flow-header">
            <h2>Create</h2>
            <button className="icon-only-button" onClick={closeCreateFlow} aria-label="Close">
              <UiIcon name="close" className="ui-icon ui-icon-sm" />
            </button>
          </header>

          <div className="create-flow-body">
            <button className="create-flow-choice primary" onClick={() => openCreateFlow('workspace')}>
              <div className="create-flow-choice-title">New Workspace</div>
              <div className="create-flow-choice-subtitle">Create a fresh environment with terminals.</div>
            </button>
            <button
              className={swarmLocked ? 'create-flow-choice locked' : 'create-flow-choice'}
              onClick={() => {
                if (swarmLocked) {
                  addToast('info', 'QuanSwarm is available on Flux and Forge plans.');
                  return;
                }
                openCreateFlow('swarm');
              }}
            >
              <div className="create-flow-choice-title">New Swarm</div>
              <div className="create-flow-choice-subtitle">Launch a QuanSwarm for your codebase.</div>
              {swarmLocked && <UiIcon name="lock" className="ui-icon ui-icon-sm lock-icon" />}
            </button>
          </div>

          <footer className="create-flow-footer">
            <button onClick={closeCreateFlow}>Cancel</button>
          </footer>
        </section>
      )}

      {ui.createFlowMode === 'workspace' && (
        <div className="create-flow-modal-host">
          <CreateWorkspaceForm onCancel={closeCreateFlow} onCreated={closeCreateFlow} />
        </div>
      )}

      {ui.createFlowMode === 'swarm' && (
        <div className="create-flow-modal-host">
          <SwarmDashboardDialog embedded onRequestClose={closeCreateFlow} />
        </div>
      )}
    </div>
  );
}
