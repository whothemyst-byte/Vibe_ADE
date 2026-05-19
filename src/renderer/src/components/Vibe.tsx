import { useEffect, useState } from 'react';
import { Rnd } from 'react-rnd';
import {
  loadUiPreferences,
  UI_PREFERENCES_CHANGED_EVENT
} from '@renderer/services/preferences';
import {
  clampPosition,
  defaultVibePosition,
  loadVibePosition,
  saveVibePosition,
  VIBE_SIZE,
  type VibePosition
} from './Vibe.helpers';
import './Vibe.css';

function readEnabled(): boolean {
  try {
    return loadUiPreferences().vibeEnabled;
  } catch {
    return true;
  }
}

function readInitialPosition(): VibePosition {
  const width = window.innerWidth || 1280;
  const height = window.innerHeight || 800;
  const stored = loadVibePosition();
  if (stored) {
    return clampPosition(stored, width, height);
  }
  return defaultVibePosition(width, height);
}

export function Vibe(): JSX.Element | null {
  const [enabled, setEnabled] = useState<boolean>(() => readEnabled());
  const [position, setPosition] = useState<VibePosition>(() => readInitialPosition());

  // Re-read enabled flag when settings change (same window or other window).
  useEffect(() => {
    const sync = (): void => setEnabled(readEnabled());
    window.addEventListener(UI_PREFERENCES_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(UI_PREFERENCES_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Re-clamp on viewport resize so the Vibe never floats off-screen.
  useEffect(() => {
    const onResize = (): void => {
      setPosition((current) =>
        clampPosition(current, window.innerWidth, window.innerHeight)
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!enabled) {
    return null;
  }

  return (
    <Rnd
      className="vibe-wrapper"
      style={{ position: 'fixed' }}
      bounds="window"
      enableResizing={false}
      size={{ width: VIBE_SIZE, height: VIBE_SIZE }}
      position={position}
      onDragStop={(_e, d) => {
        const next = clampPosition(
          { x: d.x, y: d.y },
          window.innerWidth,
          window.innerHeight
        );
        setPosition(next);
        saveVibePosition(next);
      }}
    >
      <div className="vibe-grip" aria-label="Vibe — your floating companion" role="img">
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <g className="vibe-breathe">
            <ellipse cx="40" cy="73" rx="20" ry="2.4" fill="#000" opacity="0.32" />
            <g className="vibe-float">
              <g className="vibe-sway">
                <path
                  d="M40 22 C 40 14, 46 12, 50 8"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  fill="none"
                />
                <circle cx="50" cy="8" r="2.6" fill="currentColor" />
                <circle cx="49.3" cy="7.3" r="0.7" fill="#fff" opacity="0.7" />
              </g>
              <path
                d="
                  M 40 22
                  C 56 22, 64 34, 64 50
                  L 64 60
                  C 64 60, 60 66, 56 60
                  C 52 54, 48 64, 44 60
                  C 40 56, 36 64, 32 60
                  C 28 56, 24 64, 20 60
                  C 16 56, 16 56, 16 50
                  C 16 34, 24 22, 40 22 Z"
                fill="currentColor"
              />
              <ellipse cx="29" cy="34" rx="6" ry="3" fill="#fff" opacity="0.3" />
              <path d="M16 46 q -5 4 -3 9 q 4 -1 5 -4" fill="currentColor" />
              <path d="M64 46 q 5 4 3 9 q -4 -1 -5 -4" fill="currentColor" />
              <ellipse cx="28" cy="46" rx="3" ry="1.6" fill="#0e1116" opacity="0.18" />
              <ellipse cx="52" cy="46" rx="3" ry="1.6" fill="#0e1116" opacity="0.18" />
              <g className="vibe-blink">
                <ellipse cx="33" cy="42" rx="3" ry="3.6" fill="#0e1116" />
                <ellipse cx="47" cy="42" rx="3" ry="3.6" fill="#0e1116" />
                <circle cx="34.1" cy="40.6" r="1" fill="#fff" />
                <circle cx="48.1" cy="40.6" r="1" fill="#fff" />
              </g>
              <ellipse cx="40" cy="51" rx="1.6" ry="2.1" fill="#0e1116" />
            </g>
          </g>
        </svg>
      </div>
    </Rnd>
  );
}
