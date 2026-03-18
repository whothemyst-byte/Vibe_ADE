import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import type { CloudSyncPreview, CloudSyncStatus, CloudWorkspaceSummary } from '@shared/ipc';
import type { TaskItem, TaskStatus } from '@shared/types';
import { useToastStore } from '@renderer/hooks/useToast';
import {
  DEFAULT_SHORTCUTS,
  loadEnvironmentSaveDirectory,
  loadShortcuts,
  saveEnvironmentSaveDirectory,
  saveShortcuts,
  toShortcutCombo,
  type ShortcutAction
} from '@renderer/services/preferences';
import { applyAppearanceMode, getStoredAppearanceMode, resolveEffectiveTheme, setStoredAppearanceMode, type AppearanceMode } from '@renderer/theme/appearance';
import { THEME_DEFINITIONS, THEME_LABELS, THEME_ORDER } from '@renderer/theme/theme';
import { SUBSCRIPTION_PLANS, normalizeSubscriptionState } from '@shared/subscription';
import { UiIcon, type UiIconName } from './UiIcon';

type SettingsTab = 'appearance' | 'shortcuts' | 'environments' | 'task-board' | 'account';

const SETTINGS_TABS: Array<{
  id: SettingsTab;
  label: string;
  description: string;
  icon: UiIconName;
}> = [
  { id: 'appearance', label: 'Appearance', description: 'Theme and display', icon: 'palette' },
  { id: 'shortcuts', label: 'Shortcuts', description: 'Keyboard bindings', icon: 'key' },
  { id: 'environments', label: 'Environments', description: 'Local save/export', icon: 'layout' },
  { id: 'task-board', label: 'Task Board', description: 'Task history', icon: 'board' },
  { id: 'account', label: 'Account', description: 'Cloud and auth', icon: 'user' }
];

