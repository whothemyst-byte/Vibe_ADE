import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VIBE_SIZE,
  VIBE_MARGIN,
  VIBE_DEFAULT_GUTTER,
  VIBE_POSITION_STORAGE_KEY,
  clampPosition,
  defaultVibePosition,
  loadVibePosition,
  saveVibePosition
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
