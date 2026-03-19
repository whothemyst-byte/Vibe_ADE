import { useEffect, useMemo } from 'react';
import { useState } from 'react';
import type { AuthSession } from '@shared/ipc';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { useIpcEvents } from '@renderer/hooks/useIpcEvents';
import { AppMenuBar } from './components/AppMenuBar';
import { WorkspaceTabs } from './components/WorkspaceTabs';
import { PaneLayout } from './components/PaneLayout';
import { TaskBoard } from './components/TaskBoard';
import { StartPage } from './components/StartPage';
import { SettingsDialog } from './components/SettingsDialog';
import { SwarmDashboardDialog } from './components/SwarmDashboardDialog';
import { SwarmSessionView } from './components/SwarmSessionView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/Toast';
import { AuthScreen } from './components/AuthScreen';
import { CreateFlowOverlay } from './components/CreateFlowOverlay';
import { OpenEnvironmentOverlay } from './components/OpenEnvironmentOverlay';
import { UiIcon } from './components/UiIcon';
import { applyAppearanceMode, getStoredAppearanceMode } from './theme/appearance';
import { isTypingTarget, loadShortcuts, toShortcutCombo, type ShortcutAction } from './services/preferences';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';

export function App(): JSX.Element {
  const [authLoading, setAuthLoading] = useState(true);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authAvailable, setAuthAvailable] = useState(true);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const initialize = useWorkspaceStore((s) => s.initialize);
  const appState = useWorkspaceStore((s) => s.appState);
  const loading = useWorkspaceStore((s) => s.loading);
  const ui = useWorkspaceStore((s) => s.ui);
  const toggleTaskBoard = useWorkspaceStore((s) => s.toggleTaskBoard);
  const openCreateFlow = useWorkspaceStore((s) => s.openCreateFlow);
  const openEnvironmentOverlay = useWorkspaceStore((s) => s.openEnvironmentOverlay);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  const saveActiveWorkspace = useWorkspaceStore((s) => s.saveActiveWorkspace);
  const requestTerminalFind = useWorkspaceStore((s) => s.requestTerminalFind);
  const addPaneToLayout = useWorkspaceStore((s) => s.addPaneToLayout);
  const removePaneFromLayout = useWorkspaceStore((s) => s.removePaneFromLayout);
  const addTask = useWorkspaceStore((s) => s.addTask);
  const clearTaskFilters = useWorkspaceStore((s) => s.clearTaskFilters);
  const setTaskFilters = useWorkspaceStore((s) => s.setTaskFilters);
  const cancelCloseWorkspace = useWorkspaceStore((s) => s.cancelCloseWorkspace);
  const confirmCloseWorkspace = useWorkspaceStore((s) => s.confirmCloseWorkspace);
  const openStartPage = useWorkspaceStore((s) => s.openStartPage);

  const activeWorkspace = useMemo(
    () => appState.workspaces.find((w) => w.id === appState.activeWorkspaceId),
    [appState.activeWorkspaceId, appState.workspaces]
  );

  useIpcEvents();

  useEffect(() => {
    const apply = (): void => {
      applyAppearanceMode(getStoredAppearanceMode());
    };

    apply();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    mediaQuery.addEventListener('change', apply);
    window.addEventListener('storage', apply);
    return () => {
      mediaQuery.removeEventListener('change', apply);
      window.removeEventListener('storage', apply);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        const configured = await window.vibeAde.auth.isConfigured();
        if (!cancelled) {
          setAuthAvailable(configured);
        }
        if (!configured) {
          return;
        }
        const session = await window.vibeAde.auth.getSession();
        if (!cancelled) {
          setAuthSession(session);
        }
      } catch {
        if (!cancelled) {
          setAuthSession(null);
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authSession) {
      return;
    }
    void initialize();
  }, [authSession, initialize]);

  useEffect(() => {
    if (!authSession) {
      void window.vibeAde.system.setSaveMenuEnabled(false);
      return;
    }
    void window.vibeAde.system.setSaveMenuEnabled(!ui.startPageOpen);
  }, [authSession, ui.startPageOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTerminalTarget = Boolean(target?.closest('.terminal-pane'));
      if (isTypingTarget(event.target) && !isTerminalTarget) {
        return;
      }

      const combo = toShortcutCombo(event);
      if (!combo) {
        return;
      }

      const bindings = loadShortcuts();
      const match = (Object.entries(bindings) as Array<[ShortcutAction, string]>).find(
        ([, binding]) => binding.toLowerCase() === combo.toLowerCase()
      );

      if (!match) {
        return;
      }

      event.preventDefault();
      const [action] = match;
      if (action === 'newWorkspace') {
        openCreateFlow('workspace');
        return;
      }
      if (action === 'openWorkspace') {
        openEnvironmentOverlay();
        return;
      }
      if (action === 'saveLayout') {
        void saveActiveWorkspace();
        return;
      }
      if (action === 'findInTerminal') {
        const query = window.prompt('Find in terminal:');
        if (query) {
          requestTerminalFind(query);
        }
        return;
      }
      if (action === 'clearActivePane') {
        if (activeWorkspace?.activePaneId) {
          void window.vibeAde.terminal.executeInSession(activeWorkspace.activePaneId, 'cls', true);
        }
        return;
      }
      if (action === 'newPane') {
        void addPaneToLayout();
        return;
      }
      if (action === 'closePane') {
        if (activeWorkspace?.activePaneId) {
          void removePaneFromLayout(activeWorkspace.activePaneId);
        }
        return;
      }
      if (action === 'resetZoom') {
        void window.vibeAde.system.performMenuAction('resetZoom');
        return;
      }
      if (action === 'zoomIn') {
        void window.vibeAde.system.performMenuAction('zoomIn');
        return;
      }
      if (action === 'zoomOut') {
        void window.vibeAde.system.performMenuAction('zoomOut');
        return;
      }
      if (action === 'toggleFullScreen') {
        void window.vibeAde.system.performMenuAction('togglefullscreen');
        return;
      }
      if (action === 'toggleTaskBoard') {
        toggleTaskBoard();
        return;
      }
      if (action === 'createTaskQuick') {
        toggleTaskBoard(true);
        void addTask('New task');
        return;
      }
      if (action === 'toggleTaskArchived') {
        toggleTaskBoard(true);
        setTaskFilters({ archived: !(ui.taskFilters.archived ?? false) });
        return;
      }
      if (action === 'resetTaskFilters') {
        toggleTaskBoard(true);
        clearTaskFilters();
        return;
      }
      if (action === 'openSettings') {
        openSettings();
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    activeWorkspace?.activePaneId,
    addPaneToLayout,
    addTask,
    clearTaskFilters,
    openCreateFlow,
    openEnvironmentOverlay,
    openSettings,
    removePaneFromLayout,
    requestTerminalFind,
    saveActiveWorkspace,
    setTaskFilters,
    toggleTaskBoard,
    ui.taskFilters.archived
  ]);

  const subscription = useMemo(() => normalizeSubscriptionState(appState.subscription), [appState.subscription]);
  const plan = SUBSCRIPTION_PLANS[subscription.tier] ?? SUBSCRIPTION_PLANS.spark;
  const taskLimit = plan.limits.taskBoardTasksPerMonth;
  const taskUsageLabel = plan.features.taskBoard ? `${subscription.usage.tasksCreated}/${taskLimit ?? '∞'}` : 'Locked';
  const updateStatus = ui.updateStatus;

  if (authLoading) {
    return <div className="centered">Checking session...</div>;
  }

  if (!authSession) {
    return <AuthScreen onAuthenticated={setAuthSession} authAvailable={authAvailable} />;
  }

  if (loading) {
    return <div className="centered">Loading Vibe-ADE...</div>;
  }

  const showTaskBoardView = ui.taskBoardTabOpen && ui.activeView === 'task-board';
  const showSwarmView = ui.activeView === 'swarm' && Boolean(ui.activeSwarmId);

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <div className="app-header">
          <AppMenuBar />
          <WorkspaceTabs />
        </div>

        <main className="workspace-shell">
          {showSwarmView ? (
            <SwarmSessionView swarmId={ui.activeSwarmId!} />
          ) : activeWorkspace ? (
            showTaskBoardView ? (
              <section className="task-board-workspace-view">
                <TaskBoard workspace={activeWorkspace} />
              </section>
            ) : (
              <div className="workspace-layout">
                <section className="workspace-main">
                  <div className="terminal-region">
                    <div className="terminal-region-scroll disabled">
                      <PaneLayout workspace={activeWorkspace} enableHorizontalScroll={false} />
                    </div>
                  </div>
                </section>
              </div>
            )
          ) : (
            <div className="terminal-region empty-terminal">No environment opened.</div>
          )}

          {ui.createFlowOpen && <CreateFlowOverlay />}
          {ui.openEnvironmentOpen && <OpenEnvironmentOverlay />}
        </main>
        <footer className="env-statusbar">
          <div className="env-status-left">
            <span className="env-status-item strong" title={activeWorkspace ? activeWorkspace.rootDir : 'Workspace'}>
              <span className="env-status-icon accent">
                <UiIcon name="terminal" className="ui-icon ui-icon-sm" />
              </span>
              {activeWorkspace ? activeWorkspace.name : 'No Workspace'}
            </span>
            {activeWorkspace && (
              <>
                <span className="env-status-separator">|</span>
                <span className="env-status-item muted" title={activeWorkspace.rootDir}>
                  <span className="env-status-icon accent">
                    <UiIcon name="folder" className="ui-icon ui-icon-sm" />
                  </span>
                  {activeWorkspace.rootDir}
                </span>
              </>
            )}
          </div>

          <div className="env-status-center">
          </div>

          <div className="env-status-right">
            <span className={`env-status-connection ${isOnline ? 'online' : 'offline'}`}>
              <span className="env-status-connection-dot" />
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <span className="env-status-pill">
              <span className="env-status-dot" />
              Tasks {taskUsageLabel}
            </span>
            {(updateStatus.state === 'available' || updateStatus.state === 'downloaded' || updateStatus.state === 'downloading') && (
              <button
                className="env-status-item update"
                onClick={() => {
                  if (updateStatus.state === 'downloaded') {
                    void window.vibeAde.update.install();
                    return;
                  }
                  void window.vibeAde.update.download();
                }}
              >
                {updateStatus.state === 'downloaded'
                  ? 'Install Update'
                  : updateStatus.state === 'downloading'
                  ? 'Updating...'
                  : 'Update Available'}
              </button>
            )}
          </div>
        </footer>

        {ui.startPageOpen && <StartPage />}
        {ui.settingsOpen && <SettingsDialog />}
        {ui.swarmDashboardOpen && <SwarmDashboardDialog />}
        {ui.pendingCloseWorkspaceId && (
          <div className="close-warning-overlay" onClick={cancelCloseWorkspace}>
            <section className="close-warning-card" onClick={(event) => event.stopPropagation()}>
              <h3>Environment is not saved</h3>
              <p>Save before closing this environment?</p>
              <div className="close-warning-actions">
                <button onClick={() => void confirmCloseWorkspace('save')}>Save</button>
                <button className="danger" onClick={() => void confirmCloseWorkspace('continue')}>
                  Continue
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
      <ToastContainer />
    </ErrorBoundary>
  );
}
