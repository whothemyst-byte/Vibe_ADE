import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthSession } from '@shared/ipc';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { useIpcEvents } from '@renderer/hooks/useIpcEvents';
import { AppMenuBar } from './components/AppMenuBar';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
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
import { isShortcutCaptureTarget, isTypingTarget, loadShortcuts, toShortcutCombo, type ShortcutAction } from './services/preferences';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';

export function App(): JSX.Element {
  const [authLoading, setAuthLoading] = useState(true);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authAvailable, setAuthAvailable] = useState(true);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const shortcutsRef = useRef(loadShortcuts());
  const initialize = useWorkspaceStore((s) => s.initialize);
  const loading = useWorkspaceStore((s) => s.loading);
  const workspaces = useWorkspaceStore((s) => s.appState.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.appState.activeWorkspaceId);
  const subscriptionState = useWorkspaceStore((s) => s.appState.subscription);
  const startPageOpen = useWorkspaceStore((s) => s.ui.startPageOpen);
  const createFlowOpen = useWorkspaceStore((s) => s.ui.createFlowOpen);
  const openEnvironmentOpen = useWorkspaceStore((s) => s.ui.openEnvironmentOpen);
  const settingsOpen = useWorkspaceStore((s) => s.ui.settingsOpen);
  const swarmDashboardOpen = useWorkspaceStore((s) => s.ui.swarmDashboardOpen);
  const pendingCloseWorkspaceId = useWorkspaceStore((s) => s.ui.pendingCloseWorkspaceId);
  const updateStatus = useWorkspaceStore((s) => s.ui.updateStatus);
  const taskBoardTabOpen = useWorkspaceStore((s) => s.ui.taskBoardTabOpen);
  const activeView = useWorkspaceStore((s) => s.ui.activeView);
  const activeSwarmId = useWorkspaceStore((s) => s.ui.activeSwarmId);
  const taskFiltersArchived = useWorkspaceStore((s) => s.ui.taskFilters.archived ?? false);
  const toggleTaskBoard = useWorkspaceStore((s) => s.toggleTaskBoard);
  const toggleSidebarCollapsed = useWorkspaceStore((s) => s.toggleSidebarCollapsed);
  const openCreateFlow = useWorkspaceStore((s) => s.openCreateFlow);
  const openEnvironmentOverlay = useWorkspaceStore((s) => s.openEnvironmentOverlay);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  const saveActiveWorkspace = useWorkspaceStore((s) => s.saveActiveWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
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
    () => workspaces.find((w) => w.id === activeWorkspaceId),
    [activeWorkspaceId, workspaces]
  );
  const showStartSurface = startPageOpen && workspaces.length === 0;

  useIpcEvents();

  useEffect(() => {
    const apply = (): void => {
      applyAppearanceMode(getStoredAppearanceMode());
    };
    const syncShortcuts = (): void => {
      shortcutsRef.current = loadShortcuts();
    };

    apply();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    mediaQuery.addEventListener('change', apply);
    window.addEventListener('storage', apply);
    window.addEventListener('storage', syncShortcuts);
    window.addEventListener('vibe-ade:shortcuts-changed', syncShortcuts);
    return () => {
      mediaQuery.removeEventListener('change', apply);
      window.removeEventListener('storage', apply);
      window.removeEventListener('storage', syncShortcuts);
      window.removeEventListener('vibe-ade:shortcuts-changed', syncShortcuts);
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
    void window.vibeAde.workspace.syncAccountState()
      .catch(() => undefined)
      .finally(() => {
        void initialize();
      });
  }, [authSession, initialize]);

  useEffect(() => {
    if (!authSession) {
      void window.vibeAde.system.setSaveMenuEnabled(false);
      return;
    }
    void window.vibeAde.system.setSaveMenuEnabled(!startPageOpen);
  }, [authSession, startPageOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTerminalTarget = Boolean(target?.closest('.terminal-pane'));
      if (isShortcutCaptureTarget(event.target)) {
        return;
      }
      if (isTypingTarget(event.target) && !isTerminalTarget) {
        return;
      }

      const combo = toShortcutCombo(event);
      if (!combo) {
        return;
      }

      const bindings = shortcutsRef.current;
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
      if (action === 'toggleSidebar') {
        toggleSidebarCollapsed();
        return;
      }
      if (
        action === 'selectWorkspace1' ||
        action === 'selectWorkspace2' ||
        action === 'selectWorkspace3' ||
        action === 'selectWorkspace4' ||
        action === 'selectWorkspace5' ||
        action === 'selectWorkspace6' ||
        action === 'selectWorkspace7' ||
        action === 'selectWorkspace8' ||
        action === 'selectWorkspace9' ||
        action === 'selectWorkspace10'
      ) {
        const indexMap: Record<ShortcutAction, number> = {
          newWorkspace: -1,
          openWorkspace: -1,
          toggleSidebar: -1,
          selectWorkspace1: 0,
          selectWorkspace2: 1,
          selectWorkspace3: 2,
          selectWorkspace4: 3,
          selectWorkspace5: 4,
          selectWorkspace6: 5,
          selectWorkspace7: 6,
          selectWorkspace8: 7,
          selectWorkspace9: 8,
          selectWorkspace10: 9,
          saveLayout: -1,
          findInTerminal: -1,
          clearActivePane: -1,
          newPane: -1,
          closePane: -1,
          resetZoom: -1,
          zoomIn: -1,
          zoomOut: -1,
          toggleFullScreen: -1,
          openSettings: -1,
          toggleTaskBoard: -1,
          createTaskQuick: -1,
          toggleTaskArchived: -1,
          resetTaskFilters: -1
        };
        const targetIndex = indexMap[action];
        if (targetIndex >= 0) {
          const target = workspaces[targetIndex];
          if (target) {
            void setActiveWorkspace(target.id);
          }
        }
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
        if (activeWorkspace?.activePaneId && activeWorkspace.paneTypes[activeWorkspace.activePaneId] === 'terminal') {
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
        setTaskFilters({ archived: !taskFiltersArchived });
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
    workspaces,
    openCreateFlow,
    openEnvironmentOverlay,
    openSettings,
    removePaneFromLayout,
    requestTerminalFind,
    saveActiveWorkspace,
    setTaskFilters,
    setActiveWorkspace,
    toggleSidebarCollapsed,
    toggleTaskBoard,
    taskFiltersArchived
  ]);

  const subscription = useMemo(() => normalizeSubscriptionState(subscriptionState), [subscriptionState]);
  const plan = SUBSCRIPTION_PLANS[subscription.tier] ?? SUBSCRIPTION_PLANS.spark;
  const taskLimit = plan.limits.taskBoardTasksPerMonth;
  const taskUsageLabel = plan.features.taskBoard ? `${subscription.usage.tasksCreated}/${taskLimit ?? '∞'}` : 'Locked';
  if (authLoading) {
    return <div className="centered">Checking session...</div>;
  }

  if (!authSession) {
    return <AuthScreen onAuthenticated={setAuthSession} authAvailable={authAvailable} />;
  }

  if (loading) {
    return <div className="centered">Loading Vibe-ADE...</div>;
  }

  const showTaskBoardView = taskBoardTabOpen && activeView === 'task-board';
  const showSwarmView = activeView === 'swarm' && Boolean(activeSwarmId);

  if (showStartSurface) {
    return (
      <ErrorBoundary>
        <div className="start-page-screen">
          <StartPage />
          {createFlowOpen && <CreateFlowOverlay />}
          {openEnvironmentOpen && <OpenEnvironmentOverlay />}
          {swarmDashboardOpen && <SwarmDashboardDialog />}
          {settingsOpen && <SettingsDialog />}
          {pendingCloseWorkspaceId && (
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

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <div className="app-header">
          <AppMenuBar />
        </div>
        <div className="app-body">
          <WorkspaceSidebar />
          <main className="workspace-shell">
            {showSwarmView ? (
              <SwarmSessionView swarmId={activeSwarmId!} />
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

            {createFlowOpen && <CreateFlowOverlay />}
            {openEnvironmentOpen && <OpenEnvironmentOverlay />}
          </main>
        </div>
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
          </div>
        </footer>

        {startPageOpen && <StartPage />}
        {settingsOpen && <SettingsDialog />}
        {swarmDashboardOpen && <SwarmDashboardDialog />}
        {pendingCloseWorkspaceId && (
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
