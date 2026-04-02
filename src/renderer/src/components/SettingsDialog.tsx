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
  { action: 'toggleSidebar', label: 'Toggle Sidebar', description: 'Collapse or expand the workspace sidebar' },
  { action: 'selectWorkspace1', label: 'Workspace 1', description: 'Switch to workspace 1' },
  { action: 'selectWorkspace2', label: 'Workspace 2', description: 'Switch to workspace 2' },
  { action: 'selectWorkspace3', label: 'Workspace 3', description: 'Switch to workspace 3' },
  { action: 'selectWorkspace4', label: 'Workspace 4', description: 'Switch to workspace 4' },
  { action: 'selectWorkspace5', label: 'Workspace 5', description: 'Switch to workspace 5' },
  { action: 'selectWorkspace6', label: 'Workspace 6', description: 'Switch to workspace 6' },
  { action: 'selectWorkspace7', label: 'Workspace 7', description: 'Switch to workspace 7' },
  { action: 'selectWorkspace8', label: 'Workspace 8', description: 'Switch to workspace 8' },
  { action: 'selectWorkspace9', label: 'Workspace 9', description: 'Switch to workspace 9' },
  { action: 'selectWorkspace10', label: 'Workspace 10', description: 'Switch to workspace 10' },
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

const SHORTCUT_GROUPS: Array<{
  title: string;
  description: string;
  items: Array<{ action: ShortcutAction; label: string; description: string }>;
}> = [
  {
    title: 'Workspace',
    description: 'Actions that shape workspaces and navigation.',
    items: SHORTCUT_ROWS.filter((item) =>
      ['newWorkspace', 'openWorkspace', 'toggleSidebar', 'selectWorkspace1', 'selectWorkspace2', 'selectWorkspace3', 'selectWorkspace4', 'selectWorkspace5', 'selectWorkspace6', 'selectWorkspace7', 'selectWorkspace8', 'selectWorkspace9', 'selectWorkspace10', 'saveLayout'].includes(item.action)
    )
  },
  {
    title: 'Panes',
    description: 'Shortcuts for pane-level editing and cleanup.',
    items: SHORTCUT_ROWS.filter((item) => ['findInTerminal', 'clearActivePane', 'newPane', 'closePane'].includes(item.action))
  },
  {
    title: 'View',
    description: 'Zoom and window-level view controls.',
    items: SHORTCUT_ROWS.filter((item) => ['resetZoom', 'zoomIn', 'zoomOut', 'toggleFullScreen'].includes(item.action))
  },
  {
    title: 'Tasks',
    description: 'Task board and task creation controls.',
    items: SHORTCUT_ROWS.filter((item) => ['openSettings', 'toggleTaskBoard', 'createTaskQuick', 'toggleTaskArchived', 'resetTaskFilters'].includes(item.action))
  }
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
  const [profile, setProfile] = useState({
    displayName: '',
    company: '',
    role: '',
    email: '',
    timezone: 'Asia/Calcutta',
    notifications: true,
    theme: 'system' as 'light' | 'dark' | 'system',
    defaultWorkspaceId: ''
  });
  const [profileDraft, setProfileDraft] = useState(profile);
  const [profileEditing, setProfileEditing] = useState(false);
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
    let cancelled = false;
    const loadProfile = async (): Promise<void> => {
      try {
        const remote = await window.vibeAde.workspace.getProfile();
        if (!cancelled && remote) {
          const nextProfile = {
            displayName: remote.displayName,
            company: remote.company,
            role: remote.role,
            email: remote.email ?? '',
            timezone: remote.timezone,
            notifications: remote.notifications,
            theme: remote.theme,
            defaultWorkspaceId: remote.defaultWorkspaceId
          };
          setProfile(nextProfile);
          setProfileDraft(nextProfile);
        }
      } catch {
        // Leave the local defaults in place if Supabase is unavailable.
      }
    };
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

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
  const currentVersion = updateStatus.version ? `v${updateStatus.version}` : 'v0.3.9';

  const getCloudErrorMessage = (action: 'sync' | 'pull', error: unknown): string => {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('no remote data available to pull')) {
        return 'There is nothing in the cloud to pull yet.';
      }
      if (message.includes('cloud sync is not configured')) {
        return 'Cloud sync is not set up on this device.';
      }
      if (message.includes('no authenticated user session')) {
        return 'Please sign in again to use cloud sync.';
      }
    }

    return action === 'pull'
      ? 'We could not pull from the cloud right now. Please try again.'
      : 'We could not sync to the cloud right now. Please try again.';
  };

  const saveProfile = async (): Promise<void> => {
    try {
      const updated = await window.vibeAde.workspace.updateProfile({
        displayName: profileDraft.displayName,
        company: profileDraft.company,
        role: profileDraft.role
      });
      const nextProfile = {
        displayName: updated.displayName,
        company: updated.company,
        role: updated.role,
        email: updated.email ?? profile.email,
        timezone: updated.timezone,
        notifications: updated.notifications,
        theme: updated.theme,
        defaultWorkspaceId: updated.defaultWorkspaceId
      };
      setProfile(nextProfile);
      setProfileDraft(nextProfile);
      setProfileEditing(false);
      setProfileSavedAt(new Date().toLocaleString());
      addToast('info', 'Profile details saved.');
    } catch (error) {
      addToast('error', error instanceof Error ? 'Could not save profile changes. Please try again.' : 'Could not save profile changes. Please try again.');
    }
  };

  const beginEditProfile = (): void => {
    setProfileDraft(profile);
    setProfileEditing(true);
  };

  const cancelEditProfile = (): void => {
    setProfileDraft(profile);
    setProfileEditing(false);
  };

  const logout = async (): Promise<void> => {
    await window.vibeAde.auth.logout();
    window.location.reload();
  };

  const pushLocal = async (): Promise<void> => {
    setSyncing(true);
    try {
      const hadRemoteWorkspaces = remoteWorkspaces.length > 0;
      const localCount = appState.workspaces.length;
      if (localCount === 0) {
        addToast('info', 'There are no workspaces to sync yet.');
        return;
      }
      await window.vibeAde.cloud.pushLocalState();
      await refreshCloudData();
      addToast(
        'info',
        hadRemoteWorkspaces
          ? 'Your workspace changes were synced to the cloud.'
          : 'Your first cloud sync was created successfully.'
      );
    } catch (error) {
      addToast('error', getCloudErrorMessage('sync', error));
    } finally {
      setSyncing(false);
    }
  };

  const pullRemote = async (): Promise<void> => {
    setSyncing(true);
    try {
      if (remoteWorkspaces.length === 0) {
        addToast('info', 'There are no cloud workspaces to pull yet.');
        return;
      }
      await window.vibeAde.cloud.pullRemoteToLocal();
      addToast('info', 'Cloud workspaces were loaded successfully. Reloading...');
      window.location.reload();
    } catch (error) {
      addToast('error', getCloudErrorMessage('pull', error));
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

          <div className="settings-sidebar-status">
            <small>Current Plan</small>
            <strong>{plan.label} plan</strong>
          </div>
        </aside>

        <main className="settings-main">

          {activeTab === 'appearance' && (
            <>
              <header className="settings-main-header">
                <h3>Appearance</h3>
                <p>Personalize your workspace with one of the available themes.</p>
              </header>

              <section className="settings-section-card">
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
              </section>
            </>
          )}

          {activeTab === 'shortcuts' && (
            <>
              <header className="settings-main-header">
                <h3>Shortcuts</h3>
                <p>Press a key combination to assign exactly one hotkey per action.</p>
              </header>

              <section className="settings-shortcuts-shell">
                {SHORTCUT_GROUPS.map((group) => (
                  <section key={group.title} className="shortcut-group-card settings-section-card">
                    <div className="shortcut-group-head">
                      <div>
                        <div className="account-panel-kicker">{group.title}</div>
                        <div className="shortcut-group-title">{group.description}</div>
                      </div>
                    </div>

                    <div className="shortcut-group-list">
                      {group.items.map((item) => (
                        <article key={item.action} className="shortcut-row">
                          <div className="shortcut-copy">
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
                    </div>
                  </section>
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

              <section className="cloud-sync-section settings-section-card">
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

              <section className="settings-task-history settings-section-card">
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

              <div className="account-section-shell">
                <section className="account-profile-panel settings-section-card">
                  <div className="account-profile-header">
                    <div className="account-avatar">U</div>
                    <div className="account-profile-copy">
                      <div className="account-profile-title-row">
                        <div>
                          <h4>{profile.displayName.trim() || 'User'}</h4>
                          <small>{profile.email.trim() || 'No email set'}</small>
                        </div>
                        <span className="account-status-chip">Active</span>
                      </div>
                    </div>
                  </div>

                  <div className="account-profile-grid">
                    <div className="account-metric-card">
                      <small>Email</small>
                      <strong>{profile.email.trim() || 'Not set'}</strong>
                    </div>
                    <div className="account-metric-card">
                      <small>Account ID</small>
                      <strong>{profile.defaultWorkspaceId.trim() || 'Unknown'}</strong>
                    </div>
                  </div>

                  <div className="account-fields account-fields-compact">
                    <label>
                      Display name
                      <input
                        value={profileDraft.displayName}
                        placeholder="Display name"
                        disabled={!profileEditing}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, displayName: e.target.value }))}
                      />
                    </label>
                    <label>
                      Company / Team
                      <input
                        value={profileDraft.company}
                        placeholder="Company / Team"
                        disabled={!profileEditing}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, company: e.target.value }))}
                      />
                    </label>
                    <label>
                      Role
                      <input
                        value={profileDraft.role}
                        placeholder="Role"
                        disabled={!profileEditing}
                        onChange={(e) => setProfileDraft((prev) => ({ ...prev, role: e.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="account-card-actions-row">
                    {!profileEditing ? (
                      <button className="primary" onClick={beginEditProfile}>
                        Edit Profile
                      </button>
                    ) : (
                      <>
                        <button onClick={cancelEditProfile}>Cancel</button>
                        <button className="primary" onClick={() => void saveProfile()}>
                          Save Profile
                        </button>
                      </>
                    )}
                  </div>
                  {profileSavedAt && !profileEditing && <div className="account-note">Saved {profileSavedAt}</div>}
                </section>

                <div className="account-two-column">
                  <section className="account-billing-panel settings-section-card">
                    <div className="account-panel-head">
                      <div>
                        <div className="account-panel-kicker">Billing</div>
                        <div className="account-plan-row">
                          <strong>{plan.label} Plan</strong>
                        </div>
                      </div>
                      <div className="account-plan-actions">
                        <button
                          className="primary"
                          onClick={() => {
                            void window.vibeAde.system.openExternal('https://quansynd.com');
                          }}
                        >
                          Manage Plan
                        </button>
                        <button
                          onClick={() => {
                            void window.vibeAde.system.openExternal('https://quansynd.com');
                          }}
                        >
                          View Plans
                        </button>
                      </div>
                    </div>
                  <p className="account-panel-copy">Account and settings access only. Upgrade to unlock BridgeSpace.</p>
                  </section>

                  <section className="account-debug-panel settings-section-card">
                    <div className="account-panel-head">
                      <div>
                        <div className="account-panel-kicker">Debug</div>
                        <div className="account-plan-row">
                          <strong>Updates</strong>
                          <small className="account-muted-inline">Current version {currentVersion}</small>
                        </div>
                      </div>
                      <button
                        onClick={() => void window.vibeAde.update.check()}
                        disabled={updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
                      >
                        {updateStatus.state === 'checking' ? 'Checking…' : 'Check for updates'}
                      </button>
                    </div>
                    <div className="account-log-row">
                      <div className="account-log-copy">
                        <strong>Log file</strong>
                        <small>For debugging auth and API issues.</small>
                      </div>
                      <div className="account-log-path">
                        <code>C:\Users\admin\AppData\Local\Vibe-ADE-dev\crash-events.log</code>
                      </div>
                      <button disabled>Show in Explorer</button>
                    </div>
                  </section>
                </div>

                <section className="account-sync-panel settings-section-card">
                  <div className="account-panel-head">
                    <div>
                      <div className="account-panel-kicker">Cloud Sync</div>
                      <div className="account-plan-row">
                        <strong>Sync Status</strong>
                        {cloudBlocked && <span className="account-warn">Limit reached</span>}
                      </div>
                    </div>
                    <button onClick={() => void refreshCloudData()} disabled={syncing}>
                      Refresh
                    </button>
                  </div>
                  <div className="account-sync-summary">
                    <div className="account-sync-meta-row">
                      <span>Configured: {status?.configured ? 'Yes' : 'No'}</span>
                      <span>Authenticated: {status?.authenticated ? 'Yes' : 'No'}</span>
                      <span>Strategy: {syncPreview?.strategy === 'last_write_wins' ? 'Last-write-wins' : '-'}</span>
                    </div>
                    {syncPreview && (
                      <div className="account-sync-stat-grid">
                        <div className="account-sync-stat">
                          <small>Compared</small>
                          <strong>{syncPreview.compared}</strong>
                        </div>
                        <div className="account-sync-stat">
                          <small>Local newer</small>
                          <strong>{syncPreview.localWins}</strong>
                        </div>
                        <div className="account-sync-stat">
                          <small>Remote newer</small>
                          <strong>{syncPreview.remoteWins}</strong>
                        </div>
                        <div className="account-sync-stat">
                          <small>Equal</small>
                          <strong>{syncPreview.equal}</strong>
                        </div>
                      </div>
                    )}
                  </div>
                  {cloudLimit !== null && (
                    <p className="account-muted">
                      Spark allows up to {cloudLimit} cloud-synced workspaces. You currently have {appState.workspaces.length}.
                    </p>
                  )}
                  <div className="account-actions account-actions-tight">
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

                <div className="account-signout-footer">
                  <div>
                    <strong>Sign Out</strong>
                    <small>End your session on this device</small>
                  </div>
                  <button className="danger" onClick={() => void logout()}>
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
      </section>
    </div>
  );
}
