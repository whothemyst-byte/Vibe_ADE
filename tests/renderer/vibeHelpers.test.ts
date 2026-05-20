import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VIBE_SIZE,
  VIBE_MARGIN,
  VIBE_DEFAULT_GUTTER,
  VIBE_POSITION_STORAGE_KEY,
  clampPosition,
  defaultVibePosition,
  loadVibePosition,
  saveVibePosition,
  computeDialogAnchor,
  computeDialogStyle,
  isClick,
  VIBE_DIALOG_MAX_HEIGHT,
  VIBE_DIALOG_WIDTH,
  VIBE_DIALOG_GAP,
  VIBE_DIALOG_SIDE_TAIL_INSET
} from '../../src/renderer/src/components/Vibe.helpers';

describe('Vibe helpers — clampPosition', () => {
  it('keeps an in-bounds position unchanged', () => {
    expect(clampPosition({ x: 200, y: 200 }, 1200, 800)).toEqual({ x: 200, y: 200 });
  });

  it('clamps negative coordinates back to the margin', () => {
    expect(clampPosition({ x: -50, y: -50 }, 1200, 800)).toEqual({
      x: VIBE_MARGIN,
      y: VIBE_MARGIN
    });
  });

  it('clamps coordinates that would put the Vibe past the right/bottom edge', () => {
    const result = clampPosition({ x: 10_000, y: 10_000 }, 1200, 800);
    expect(result).toEqual({
      x: 1200 - VIBE_SIZE - VIBE_MARGIN,
      y: 800 - VIBE_SIZE - VIBE_MARGIN
    });
  });

  it('returns the margin when the viewport is smaller than the Vibe', () => {
    expect(clampPosition({ x: 0, y: 0 }, 40, 40)).toEqual({
      x: VIBE_MARGIN,
      y: VIBE_MARGIN
    });
  });
});

describe('Vibe helpers — defaultVibePosition', () => {
  it('places the Vibe in the bottom-right with the default gutter', () => {
    expect(defaultVibePosition(1200, 800)).toEqual({
      x: 1200 - VIBE_SIZE - VIBE_DEFAULT_GUTTER,
      y: 800 - VIBE_SIZE - VIBE_DEFAULT_GUTTER
    });
  });
});

describe('Vibe helpers — loadVibePosition / saveVibePosition', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when no position is stored', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null } });
    expect(loadVibePosition()).toBeNull();
  });

  it('parses a valid stored position', () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => JSON.stringify({ x: 100, y: 200 }) }
    });
    expect(loadVibePosition()).toEqual({ x: 100, y: 200 });
  });

  it('returns null when the stored value is malformed JSON', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => '{not json' } });
    expect(loadVibePosition()).toBeNull();
  });

  it('returns null when the stored value is missing x or y', () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => JSON.stringify({ x: 100 }) }
    });
    expect(loadVibePosition()).toBeNull();
  });

  it('returns null when a stored coordinate is non-finite (Infinity / NaN)', () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => '{"x":1e999,"y":0}' }
    });
    expect(loadVibePosition()).toBeNull();
  });

  it('persists a position under the expected key', () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', { localStorage: { setItem } });
    saveVibePosition({ x: 42, y: 99 });
    expect(setItem).toHaveBeenCalledWith(
      VIBE_POSITION_STORAGE_KEY,
      JSON.stringify({ x: 42, y: 99 })
    );
  });
});

describe('Vibe helpers — computeDialogAnchor', () => {
  const VIEWPORT_W = 1200;
  const VIEWPORT_H = 800;
  const TOP_THRESHOLD = VIBE_DIALOG_MAX_HEIGHT + VIBE_DIALOG_GAP;
  const SIDE_THRESHOLD = VIBE_DIALOG_WIDTH + VIBE_DIALOG_GAP;

  it('prefers top when there is room above Boo', () => {
    const result = computeDialogAnchor(
      { x: VIEWPORT_W - VIBE_SIZE - VIBE_MARGIN, y: TOP_THRESHOLD },
      VIEWPORT_W,
      VIEWPORT_H
    );
    expect(result.side).toBe('top');
  });

  it('falls back to left when top is too tight but left has room', () => {
    const result = computeDialogAnchor(
      { x: SIDE_THRESHOLD, y: TOP_THRESHOLD - 1 },
      VIEWPORT_W,
      VIEWPORT_H
    );
    expect(result.side).toBe('left');
  });

  it('falls back to right when only the right side has room', () => {
    const result = computeDialogAnchor(
      { x: SIDE_THRESHOLD - 1, y: TOP_THRESHOLD - 1 },
      VIEWPORT_W,
      VIEWPORT_H
    );
    expect(result.side).toBe('right');
  });

  it('falls back to bottom when no other side has room', () => {
    // Tiny viewport: every side below its threshold.
    const result = computeDialogAnchor({ x: VIBE_MARGIN, y: VIBE_MARGIN }, 200, VIEWPORT_H);
    expect(result.side).toBe('bottom');
  });

  it('returns Boo center coordinates as the anchor point', () => {
    const result = computeDialogAnchor({ x: 100, y: 200 }, VIEWPORT_W, VIEWPORT_H);
    expect(result.x).toBe(100 + VIBE_SIZE / 2);
    expect(result.y).toBe(200 + VIBE_SIZE / 2);
  });
});

describe('Vibe helpers — computeDialogStyle', () => {
  const W = 1280;
  const H = 800;
  const GAP = VIBE_SIZE / 2 + VIBE_DIALOG_GAP;

  it('top: centers the dialog on Boo when there is room on both horizontal sides', () => {
    const result = computeDialogStyle('top', 640, 500, W, H);
    expect(result.left).toBe(640 - VIBE_DIALOG_WIDTH / 2);
    expect(result.bottom).toBe(H - 500 + GAP);
  });

  it('top: clamps the dialog to the right edge when Boo is near the right edge', () => {
    // Boo near the right edge would push the centered dialog past the viewport
    const result = computeDialogStyle('top', W - 40, 500, W, H);
    expect(result.left).toBe(W - VIBE_DIALOG_WIDTH - VIBE_MARGIN);
  });

  it('top: clamps the dialog to the left edge when Boo is near the left edge', () => {
    const result = computeDialogStyle('top', 24, 500, W, H);
    expect(result.left).toBe(VIBE_MARGIN);
  });

  it('bottom: clamps top so the dialog fits when Boo is near the bottom edge', () => {
    // Boo near the bottom would place the dialog below the viewport
    const result = computeDialogStyle('bottom', 640, H - 24, W, H);
    expect(result.top).toBe(H - VIBE_DIALOG_MAX_HEIGHT - VIBE_MARGIN);
  });

  it('left: clamps top when Boo is near the top edge', () => {
    const result = computeDialogStyle('left', 1100, 24, W, H);
    expect(result.top).toBe(VIBE_MARGIN);
  });

  it('right: anchors the dialog beside Boo when there is room', () => {
    const result = computeDialogStyle('right', 24, 400, W, H);
    expect(result.left).toBe(24 + GAP);
    expect(result.top).toBe(400 - VIBE_DIALOG_SIDE_TAIL_INSET);
  });
});

describe('Vibe helpers — isClick', () => {
  it('returns true when start and end are identical', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(true);
  });

  it('returns true when Manhattan distance is below the default threshold', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 12, y: 11 })).toBe(true);
  });

  it('returns false when Manhattan distance equals the default threshold', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe(false);
  });

  it('returns false when Manhattan distance exceeds the default threshold', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 100, y: 100 })).toBe(false);
  });

  it('honors a custom threshold', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 18, y: 10 }, 10)).toBe(true);
  });
});
