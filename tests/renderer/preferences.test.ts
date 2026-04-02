import { afterEach, describe, expect, it, vi } from 'vitest';
import { isShortcutCaptureTarget, saveShortcuts, toShortcutCombo } from '../../src/renderer/src/services/preferences';

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
