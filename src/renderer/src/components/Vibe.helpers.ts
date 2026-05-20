export interface VibePosition {
  x: number;
  y: number;
}

export const VIBE_SIZE = 80;
export const VIBE_MARGIN = 8;
export const VIBE_DEFAULT_GUTTER = 24;
export const VIBE_POSITION_STORAGE_KEY = 'vibe-ade:vibe-position';

export function clampPosition(
  pos: VibePosition,
  viewportWidth: number,
  viewportHeight: number
): VibePosition {
  const maxX = Math.max(VIBE_MARGIN, viewportWidth - VIBE_SIZE - VIBE_MARGIN);
  const maxY = Math.max(VIBE_MARGIN, viewportHeight - VIBE_SIZE - VIBE_MARGIN);
  return {
    x: Math.min(Math.max(pos.x, VIBE_MARGIN), maxX),
    y: Math.min(Math.max(pos.y, VIBE_MARGIN), maxY)
  };
}

export function defaultVibePosition(
  viewportWidth: number,
  viewportHeight: number
): VibePosition {
  return {
    x: viewportWidth - VIBE_SIZE - VIBE_DEFAULT_GUTTER,
    y: viewportHeight - VIBE_SIZE - VIBE_DEFAULT_GUTTER
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

export const VIBE_DIALOG_WIDTH = 280;
export const VIBE_DIALOG_MAX_HEIGHT = 360;
export const VIBE_DIALOG_GAP = 12;

export type DialogSide = 'top' | 'bottom' | 'left' | 'right';

export interface DialogAnchor {
  side: DialogSide;
  x: number;
  y: number;
}

export function computeDialogAnchor(
  vibePosition: VibePosition,
  viewportWidth: number,
  viewportHeight: number
): DialogAnchor {
  const x = vibePosition.x + VIBE_SIZE / 2;
  const y = vibePosition.y + VIBE_SIZE / 2;
  const spaceTop = vibePosition.y;
  const spaceLeft = vibePosition.x;
  const spaceRight = viewportWidth - (vibePosition.x + VIBE_SIZE);
  let side: DialogSide;
  if (spaceTop >= VIBE_DIALOG_MAX_HEIGHT + VIBE_DIALOG_GAP) {
    side = 'top';
  } else if (spaceLeft >= VIBE_DIALOG_WIDTH + VIBE_DIALOG_GAP) {
    side = 'left';
  } else if (spaceRight >= VIBE_DIALOG_WIDTH + VIBE_DIALOG_GAP) {
    side = 'right';
  } else {
    side = 'bottom';
  }
  void viewportHeight; // bottom fallback doesn't need it; keeps signature symmetric with clampPosition
  return { side, x, y };
}

export function isClick(
  start: { x: number; y: number },
  end: { x: number; y: number },
  threshold = 4
): boolean {
  return Math.abs(end.x - start.x) + Math.abs(end.y - start.y) < threshold;
}

// Default distance (px) from the side-anchored dialog's top edge to the tail
// when no anchorY-derived offset applies. The CSS fallback in
// .vibe-dialog--{left,right} .vibe-dialog__tail uses the same value.
export const VIBE_DIALOG_SIDE_TAIL_INSET = 80;

// Tail dimensions and the minimum distance the tail center keeps from the
// dialog's rounded corners, so it never visually clips through them.
export const VIBE_DIALOG_TAIL_SIZE = 12;
export const VIBE_DIALOG_TAIL_MIN = 16;

export interface DialogStyle {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  // Offset (px) from the dialog's left edge to the tail's left edge.
  // Set for top/bottom sides. Undefined otherwise.
  tailX?: number;
  // Offset (px) from the dialog's top edge to the tail's top edge.
  // Set for left/right sides. Undefined otherwise.
  tailY?: number;
}

// Pure positioning math. Returns the CSS offsets for the dialog given Boo's
// chosen side, Boo's center, and the current viewport. Clamps so the dialog
// stays fully inside the viewport (minus VIBE_MARGIN on every edge), and
// computes the tail offset so it points at Boo even when the dialog is
// clamped against an edge.
export function computeDialogStyle(
  side: DialogSide,
  anchorX: number,
  anchorY: number,
  viewportWidth: number,
  viewportHeight: number
): DialogStyle {
  const half = VIBE_DIALOG_WIDTH / 2;
  const gap = VIBE_SIZE / 2 + VIBE_DIALOG_GAP;
  const tailHalf = VIBE_DIALOG_TAIL_SIZE / 2;
  const tailMaxX = VIBE_DIALOG_WIDTH - VIBE_DIALOG_TAIL_MIN - VIBE_DIALOG_TAIL_SIZE;
  const tailMaxY = VIBE_DIALOG_MAX_HEIGHT - VIBE_DIALOG_TAIL_MIN - VIBE_DIALOG_TAIL_SIZE;

  const clampLeft = (left: number): number =>
    Math.max(VIBE_MARGIN, Math.min(left, viewportWidth - VIBE_DIALOG_WIDTH - VIBE_MARGIN));
  const clampTop = (top: number): number =>
    Math.max(VIBE_MARGIN, Math.min(top, viewportHeight - VIBE_DIALOG_MAX_HEIGHT - VIBE_MARGIN));
  const clampTailX = (raw: number): number =>
    Math.max(VIBE_DIALOG_TAIL_MIN, Math.min(raw, tailMaxX));
  const clampTailY = (raw: number): number =>
    Math.max(VIBE_DIALOG_TAIL_MIN, Math.min(raw, tailMaxY));

  switch (side) {
    case 'top': {
      const left = clampLeft(anchorX - half);
      return {
        left,
        bottom: viewportHeight - anchorY + gap,
        tailX: clampTailX(anchorX - left - tailHalf)
      };
    }
    case 'bottom': {
      const left = clampLeft(anchorX - half);
      return {
        left,
        top: clampTop(anchorY + gap),
        tailX: clampTailX(anchorX - left - tailHalf)
      };
    }
    case 'left': {
      const top = clampTop(anchorY - VIBE_DIALOG_SIDE_TAIL_INSET);
      return {
        right: viewportWidth - anchorX + gap,
        top,
        tailY: clampTailY(anchorY - top - tailHalf)
      };
    }
    case 'right': {
      const top = clampTop(anchorY - VIBE_DIALOG_SIDE_TAIL_INSET);
      return {
        left: anchorX + gap,
        top,
        tailY: clampTailY(anchorY - top - tailHalf)
      };
    }
  }
}
