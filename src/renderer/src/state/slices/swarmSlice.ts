import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { useToastStore } from '@renderer/hooks/useToast';
import { type StoreGet, type StoreSet, type WorkspaceStoreState } from '../storeTypes';

type SwarmSlice = Pick<
  WorkspaceStoreState,
  | 'openSwarmDashboard'
  | 'closeSwarmDashboard'
  | 'setActiveSwarmId'
  | 'openSwarmSession'
  | 'closeSwarmSession'
  | 'setActiveSwarmSession'
>;

export function createSwarmSlice(set: StoreSet, get: StoreGet): SwarmSlice {
  return {
    openSwarmDashboard: (swarmId) => {
      const normalizedSub = normalizeSubscriptionState(get().appState.subscription);
      const plan = SUBSCRIPTION_PLANS[normalizedSub.tier];
      if (!plan.features.swarms) {
        useToastStore.getState().addToast('info', 'QuanSwarm is available on Flux and Forge plans.');
        return;
      }
      set((state) => ({
        ui: {
          ...state.ui,
          swarmDashboardOpen: true,
          activeSwarmId: swarmId ?? state.ui.activeSwarmId
        }
      }));
      if (normalizedSub !== get().appState.subscription) {
        set((state) => ({ appState: { ...state.appState, subscription: normalizedSub } }));
        void window.vibeAde.workspace.updateSubscription(normalizedSub);
      }
    },
    closeSwarmDashboard: () => {
      set((state) => ({
        ui: {
          ...state.ui,
          swarmDashboardOpen: false
        }
      }));
    },
    setActiveSwarmId: (swarmId) => {
      set((state) => ({
        ui: {
          ...state.ui,
          activeSwarmId: swarmId
        }
      }));
    },
    openSwarmSession: (input) => {
      const normalizedSub = normalizeSubscriptionState(get().appState.subscription);
      const plan = SUBSCRIPTION_PLANS[normalizedSub.tier];
      if (!plan.features.swarms) {
        useToastStore.getState().addToast('info', 'QuanSwarm is available on Flux and Forge plans.');
        return;
      }
      set((state) => {
        const existing = state.ui.swarmSessions.find((s) => s.swarmId === input.swarmId);
        const sessions = existing
          ? state.ui.swarmSessions.map((s) => (s.swarmId === input.swarmId ? { ...s, name: input.name } : s))
          : [...state.ui.swarmSessions, { swarmId: input.swarmId, name: input.name }];

        return {
          ui: {
            ...state.ui,
            activeView: 'swarm',
            activeSwarmId: input.swarmId,
            swarmSessions: sessions,
            startPageOpen: false,
            swarmDashboardOpen: false
          }
        };
      });
      if (normalizedSub !== get().appState.subscription) {
        set((state) => ({ appState: { ...state.appState, subscription: normalizedSub } }));
        void window.vibeAde.workspace.updateSubscription(normalizedSub);
      }
    },
    closeSwarmSession: async (swarmId) => {
      try {
        await window.vibeAde.swarm.stop(swarmId);
      } catch (error) {
        console.warn('Failed to stop swarm:', error);
      }
      set((state) => {
        const sessions = state.ui.swarmSessions.filter((s) => s.swarmId !== swarmId);
        const nextActiveSwarmId =
          state.ui.activeSwarmId === swarmId ? (sessions[0]?.swarmId ?? null) : state.ui.activeSwarmId;
        const nextActiveView = state.ui.activeView === 'swarm' && !nextActiveSwarmId ? 'workspace' : state.ui.activeView;

        return {
          ui: {
            ...state.ui,
            swarmSessions: sessions,
            activeSwarmId: nextActiveSwarmId,
            activeView: nextActiveSwarmId ? 'swarm' : nextActiveView
          }
        };
      });
    },
    setActiveSwarmSession: (swarmId) => {
      set((state) => ({
        ui: {
          ...state.ui,
          activeView: 'swarm',
          activeSwarmId: swarmId
        }
      }));
    }
  };
}