const SHORTCUT_ROWS: Array<{ action: ShortcutAction; label: string; description: string }> = [
  { action: 'newWorkspace', label: 'New Workspace', description: 'Create a new workspace' },
  { action: 'openWorkspace', label: 'Open Workspace', description: 'Open or import a workspace' },
  { action: 'saveLayout', label: 'Save Layout', description: 'Save current workspace layout' },
  { action: 'findInTerminal', label: 'Find in Terminal', description: 'Search within the active terminal' },
  { action: 'clearActivePane', label: 'Clear Active Pane', description: 'Clear output in the active terminal pane' },
  { action: 'newPane', label: 'New Pane', description: 'Add a new terminal pane' },
  { action: 'closePane', label: 'Close Pane', description: 'Close the active terminal pane' },
  { action: 'resetZoom', label: 'Reset Zoom', description: 'Reset zoom level' },
  { action: 'zoomIn', label: 'Zoom In', description: 'Increase app zoom level' },
  { action: 'zoomOut', label: 'Zoom Out', description: 'Decrease app zoom level' },
  { action: 'toggleFullScreen', label: 'Toggle Full Screen', description: 'Enter or exit full screen' },
  { action: 'openSettings', label: 'Settings', description: 'Open settings' },
  { action: 'toggleTaskBoard', label: 'Task Board', description: 'Toggle task board view' },
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
  const settingsTab = useWorkspaceStore((s) => s.ui.settingsTab);
  const setSettingsTab = useWorkspaceStore((s) => s.setSettingsTab);
  const addToast = useToastStore((s) => s.addToast);

  const [activeTab, setActiveTab] = useState<SettingsTab>(settingsTab ?? 'appearance');
  const [status, setStatus] = useState<CloudSyncStatus | null>(null);
  const [remoteWorkspaces, setRemoteWorkspaces] = useState<CloudWorkspaceSummary[]>([]);
  const [syncPreview, setSyncPreview] = useState<CloudSyncPreview | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>(() => getStoredAppearanceMode());
  const [systemBase, setSystemBase] = useState<'light' | 'dark'>(() => resolveEffectiveTheme('system'));
  const [shortcuts, setShortcuts] = useState(loadShortcuts);
  const [capturingAction, setCapturingAction] = useState<ShortcutAction | null>(null);
  const [environmentSaveDir, setEnvironmentSaveDir] = useState<string | null>(() => loadEnvironmentSaveDirectory());
  const [profile, setProfile] = useState(() => {
    try {
      const raw = window.localStorage.getItem('vibeAde.profile');
      return raw ? (JSON.parse(raw) as { displayName: string; company: string; role: string }) : { displayName: '', company: '', role: '' };
    } catch {
      return { displayName: '', company: '', role: '' };
    }
  });
  const [profileSavedAt, setProfileSavedAt] = useState<string | null>(null);

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

  useEffect(() => {
    setActiveTab(settingsTab ?? 'appearance');
  }, [settingsTab]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const update = (): void => setSystemBase(resolveEffectiveTheme('system'));
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  const taskHistory = useMemo<TaskHistoryItem[]>(
    () =>
      appState.workspaces
        .flatMap((workspace) => workspace.tasks.map((task) => ({ task, workspaceName: workspace.name })))
        .sort((a, b) => new Date(b.task.updatedAt).getTime() - new Date(a.task.updatedAt).getTime()),
    [appState.workspaces]
  );

  const subscription = useMemo(() => normalizeSubscriptionState(appState.subscription), [appState.subscription]);
  const plan = SUBSCRIPTION_PLANS[subscription.tier];
  const cloudLimit = plan.limits.maxCloudSyncedWorkspaces;
  const cloudBlocked = cloudLimit !== null && appState.workspaces.length > cloudLimit;
  const taskBoardLocked = !plan.features.taskBoard;
  const updateStatus = useWorkspaceStore((s) => s.ui.updateStatus);

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

  const themeCards = THEME_ORDER.map((id) => {
    const definition = id === 'system' ? null : THEME_DEFINITIONS[id];
    const base = id === 'system' ? systemBase : definition?.base ?? 'dark';
    return {
      id,
      label: THEME_LABELS[id],
      base,
      isSystem: id === 'system',
      tokens: id === 'system' ? THEME_DEFINITIONS[systemBase].tokens : THEME_DEFINITIONS[id].tokens
    };
  });

  return (
    <div className="settings-overlay" onClick={() => closeSettings()}>
      <section className="settings-shell" onClick={(event) => event.stopPropagation()}>
        <aside className="settings-sidebar">
          <div className="settings-sidebar-title">
            <UiIcon name="settings" className="ui-icon" />
            <div>
              <strong>Settings</strong>
              <small>Configuration</small>
            </div>
          </div>

          <nav className="settings-nav">
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? 'active' : ''}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSettingsTab(tab.id);
                }}
              >
                <span className="settings-nav-icon">
                  <UiIcon name={tab.icon} className="ui-icon" />
                </span>
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
                <p>Personalize your workspace with one of the available themes.</p>
              </header>

              <section className="theme-grid">
                {themeCards.map((theme) => (
                  <button
                    key={theme.id}
                    className={appearanceMode === theme.id ? 'theme-card active' : 'theme-card'}
                    onClick={() => setAppearance(theme.id)}
                  >
                    <div className="theme-card-header">
                      <div>
                        <strong className="theme-card-title">{theme.label}</strong>
                        {theme.isSystem && <small className="theme-card-meta">Matches OS</small>}
                      </div>
                      <span className="theme-card-chip">{theme.isSystem ? `Auto ${theme.base}` : theme.base}</span>
                    </div>
                    <div
                      className="theme-preview"
                      style={
                        {
                          borderColor: theme.tokens.border,
                          background: theme.tokens.bgPanel,
                          '--preview-bg-header': theme.tokens.bgHeader,
                          '--preview-bg-panel': theme.tokens.bgPanel,
                          '--preview-bg-panel-2': theme.tokens.bgPanel2,
                          '--preview-bg-elev': theme.tokens.bgElev,
                          '--preview-text': theme.tokens.text,
                          '--preview-text-muted': theme.tokens.textMuted,
                          '--preview-accent': theme.tokens.accent,
                          '--preview-border': theme.tokens.border,
                          '--preview-border-strong': theme.tokens.borderStrong
                        } as CSSProperties
                      }
                    >
                      <div className="theme-mini-header">
                        <span className="theme-mini-dot" />
                        <span className="theme-mini-dot" />
                        <span className="theme-mini-dot" />
                      </div>
                      <div className="theme-mini-body">
                        <div className="theme-mini-sidebar">
                          <div className="theme-mini-line strong" />
                          <div className="theme-mini-line" />
                          <div className="theme-mini-line" />
                          <div className="theme-mini-line short" />
                        </div>
                        <div className="theme-mini-main">
                          <div className="theme-mini-toolbar">
                            <div className="theme-mini-pill" />
                            <div className="theme-mini-pill" />
                            <div className="theme-mini-pill accent" />
                          </div>
                          <div className="theme-mini-card" />
                          <div className="theme-mini-code" />
                        </div>
                      </div>
                    </div>
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

          {activeTab === 'environments' && (
            <>
              <header className="settings-main-header">
                <h3>Environments</h3>
                <p>Control where File → Save exports your current environment layout.</p>
              </header>

              <section className="cloud-sync-section">
                <h4>Environment Save Location</h4>
                <p>
                  When set, <code>File → Save</code> / <code>Ctrl+S</code> exports the active environment to this folder as a JSON file.
                  Exported environments open with plain terminals (no command history).
                </p>

                <div className="root-path-picker">
                  <input value={environmentSaveDir ?? ''} readOnly placeholder="Not set" />
                  <button
                    type="button"
                    onClick={async () => {
                      const selected = await window.vibeAde.system.selectDirectory();
                      if (!selected) {
                        return;
                      }
                      saveEnvironmentSaveDirectory(selected);
                      setEnvironmentSaveDir(selected);
                      addToast('success', 'Environment save location updated');
                    }}
                  >
                    Choose
                  </button>
                </div>

                {environmentSaveDir && (
                  <div className="cloud-sync-actions">
                    <button
                      className="danger"
                      onClick={() => {
                        saveEnvironmentSaveDirectory(null);
                        setEnvironmentSaveDir(null);
                        addToast('success', 'Environment save location cleared');
                      }}
                    >
                      Clear Location
                    </button>
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === 'task-board' && (
            <>
              <header className="settings-main-header">
                <h3>Task Board</h3>
                <p>History of tasks created across all workspaces.</p>
              </header>

              {taskBoardLocked && (
                <section className="settings-locked-card">
                  <div className="settings-locked-content">
                    <div className="settings-locked-icon">
                      <UiIcon name="lock" className="ui-icon ui-icon-lg lock-icon" />
                    </div>
                    <div className="settings-locked-text">
                      <h4>Task Board is available on Flux and Forge</h4>
                      <p>Upgrade to manage tasks, track progress, and keep a running history across your workspaces.</p>
                      <div className="settings-locked-actions">
                        <button
                          className="primary"
                          onClick={() => {
                            void window.vibeAde.system.openExternal('https://quansynd.com');
                          }}
                        >
                          Upgrade to Flux or Forge
                        </button>
                        <span className="account-muted">You can update this link to pricing later.</span>
                      </div>
                    </div>
                  </div>
                </section>
              )}

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

          {activeTab === 'account' && (
            <>
              <header className="settings-main-header">
                <h3>Account</h3>
                <p>Cloud sync and account controls.</p>
              </header>

              <div className="account-grid">
                <section className="account-card">
                  <div className="account-card-header">
                    <h4>Profile</h4>
                    <span className="account-plan-chip">{plan.label}</span>
                  </div>
                  <div className="account-meta">
                    <span>Support: {plan.support}</span>
                    <span>Plan tier: {plan.label}</span>
                  </div>
                  <div className="account-fields">
                    <label>
                      Display name
                      <input
                        value={profile.displayName}
                        placeholder="Display name"
                        onChange={(e) => setProfile((prev) => ({ ...prev, displayName: e.target.value }))}
                      />
                    </label>
                    <label>
                      Company / Team
                      <input
                        value={profile.company}
                        placeholder="Company / Team"
                        onChange={(e) => setProfile((prev) => ({ ...prev, company: e.target.value }))}
                      />
                    </label>
                    <label>
                      Role
                      <input
                        value={profile.role}
                        placeholder="Role"
                        onChange={(e) => setProfile((prev) => ({ ...prev, role: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="account-actions">
                    <button
                      onClick={() => {
                        window.localStorage.setItem('vibeAde.profile', JSON.stringify(profile));
                        setProfileSavedAt(new Date().toLocaleString());
                      }}
                    >
                      Save Profile
                    </button>
                    {profileSavedAt && <span className="account-muted">Saved {profileSavedAt}</span>}
                  </div>
                </section>

                <section className="account-card">
                  <div className="account-card-header">
                    <h4>Cloud Sync</h4>
                    {cloudBlocked && <span className="account-warn">Limit reached</span>}
                  </div>
                  <div className="account-meta">
                    <span>Configured: {status?.configured ? 'Yes' : 'No'}</span>
                    <span>Authenticated: {status?.authenticated ? 'Yes' : 'No'}</span>
                    <span>Strategy: {syncPreview?.strategy === 'last_write_wins' ? 'Last-write-wins' : '-'}</span>
                  </div>
                  {cloudLimit !== null && (
                    <p className="account-muted">
                      Spark allows up to {cloudLimit} cloud-synced workspaces. You currently have {appState.workspaces.length}.
                    </p>
                  )}
                  {syncPreview && (
                    <div className="cloud-sync-conflict-summary">
                      <span>Compared: {syncPreview.compared}</span>
                      <span>Local newer: {syncPreview.localWins}</span>
                      <span>Remote newer: {syncPreview.remoteWins}</span>
                      <span>Equal: {syncPreview.equal}</span>
                    </div>
                  )}
                  <div className="account-actions">
                    <button
                      onClick={() => void window.vibeAde.update.check()}
                      disabled={updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
                    >
                      {updateStatus.state === 'checking' ? 'Checking…' : 'Check for updates'}
                    </button>
                    <button onClick={() => void refreshCloudData()} disabled={syncing}>
                      Refresh
                    </button>
                    <button
                      onClick={() => void pushLocal()}
                      disabled={syncing || cloudBlocked || !status?.configured || !status?.authenticated}
                    >
                      Sync Now
                    </button>
                    <button
                      onClick={() => void pullRemote()}
                      disabled={syncing || cloudBlocked || !status?.configured || !status?.authenticated}
                    >
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
              </div>

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
