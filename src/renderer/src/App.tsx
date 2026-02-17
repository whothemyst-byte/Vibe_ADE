import { useEffect, useMemo } from 'react';
import { useState } from 'react';
import type { AuthSession } from '@shared/ipc';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { useIpcEvents } from '@renderer/hooks/useIpcEvents';
import { WorkspaceTabs } from './components/WorkspaceTabs';
import { PaneLayout } from './components/PaneLayout';
import { TaskBoard } from './components/TaskBoard';
import { AgentPanel } from './components/AgentPanel';
import { CommandPalette } from './components/CommandPalette';
import { StartPage } from './components/StartPage';
import { SettingsDialog } from './components/SettingsDialog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/Toast';
import { AuthScreen } from './components/AuthScreen';
import { THEME } from './theme/theme';
import { applyAppearanceMode, getStoredAppearanceMode } from './theme/appearance';
import { isTypingTarget, loadShortcuts, toShortcutCombo, type ShortcutAction } from './services/preferences';

export function App(): JSX.Element {
  const [authLoading, setAuthLoading] = useState(true);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const initialize = useWorkspaceStore((s) => s.initialize);
  const appState = useWorkspaceStore((s) => s.appState);
  const loading = useWorkspaceStore((s) => s.loading);
  const ui = useWorkspaceStore((s) => s.ui);
  const togglePalette = useWorkspaceStore((s) => s.toggleCommandPalette);
  const toggleTaskBoard = useWorkspaceStore((s) => s.toggleTaskBoard);
  const toggleAgentPanel = useWorkspaceStore((s) => s.toggleAgentPanel);
  const openSettings = useWorkspaceStore((s) => s.openSettings);
  const openStartPage = useWorkspaceStore((s) => s.openStartPage);
  const cancelCloseWorkspace = useWorkspaceStore((s) => s.cancelCloseWorkspace);
  const confirmCloseWorkspace = useWorkspaceStore((s) => s.confirmCloseWorkspace);

  useIpcEvents();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-primary', THEME.backgroundPrimary);
    root.style.setProperty('--bg-secondary', THEME.backgroundSecondary);
    root.style.setProperty('--bg-pane', THEME.paneBackground);
    root.style.setProperty('--bg-top', THEME.topBarBackground);
    root.style.setProperty('--accent', THEME.accentPrimary);
    root.style.setProperty('--accent-2', THEME.accentSecondary);
    root.style.setProperty('--text', THEME.textPrimary);
    root.style.setProperty('--muted', THEME.textMuted);
  }, []);

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
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
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
      if (isTypingTarget(event.target)) {
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
      if (action === 'toggleCommandPalette') {
        togglePalette();
        return;
      }
      if (action === 'toggleTaskBoard') {
        toggleTaskBoard();
        return;
      }
      if (action === 'toggleAgentPanel') {
        toggleAgentPanel();
        return;
      }
      if (action === 'openSettings') {
        openSettings();
        return;
      }
      if (action === 'openStartPage') {
        openStartPage('home');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openSettings, openStartPage, toggleAgentPanel, togglePalette, toggleTaskBoard]);

  const activeWorkspace = useMemo(
    () => appState.workspaces.find((w) => w.id === appState.activeWorkspaceId),
    [appState.activeWorkspaceId, appState.workspaces]
  );

  if (authLoading) {
    return <div className="centered">Checking session...</div>;
  }

  if (!authSession) {
    return <AuthScreen onAuthenticated={setAuthSession} />;
  }

  if (loading) {
    return <div className="centered">Loading Vibe-ADE...</div>;
  }

  const showTaskBoardView = ui.taskBoardTabOpen && ui.activeView === 'task-board';
  const rightRailOpen = ui.agentPanelOpen && !showTaskBoardView;
  const rightRailClassName = rightRailOpen ? 'right-rail open single-panel' : 'right-rail';

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <WorkspaceTabs />

        <main className="workspace-shell">
          {activeWorkspace ? (
            showTaskBoardView ? (
              <section className="task-board-workspace-view">
                <TaskBoard workspace={activeWorkspace} />
              </section>
            ) : (
              <div className={rightRailOpen ? 'workspace-layout with-right-rail' : 'workspace-layout'}>
                <section className="workspace-main">
                  <div className="terminal-region">
                    <div className={rightRailOpen ? 'terminal-region-scroll' : 'terminal-region-scroll disabled'}>
                      <PaneLayout workspace={activeWorkspace} enableHorizontalScroll={rightRailOpen} />
                    </div>
                  </div>
                </section>

                <aside className={rightRailClassName}>
                  {ui.agentPanelOpen && (
                    <section className="side-panel agent-panel-shell">
                      <header className="side-panel-header">
                        <h3>Agent Panel</h3>
                        <button onClick={() => toggleAgentPanel(false)}>Close</button>
                      </header>
                      <AgentPanel workspace={activeWorkspace} />
                    </section>
                  )}
                </aside>
              </div>
            )
          ) : (
            <div className="terminal-region empty-terminal">No environment opened.</div>
          )}

        </main>
        <footer className="env-statusbar">
          <div className="env-status-left">
            <span>Main</span>
            <span>Warnings: 0</span>
          </div>
          <div className="env-status-right">
            <span>Spaces: 4</span>
            <span>UTF-8</span>
          </div>
        </footer>

        {ui.startPageOpen && <StartPage />}
        {ui.settingsOpen && <SettingsDialog />}
        {ui.commandPaletteOpen && <CommandPalette />}
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
