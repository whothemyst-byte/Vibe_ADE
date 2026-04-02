import { describe, expect, it } from 'vitest';
import { getPresetIdForPaneCount } from '../../src/renderer/src/services/layoutPresets';

describe('layout preset selection', () => {
  it('rounds pane counts up so layouts do not collapse to a smaller template', () => {
    expect(getPresetIdForPaneCount(1)).toBe('1-pane');
    expect(getPresetIdForPaneCount(2)).toBe('2-pane-vertical');
    expect(getPresetIdForPaneCount(3)).toBe('3-pane-left-large');
    expect(getPresetIdForPaneCount(4)).toBe('4-pane-grid');
    expect(getPresetIdForPaneCount(5)).toBe('6-pane-grid');
    expect(getPresetIdForPaneCount(6)).toBe('6-pane-grid');
    expect(getPresetIdForPaneCount(7)).toBe('8-pane-grid');
    expect(getPresetIdForPaneCount(8)).toBe('8-pane-grid');
    expect(getPresetIdForPaneCount(9)).toBe('12-pane-grid');
    expect(getPresetIdForPaneCount(12)).toBe('12-pane-grid');
    expect(getPresetIdForPaneCount(13)).toBe('16-pane-grid');
    expect(getPresetIdForPaneCount(16)).toBe('16-pane-grid');
  });
});
