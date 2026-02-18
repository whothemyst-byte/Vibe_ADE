import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import type { CloudSyncPreview, CloudSyncStatus, CloudWorkspaceSummary } from '@shared/ipc';
import type { TaskItem, TaskStatus } from '@shared/types';
import { useToastStore } from '@renderer/hooks/useToast';
import { AGENT_MODELS, DEFAULT_SHORTCUTS, loadAgentPreferences, loadShortcuts, saveAgentPreferences, saveShortcuts, toShortcutCombo, type ShortcutAction } from '@renderer/services/preferences';
import { applyAppearanceMode, getStoredAppearanceMode, setStoredAppearanceMode, type AppearanceMode } from '@renderer/theme/appearance';

type SettingsTab = 'appearance' | 'shortcuts' | 'task-board' | 'agent' | 'account';

const SETTINGS_TABS: Array<{
  id: SettingsTab;
  label: string;
  description: string;
  icon: string;
}> = [
  { id: 'appearance', label: 'Appearance', description: 'Theme and display', icon: '\uD83C\uDFA8' },
  { id: 'shortcuts', label: 'Shortcuts', description: 'Keyboard bindings', icon: '\u2328\uFE0F' },
  { id: 'task-board', label: 'Task Board', description: 'Task history', icon: '\uD83D\uDDC2\uFE0F' },
  { id: 'agent', label: 'Agent', description: 'Model and runtime', icon: '\uD83E\uDD16' },
  { id: 'account', label: 'Account', description: 'Cloud and auth', icon: '\uD83D\uDC64' }
];

const SHORTCUT_ROWS: Array<{ action: ShortcutAction; label: string; description: string }> = [
  { action: 'toggleCommandPalette', label: 'Command Palette', description: 'Open command palette' },
  { action: 'openSettings', label: 'Settings', description: 'Open settings' },
  { action: 'openStartPage', label: 'Start Page', description: 'Open start page' },
  { action: 'toggleTaskBoard', label: 'Task Board', description: 'Toggle task board view' },
  { action: 'toggleAgentPanel', label: 'Agent Panel', description: 'Toggle agent panel' },
  { action: 'createTaskQuick', label: 'Quick Task', description: 'Create a backlog task and open task board' },
  { action: 'toggleTaskArchived', label: 'Archived Filter', description: 'Toggle showing archived tasks' },
  { action: 'resetTaskFilters', label: 'Reset Task Filters', description: 'Clear search, filters, and sort' }
];

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  'in-progress': 'In Progress',
  done: 'Done'
};

interface TaskHistoryItem {
  task: TaskItem;
  workspaceName: string;
}

