import { describe, expect, it } from 'vitest';
import { buildGridPreset, getPresetIdForPaneCount } from '../../src/renderer/src/services/layoutPresets';
import type { LayoutNode } from '../../src/shared/types';

function countPanes(node: LayoutNode): number {
  if (node.type === 'pane') return 1;
  return node.children.reduce((acc, c) => acc + countPanes(c), 0);
}

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

describe('buildGridPreset', () => {
  it('2x1 yields 2 panes in a horizontal split', () => {
    const tree = buildGridPreset(2, 1, ['a', 'b']);
    expect(countPanes(tree)).toBe(2);
    expect(tree.type).toBe('split');
    if (tree.type === 'split') expect(tree.direction).toBe('horizontal');
  });
  it('2x2 yields 4 panes (vertical of two horizontals)', () => {
    const tree = buildGridPreset(2, 2, ['a', 'b', 'c', 'd']);
    expect(countPanes(tree)).toBe(4);
    if (tree.type === 'split') expect(tree.direction).toBe('vertical');
  });
  it('3x2 yields 6 panes', () => {
    expect(countPanes(buildGridPreset(3, 2, ['a', 'b', 'c', 'd', 'e', 'f']))).toBe(6);
  });
  it('4x2 yields 8 panes', () => {
    expect(countPanes(buildGridPreset(4, 2, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']))).toBe(8);
  });
  it('throws when paneIds length mismatches cols*rows', () => {
    expect(() => buildGridPreset(2, 2, ['a', 'b', 'c'])).toThrow();
  });
});
