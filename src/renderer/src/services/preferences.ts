export type ShortcutAction =
  | 'newWorkspace'
  | 'openWorkspace'
  | 'saveLayout'
  | 'findInTerminal'
  | 'clearActivePane'
  | 'newPane'
  | 'closePane'
  | 'resetZoom'
  | 'zoomIn'
  | 'zoomOut'
  | 'toggleFullScreen'
  | 'openSettings'
  | 'toggleTaskBoard'
  | 'createTaskQuick'
  | 'toggleTaskArchived'
  | 'resetTaskFilters';

export type ShortcutBindings = Record<ShortcutAction, string>;

const SHORTCUTS_KEY = 'vibe-ade-shortcuts';
const ENVIRONMENT_SAVE_DIR_KEY = 'vibe-ade-environment-save-dir';
export const DEFAULT_SHORTCUTS: ShortcutBindings = {
  newWorkspace: 'Ctrl+Shift+N',
  openWorkspace: 'Ctrl+O',
  saveLayout: 'Ctrl+S',
  findInTerminal: 'Ctrl+F',
  clearActivePane: 'Ctrl+L',
  newPane: 'Ctrl+Shift+T',
  closePane: 'Ctrl+W',
  resetZoom: 'Ctrl+0',
  zoomIn: 'Ctrl+=',
  zoomOut: 'Ctrl+-',
  toggleFullScreen: 'F11',
  openSettings: 'Ctrl+,',
  toggleTaskBoard: 'Ctrl+J',
  createTaskQuick: 'Ctrl+Shift+J',
  toggleTaskArchived: 'Ctrl+Alt+J',
  resetTaskFilters: 'Ctrl+Alt+R'
};

export function loadShortcuts(): ShortcutBindings {
  try {
    const raw = window.localStorage.getItem(SHORTCUTS_KEY);
    if (!raw) {
      return DEFAULT_SHORTCUTS;
    }
    const parsed = JSON.parse(raw) as Partial<ShortcutBindings>;
    return {
      newWorkspace: typeof parsed.newWorkspace === 'string' ? parsed.newWorkspace : DEFAULT_SHORTCUTS.newWorkspace,
      openWorkspace: typeof parsed.openWorkspace === 'string' ? parsed.openWorkspace : DEFAULT_SHORTCUTS.openWorkspace,
      saveLayout: typeof parsed.saveLayout === 'string' ? parsed.saveLayout : DEFAULT_SHORTCUTS.saveLayout,
      findInTerminal: typeof parsed.findInTerminal === 'string' ? parsed.findInTerminal : DEFAULT_SHORTCUTS.findInTerminal,
      clearActivePane: typeof parsed.clearActivePane === 'string' ? parsed.clearActivePane : DEFAULT_SHORTCUTS.clearActivePane,
      newPane: typeof parsed.newPane === 'string' ? parsed.newPane : DEFAULT_SHORTCUTS.newPane,
      closePane: typeof parsed.closePane === 'string' ? parsed.closePane : DEFAULT_SHORTCUTS.closePane,
      resetZoom: typeof parsed.resetZoom === 'string' ? parsed.resetZoom : DEFAULT_SHORTCUTS.resetZoom,
      zoomIn: typeof parsed.zoomIn === 'string' ? parsed.zoomIn : DEFAULT_SHORTCUTS.zoomIn,
      zoomOut: typeof parsed.zoomOut === 'string' ? parsed.zoomOut : DEFAULT_SHORTCUTS.zoomOut,
      toggleFullScreen: typeof parsed.toggleFullScreen === 'string' ? parsed.toggleFullScreen : DEFAULT_SHORTCUTS.toggleFullScreen,
      openSettings: typeof parsed.openSettings === 'string' ? parsed.openSettings : DEFAULT_SHORTCUTS.openSettings,
      toggleTaskBoard: typeof parsed.toggleTaskBoard === 'string' ? parsed.toggleTaskBoard : DEFAULT_SHORTCUTS.toggleTaskBoard,
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

export function loadEnvironmentSaveDirectory(): string | null {
  try {
    const value = window.localStorage.getItem(ENVIRONMENT_SAVE_DIR_KEY);
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export function saveEnvironmentSaveDirectory(directory: string | null): void {
  if (!directory?.trim()) {
    window.localStorage.removeItem(ENVIRONMENT_SAVE_DIR_KEY);
    return;
  }
  window.localStorage.setItem(ENVIRONMENT_SAVE_DIR_KEY, directory.trim());
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
