export const AGENT_MODELS = ['llama3.2', 'qwen2.5-coder', 'mistral'] as const;
export type AgentModel = (typeof AGENT_MODELS)[number];

export interface AgentPreferences {
  defaultModel: AgentModel;
  autoAttachToNewPane: boolean;
}

export type ShortcutAction =
  | 'toggleCommandPalette'
  | 'openSettings'
  | 'openStartPage'
  | 'toggleTaskBoard'
  | 'toggleAgentPanel'
  | 'createTaskQuick'
  | 'toggleTaskArchived'
  | 'resetTaskFilters';

export type ShortcutBindings = Record<ShortcutAction, string>;

const SHORTCUTS_KEY = 'vibe-ade-shortcuts';
const AGENT_PREFS_KEY = 'vibe-ade-agent-preferences';

export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  toggleCommandPalette: 'Ctrl+K',
  openSettings: 'Ctrl+,',
  openStartPage: 'Ctrl+T',
  toggleTaskBoard: 'Ctrl+J',
  toggleAgentPanel: 'Ctrl+L',
  createTaskQuick: 'Ctrl+Shift+J',
  toggleTaskArchived: 'Ctrl+Alt+J',
  resetTaskFilters: 'Ctrl+Alt+R'
};

const DEFAULT_AGENT_PREFS: AgentPreferences = {
  defaultModel: 'llama3.2',
  autoAttachToNewPane: false
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function loadShortcuts(): ShortcutBindings {
  try {
    const raw = window.localStorage.getItem(SHORTCUTS_KEY);
    if (!raw) {
      return DEFAULT_SHORTCUTS;
    }
    const parsed = JSON.parse(raw) as Partial<ShortcutBindings>;
    return {
      toggleCommandPalette: typeof parsed.toggleCommandPalette === 'string' ? parsed.toggleCommandPalette : DEFAULT_SHORTCUTS.toggleCommandPalette,
      openSettings: typeof parsed.openSettings === 'string' ? parsed.openSettings : DEFAULT_SHORTCUTS.openSettings,
      openStartPage: typeof parsed.openStartPage === 'string' ? parsed.openStartPage : DEFAULT_SHORTCUTS.openStartPage,
      toggleTaskBoard: typeof parsed.toggleTaskBoard === 'string' ? parsed.toggleTaskBoard : DEFAULT_SHORTCUTS.toggleTaskBoard,
      toggleAgentPanel: typeof parsed.toggleAgentPanel === 'string' ? parsed.toggleAgentPanel : DEFAULT_SHORTCUTS.toggleAgentPanel,
      createTaskQuick: typeof parsed.createTaskQuick === 'string' ? parsed.createTaskQuick : DEFAULT_SHORTCUTS.createTaskQuick,
      toggleTaskArchived: typeof parsed.toggleTaskArchived === 'string' ? parsed.toggleTaskArchived : DEFAULT_SHORTCUTS.toggleTaskArchived,
      resetTaskFilters: typeof parsed.resetTaskFilters === 'string' ? parsed.resetTaskFilters : DEFAULT_SHORTCUTS.resetTaskFilters
    };
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

export function saveShortcuts(bindings: ShortcutBindings): void {
  window.localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(bindings));
}

export function loadAgentPreferences(): AgentPreferences {
  try {
    const raw = window.localStorage.getItem(AGENT_PREFS_KEY);
    if (!raw) {
      return DEFAULT_AGENT_PREFS;
    }
    const parsed = JSON.parse(raw) as Partial<AgentPreferences>;
    const defaultModel = AGENT_MODELS.includes(parsed.defaultModel as AgentModel)
      ? (parsed.defaultModel as AgentModel)
      : DEFAULT_AGENT_PREFS.defaultModel;
    return {
      defaultModel,
      autoAttachToNewPane: typeof parsed.autoAttachToNewPane === 'boolean'
        ? parsed.autoAttachToNewPane
        : DEFAULT_AGENT_PREFS.autoAttachToNewPane
    };
  } catch {
    return DEFAULT_AGENT_PREFS;
  }
}

export function saveAgentPreferences(preferences: AgentPreferences): void {
  window.localStorage.setItem(AGENT_PREFS_KEY, JSON.stringify(preferences));
}

export function toShortcutCombo(event: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push('Ctrl');
  }
  if (event.altKey) {
    parts.push('Alt');
  }
  if (event.shiftKey) {
    parts.push('Shift');
  }
  if (event.metaKey) {
    parts.push('Meta');
  }

  const key = normalizeKey(event.key);
  if (!key) {
    return null;
  }

  parts.push(key);
  return parts.join('+');
}

function normalizeKey(key: string): string | null {
  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') {
    return null;
  }
  if (key === ' ') {
    return 'Space';
  }
  if (key === 'Escape') {
    return 'Esc';
  }
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
    return key.replace('Arrow', '');
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return key;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  if (element.closest('.terminal-pane')) {
    return true;
  }
  const tag = element.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true;
  }
  return element.isContentEditable;
}
