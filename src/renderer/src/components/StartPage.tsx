import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import { UiIcon } from './UiIcon';

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
    <div className="start-page-overlay start-page-overlay-minimal">
      <section className="start-page-shell start-page-shell-minimal">
        <div className="start-launch-only">
          <button
            className="start-action-card start-action-card-primary"
            onClick={() => openCreateFlow('workspace')}
          >
            <span className="start-action-icon">
              <UiIcon name="plus" className="ui-icon" />
            </span>
            <strong>New Workspace</strong>
            <small>{workspaceCount} environment{workspaceCount === 1 ? '' : 's'} ready to manage.</small>
          </button>

          <button
            onClick={() => {
              if (swarmLocked) {
                addToast('info', 'QuanSwarm is available on Flux and Forge plans.');
                return;
              }
              openSwarmDashboard();
            }}
            className={swarmLocked ? 'start-action-card start-action-lockable locked' : 'start-action-card start-action-lockable'}
          >
            <span className="start-action-icon">
              <UiIcon name="board" className="ui-icon" />
            </span>
            <strong>New Swarm</strong>
            <small>Dispatch a coordinated swarm session.</small>
            {swarmLocked && <UiIcon name="lock" className="ui-icon ui-icon-sm lock-icon" />}
          </button>

          <button className="start-action-card" onClick={() => openEnvironmentOverlay()}>
            <span className="start-action-icon">
              <UiIcon name="folder" className="ui-icon" />
            </span>
            <strong>Open Environment</strong>
            <small>Restore a saved workspace export.</small>
          </button>
        </div>
      </section>
    </div>
  );
}
