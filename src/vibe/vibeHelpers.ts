export interface VibePosition {
  x: number;
  y: number;
}

export const VIBE_SIZE = 80;
export const VIBE_MARGIN = 8;
export const VIBE_DEFAULT_GUTTER = 24;
export const VIBE_POSITION_STORAGE_KEY = "vibe-walls:vibe-position";

export function clampPosition(
  pos: VibePosition,
  viewportWidth: number,
  viewportHeight: number
): VibePosition {
  const maxX = Math.max(VIBE_MARGIN, viewportWidth - VIBE_SIZE - VIBE_MARGIN);
  const maxY = Math.max(VIBE_MARGIN, viewportHeight - VIBE_SIZE - VIBE_MARGIN);
  return {
    x: Math.min(Math.max(pos.x, VIBE_MARGIN), maxX),
    y: Math.min(Math.max(pos.y, VIBE_MARGIN), maxY),
  };
}

export function defaultVibePosition(
  viewportWidth: number,
  viewportHeight: number
): VibePosition {
  return {
    x: viewportWidth - VIBE_SIZE - VIBE_DEFAULT_GUTTER,
    y: viewportHeight - VIBE_SIZE - VIBE_DEFAULT_GUTTER,
  };
}

export function loadVibePosition(): VibePosition | null {
  try {
    const raw = window.localStorage.getItem(VIBE_POSITION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<VibePosition>;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) {
      return null;
    }
    return { x: parsed.x as number, y: parsed.y as number };
  } catch {
    return null;
  }
}

export function saveVibePosition(pos: VibePosition): void {
  window.localStorage.setItem(
    VIBE_POSITION_STORAGE_KEY,
    JSON.stringify({ x: pos.x, y: pos.y })
  );
}
