import { describe, expect, it } from 'vitest';
import { isAltModifiedPrimaryShortcut } from '../../src/renderer/src/services/terminalShortcuts';

describe('TerminalPane alt shortcut handling', () => {
  it('treats Ctrl or Meta plus Alt as a blocked terminal chord', () => {
    expect(isAltModifiedPrimaryShortcut({ ctrlKey: true, metaKey: false, altKey: true })).toBe(true);
    expect(isAltModifiedPrimaryShortcut({ ctrlKey: false, metaKey: true, altKey: true })).toBe(true);
    expect(isAltModifiedPrimaryShortcut({ ctrlKey: true, metaKey: false, altKey: false })).toBe(false);
  });
});