export function SettingsDialog(): JSX.Element {
  const appState = useWorkspaceStore((s) => s.appState);
  const closeSettings = useWorkspaceStore((s) => s.closeSettings);
  const addToast = useToastStore((s) => s.addToast);

  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [status, setStatus] = useState<CloudSyncStatus | null>(null);
  const [remoteWorkspaces, setRemoteWorkspaces] = useState<CloudWorkspaceSummary[]>([]);
  const [syncPreview, setSyncPreview] = useState<CloudSyncPreview | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(() => getStoredAppearanceMode());
  const [shortcuts, setShortcuts] = useState(loadShortcuts);
  const [capturingAction, setCapturingAction] = useState<ShortcutAction | null>(null);
  const [agentPreferences, setAgentPreferences] = useState(loadAgentPreferences);

  const refreshCloudData = async (): Promise<void> => {
    const nextStatus = await window.vibeAde.cloud.getStatus();
    setStatus(nextStatus);
    if (nextStatus.configured && nextStatus.authenticated) {
      const [list, preview] = await Promise.all([
        window.vibeAde.cloud.listRemoteWorkspaces(),
        window.vibeAde.cloud.getSyncPreview()
      ]);
      setRemoteWorkspaces(list);
      setSyncPreview(preview);
    } else {
      setRemoteWorkspaces([]);
      setSyncPreview(null);
    }
  };

  useEffect(() => {
    void refreshCloudData().catch(() => {
      setStatus({ configured: false, authenticated: false });
      setRemoteWorkspaces([]);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSettings();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeSettings]);

  const taskHistory = useMemo<TaskHistoryItem[]>(
    () =>
      appState.workspaces
        .flatMap((workspace) => workspace.tasks.map((task) => ({ task, workspaceName: workspace.name })))
        .sort((a, b) => new Date(b.task.updatedAt).getTime() - new Date(a.task.updatedAt).getTime()),
    [appState.workspaces]
  );

  const logout = async (): Promise<void> => {
    await window.vibeAde.auth.logout();
    window.location.reload();
  };

  const pushLocal = async (): Promise<void> => {
    setSyncing(true);
    try {
      await window.vibeAde.cloud.pushLocalState();
      await refreshCloudData();
      addToast('success', 'Local state pushed to cloud.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to push local state.';
      addToast('error', message);
    } finally {
      setSyncing(false);
    }
  };

  const pullRemote = async (): Promise<void> => {
    setSyncing(true);
    try {
      await window.vibeAde.cloud.pullRemoteToLocal();
      addToast('success', 'Remote state pulled. Reloading...');
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to pull remote state.';
      addToast('error', message);
      setSyncing(false);
    }
  };

  const setAppearance = (mode: AppearanceMode): void => {
    setAppearanceMode(mode);
    setStoredAppearanceMode(mode);
    applyAppearanceMode(mode);
  };

  const onShortcutKeyDown = (action: ShortcutAction, event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (capturingAction !== action) {
      return;
    }
    event.preventDefault();
    const combo = toShortcutCombo(event.nativeEvent);
    if (!combo) {
      return;
    }
    const next = { ...shortcuts, [action]: combo };
    setShortcuts(next);
    saveShortcuts(next);
    setCapturingAction(null);
  };

  const updateAgentConfig = (patch: Partial<typeof agentPreferences>): void => {
    const next = { ...agentPreferences, ...patch };
    setAgentPreferences(next);
    saveAgentPreferences(next);
  };

  const themeCards: Array<{ id: AppearanceMode; label: string }> = [
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
    { id: 'system', label: 'System' }
  ];

  return (
    <div className="settings-overlay" onClick={() => closeSettings()}>
      <section className="settings-shell" onClick={(event) => event.stopPropagation()}>
        <aside className="settings-sidebar">
          <div className="settings-sidebar-title">
            <span>{'\uD83D\uDEE0\uFE0F'}</span>
            <div>
              <strong>Settings</strong>
              <small>Configuration</small>
            </div>
          </div>

          <nav className="settings-nav">
            {SETTINGS_TABS.map((tab) => (
              <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
                <span className="settings-nav-icon">{tab.icon}</span>
                <span className="settings-nav-text">
                  <strong>{tab.label}</strong>
                  <small>{tab.description}</small>
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="settings-main">
          {activeTab === 'appearance' && (
            <>
              <header className="settings-main-header">
                <h3>Appearance</h3>
                <p>Personalize your workspace with light, dark, or system theme.</p>
              </header>

              <section className="theme-grid">
                {themeCards.map((theme) => (
                  <button
                    key={theme.id}
                    className={appearanceMode === theme.id ? 'theme-card active' : 'theme-card'}
                    onClick={() => setAppearance(theme.id)}
                  >
                    <div className="theme-preview">
                      <span />
                      <span />
                      <span />
                    </div>
                    <small>{theme.label}</small>
                  </button>
                ))}
              </section>
            </>
          )}

          {activeTab === 'shortcuts' && (
            <>
              <header className="settings-main-header">
                <h3>Shortcuts</h3>
                <p>Press a key combination to assign exactly one hotkey per action.</p>
              </header>

              <section className="settings-shortcuts">
                {SHORTCUT_ROWS.map((item) => (
                  <article key={item.action} className="shortcut-row">
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </div>
                    <button
                      className={capturingAction === item.action ? 'shortcut-capture active' : 'shortcut-capture'}
                      onClick={() => setCapturingAction((prev) => (prev === item.action ? null : item.action))}
                      onKeyDown={(event) => onShortcutKeyDown(item.action, event)}
                    >
                      {capturingAction === item.action ? 'Press keys...' : shortcuts[item.action]}
                    </button>
                  </article>
                ))}
                <div className="shortcut-actions">
                  <button
                    onClick={() => {
                      setShortcuts(DEFAULT_SHORTCUTS);
                      saveShortcuts(DEFAULT_SHORTCUTS);
                      setCapturingAction(null);
                    }}
                  >
                    Reset Defaults
                  </button>
                </div>
              </section>
            </>
          )}

          {activeTab === 'task-board' && (
            <>
              <header className="settings-main-header">
                <h3>Task Board</h3>
                <p>History of tasks created across all workspaces.</p>
              </header>

              <section className="settings-task-history">
                {taskHistory.length === 0 ? (
                  <p>No tasks created yet.</p>
                ) : (
                  taskHistory.map(({ task, workspaceName }) => (
                    <article key={task.id} className="task-history-item">
                      <div className="task-history-title">
                        <strong>{task.title}</strong>
                        <span>{TASK_STATUS_LABELS[task.status]}</span>
                      </div>
                      <small>Workspace: {workspaceName}</small>
                      <small>Updated: {new Date(task.updatedAt).toLocaleString()}</small>
                    </article>
                  ))
                )}
              </section>
            </>
          )}

          {activeTab === 'agent' && (
            <>
              <header className="settings-main-header">
                <h3>Agent</h3>
                <p>Configure default model and runtime behavior for agents.</p>
              </header>

              <section className="settings-agent-config">
                <label>
                  <span>Default Model</span>
                  <select
                    value={agentPreferences.defaultModel}
                    onChange={(event) => updateAgentConfig({ defaultModel: event.target.value as (typeof AGENT_MODELS)[number] })}
                  >
                    {AGENT_MODELS.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="agent-checkbox">
                  <input
                    type="checkbox"
                    checked={agentPreferences.autoAttachToNewPane}
                    onChange={(event) => updateAgentConfig({ autoAttachToNewPane: event.target.checked })}
                  />
                  <span>Auto attach agent to new panes</span>
                </label>
              </section>
            </>
          )}

          {activeTab === 'account' && (
            <>
              <header className="settings-main-header">
                <h3>Account</h3>
                <p>Cloud sync and account controls.</p>
              </header>

              <section className="cloud-sync-section">
                <h4>Cloud Sync</h4>
                <div className="cloud-sync-status">
                  <span>Configured: {status?.configured ? 'Yes' : 'No'}</span>
                  <span>Authenticated: {status?.authenticated ? 'Yes' : 'No'}</span>
                  <span>Strategy: {syncPreview?.strategy === 'last_write_wins' ? 'Last-write-wins' : '-'}</span>
                </div>
                {syncPreview && (
                  <div className="cloud-sync-conflict-summary">
                    <span>Compared: {syncPreview.compared}</span>
                    <span>Local newer: {syncPreview.localWins}</span>
                    <span>Remote newer: {syncPreview.remoteWins}</span>
                    <span>Equal: {syncPreview.equal}</span>
                  </div>
                )}
                <div className="cloud-sync-actions">
                  <button onClick={() => void refreshCloudData()} disabled={syncing}>
                    Refresh
                  </button>
                  <button onClick={() => void pushLocal()} disabled={syncing || !status?.configured || !status?.authenticated}>
                    Sync Now
                  </button>
                  <button onClick={() => void pullRemote()} disabled={syncing || !status?.configured || !status?.authenticated}>
                    Pull Remote
                  </button>
                </div>
                <div className="cloud-sync-list">
                  {remoteWorkspaces.length === 0 ? (
                    <p>No cloud workspaces found.</p>
                  ) : (
                    remoteWorkspaces.map((workspace) => (
                      <article key={workspace.id} className="cloud-sync-item">
                        <div className="cloud-sync-item-title">
                          <strong>{workspace.name}</strong>
                          {(() => {
                            const conflict = syncPreview?.conflicts.find((item) => item.workspaceId === workspace.id);
                            if (!conflict) {
                              return <span className="sync-pill sync-pill-new">Cloud</span>;
                            }
                            if (conflict.winner === 'local') {
                              return <span className="sync-pill sync-pill-local">Local</span>;
                            }
                            if (conflict.winner === 'remote') {
                              return <span className="sync-pill sync-pill-remote">Remote</span>;
                            }
                            return <span className="sync-pill sync-pill-equal">Equal</span>;
                          })()}
                        </div>
                        <small>Cloud: {new Date(workspace.updatedAt).toLocaleString()}</small>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <div className="settings-account-actions">
                <button className="danger" onClick={() => void logout()}>
                  Logout
                </button>
              </div>
            </>
          )}
        </main>
      </section>
    </div>
  );
}
