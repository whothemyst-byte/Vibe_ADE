import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SWARM_PROMPT_PREFERENCES,
  DEFAULT_UI_PREFERENCES,
  isShortcutCaptureTarget,
  loadSwarmPromptPreferences,
  loadUiPreferences,
  saveShortcuts,
  saveSwarmPromptPreferences,
  saveUiPreferences,
  toShortcutCombo
} from '../../src/renderer/src/services/preferences';

describe('preferences shortcuts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('identifies shortcut capture targets so global shortcuts do not steal focus', () => {
    const captureTarget = {
      closest: (selector: string) => (selector === '.shortcut-capture' ? {} : null)
    } as unknown as EventTarget;

    const plainTarget = {
      closest: () => null
    } as unknown as EventTarget;

    expect(isShortcutCaptureTarget(captureTarget)).toBe(true);
    expect(isShortcutCaptureTarget(plainTarget)).toBe(false);
    expect(isShortcutCaptureTarget(null)).toBe(false);
  });

  it('keeps Ctrl+Alt combinations intact for shortcut matching', () => {
    const combo = toShortcutCombo({
      key: 'j',
      ctrlKey: true,
      altKey: true,
      shiftKey: false,
      metaKey: false
    } as KeyboardEvent);

    expect(combo).toBe('Ctrl+Alt+J');
  });

  it('broadcasts shortcut updates in the same window after saving', () => {
    const setItem = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      localStorage: {
        setItem
      },
      dispatchEvent
    });

    saveShortcuts({
      newWorkspace: 'Ctrl+Shift+N',
      openWorkspace: 'Ctrl+O',
      toggleSidebar: 'Ctrl+B',
      selectWorkspace1: 'Ctrl+1',
      selectWorkspace2: 'Ctrl+2',
      selectWorkspace3: 'Ctrl+3',
      selectWorkspace4: 'Ctrl+4',
      selectWorkspace5: 'Ctrl+5',
      selectWorkspace6: 'Ctrl+6',
      selectWorkspace7: 'Ctrl+7',
      selectWorkspace8: 'Ctrl+8',
      selectWorkspace9: 'Ctrl+9',
      selectWorkspace10: 'Ctrl+0',
      saveLayout: 'Ctrl+S',
      findInTerminal: 'Ctrl+F',
      clearActivePane: 'Ctrl+L',
      newPane: 'Ctrl+Shift+T',
      closePane: 'Ctrl+W',
      resetZoom: 'Ctrl+Shift+0',
      zoomIn: 'Ctrl+=',
      zoomOut: 'Ctrl+-',
      toggleFullScreen: 'F11',
      openSettings: 'Ctrl+,',
      toggleTaskBoard: 'Ctrl+J',
      createTaskQuick: 'Ctrl+Alt+J',
      toggleTaskArchived: 'Ctrl+Alt+J',
      resetTaskFilters: 'Ctrl+Alt+R'
    });

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]).toBeInstanceOf(Event);
  });
});

describe('swarm prompt preferences', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads stored swarm prompt preferences with sane fallbacks', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn(() =>
          JSON.stringify({
            coordinator: { personaLabel: 'Ops Lead', personality: 'Direct', specialization: '', promptOverride: '' },
            reviewer: { reviewStrictness: 'critical' }
          })
        )
      }
    });

    const preferences = loadSwarmPromptPreferences();
    expect(preferences.coordinator.personaLabel).toBe('Ops Lead');
    expect(preferences.coordinator.personality).toBe('Direct');
    expect(preferences.coordinator.specialization).toBe(DEFAULT_SWARM_PROMPT_PREFERENCES.coordinator.specialization);
    expect(preferences.reviewer.reviewStrictness).toBe('critical');
    expect(preferences.builder.personaLabel).toBe(DEFAULT_SWARM_PROMPT_PREFERENCES.builder.personaLabel);
  });

  it('persists swarm prompt preferences to local storage', () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', {
      localStorage: {
        setItem
      }
    });

    saveSwarmPromptPreferences({
      ...DEFAULT_SWARM_PROMPT_PREFERENCES,
      builder: {
        ...DEFAULT_SWARM_PROMPT_PREFERENCES.builder,
        personaLabel: 'Implementation Lead'
      }
    });

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0]?.[0]).toBe('vibe-ade-swarm-prompt-preferences');
    expect(setItem.mock.calls[0]?.[1]).toContain('Implementation Lead');
  });
});

describe('preferences ui — vibeEnabled', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults vibeEnabled to true', () => {
    expect(DEFAULT_UI_PREFERENCES.vibeEnabled).toBe(true);
  });

  it('returns vibeEnabled=true when no stored prefs exist', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null } });
    expect(loadUiPreferences().vibeEnabled).toBe(true);
  });

  it('returns vibeEnabled=false when stored prefs disable it', () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => JSON.stringify({ vibeEnabled: false }) }
    });
    expect(loadUiPreferences().vibeEnabled).toBe(false);
  });

  it('coerces a non-boolean vibeEnabled back to the default', () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => JSON.stringify({ vibeEnabled: 'nope' }) }
    });
    expect(loadUiPreferences().vibeEnabled).toBe(true);
  });

  it('dispatches vibe-ade:ui-preferences-changed after saving', () => {
    const setItem = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { localStorage: { setItem }, dispatchEvent });

    saveUiPreferences({
      accentColor: '#D79A3D',
      fontStyle: 'modern',
      language: 'en',
      vibeEnabled: false
    });

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0][0] as Event;
    expect(event.type).toBe('vibe-ade:ui-preferences-changed');
  });
});
