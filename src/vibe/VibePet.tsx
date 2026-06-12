import { memo, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampPosition, defaultVibePosition, loadVibePosition, saveVibePosition,
  VIBE_SIZE, type VibePosition,
} from "./vibeHelpers";
import "./VibePet.css";

export type VibeState = "idle" | "listening" | "thinking" | "speaking" | "error" | "sleeping";

const CLICK_THRESHOLD_PX = 4;

function readInitialPosition(): VibePosition {
  const w = window.innerWidth || 1280;
  const h = window.innerHeight || 800;
  const stored = loadVibePosition();
  return stored ? clampPosition(stored, w, h) : defaultVibePosition(w, h);
}

const positionTransform = (p: VibePosition) => `translate3d(${p.x}px, ${p.y}px, 0)`;

/* Mascot art ported verbatim from Vibe_ADE Vibe.tsx; the orb pulse is
   driven by the listening state instead of in-progress task count.
   Memoized so caption updates and drags never re-render the SVG tree. */
const VibeMascot = memo(function VibeMascot({ state, celebrating }: {
  state: VibeState;
  celebrating: boolean;
}) {
  const celebrateClass = celebrating ? "vibe-celebrate--active" : undefined;
  const hasOrbPulse = state === "listening";
  return (
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <g className="vibe-lean">
        <g className={celebrateClass} key={celebrating ? "celebrate" : "idle"}>
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
                <g className={hasOrbPulse ? "vibe-orb vibe-orb-pulse" : "vibe-orb"}>
                  <circle cx="50" cy="8" r="2.6" fill="currentColor" />
                  <circle cx="49.3" cy="7.3" r="0.7" fill="#fff" opacity="0.7" />
                </g>
                {celebrating && (
                  <>
                    <text className="vibe-sparkle vibe-sparkle--1" x="58" y="6"  fill="currentColor">*</text>
                    <text className="vibe-sparkle vibe-sparkle--2" x="44" y="2"  fill="currentColor">*</text>
                    <text className="vibe-sparkle vibe-sparkle--3" x="60" y="14" fill="currentColor">*</text>
                  </>
                )}
                {state === "sleeping" && (
                  <>
                    <text className="vibe-zzz vibe-zzz--1" x="56" y="16" fill="currentColor">z</text>
                    <text className="vibe-zzz vibe-zzz--2" x="62" y="10" fill="currentColor">Z</text>
                    <text className="vibe-zzz vibe-zzz--3" x="68" y="4"  fill="currentColor">z</text>
                  </>
                )}
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
              <g className={celebrating ? "vibe-blink vibe-eyes-happy" : "vibe-blink"}>
                <ellipse cx="33" cy="42" rx="3" ry="3.6" fill="#0e1116" />
                <ellipse cx="47" cy="42" rx="3" ry="3.6" fill="#0e1116" />
                <circle cx="34.1" cy="40.6" r="1" fill="#fff" />
                <circle cx="48.1" cy="40.6" r="1" fill="#fff" />
              </g>
              <ellipse cx="40" cy="51" rx="1.6" ry="2.1" fill="#0e1116" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
});

export function VibePet({ state, caption, celebrating, onActivate }: {
  state: VibeState;
  caption: string | null;
  celebrating: boolean;
  onActivate: () => void;
}) {
  // Position never goes through React state: dragging writes the wrapper's
  // transform directly (compositor-only, no re-render of the mascot per move),
  // mirroring how terminal windows are dragged on the wall.
  const wrapRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<VibePosition | null>(null);
  if (posRef.current === null) posRef.current = readInitialPosition();
  const drag = useRef<{ startX: number; startY: number; origin: VibePosition } | null>(null);
  const moved = useRef(false);

  const applyPosition = (next: VibePosition) => {
    posRef.current = next;
    const el = wrapRef.current;
    if (el) el.style.transform = positionTransform(next);
  };

  useEffect(() => {
    const onResize = (): void => {
      applyPosition(clampPosition(posRef.current!, window.innerWidth, window.innerHeight));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, origin: posRef.current! };
    moved.current = false;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) + Math.abs(dy) >= CLICK_THRESHOLD_PX) moved.current = true;
    applyPosition(clampPosition(
      { x: drag.current.origin.x + dx, y: drag.current.origin.y + dy },
      window.innerWidth, window.innerHeight,
    ));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (moved.current) saveVibePosition(posRef.current!);
    else onActivate(); // a click (not a drag) = push-to-talk
  };

  return (
    <div
      ref={wrapRef}
      className={`vibe-wrapper vibe-state--${state}`}
      style={{ transform: positionTransform(posRef.current), width: VIBE_SIZE, height: VIBE_SIZE }}
    >
      {caption && (
        <div className={`vibe-caption${state === "error" ? " vibe-caption--error" : ""}`}>
          {caption}
        </div>
      )}
      <div
        className="vibe-grip"
        role="img"
        aria-label="Vibe — your voice companion (click to talk, drag to move)"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <VibeMascot state={state} celebrating={celebrating} />
      </div>
    </div>
  );
}
