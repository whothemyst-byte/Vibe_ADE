import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Rnd } from 'react-rnd';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import {
  loadUiPreferences,
  UI_PREFERENCES_CHANGED_EVENT,
  UI_PREFERENCES_KEY
} from '@renderer/services/preferences';
import {
  clampPosition,
  computeDialogAnchor,
  defaultVibePosition,
  isClick,
  loadVibePosition,
  saveVibePosition,
  VIBE_SIZE,
  type DialogAnchor,
  type VibePosition
} from './Vibe.helpers';
import { captionFor, type DialogState } from './Vibe.captions';
import { VibeDialog } from './VibeDialog';
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [anchor, setAnchor] = useState<DialogAnchor | null>(null);
  const [celebrateUntil, setCelebrateUntil] = useState<number | null>(null);
  const grabStartRef = useRef<{ x: number; y: number } | null>(null);

  const activeWorkspaceId = useWorkspaceStore((s) => s.appState.activeWorkspaceId);
  const tasks = useWorkspaceStore((s) =>
    s.appState.workspaces.find((w) => w.id === activeWorkspaceId)?.tasks ?? []
  );
  const moveTask = useWorkspaceStore((s) => s.moveTask);
  const toggleTaskBoard = useWorkspaceStore((s) => s.toggleTaskBoard);

  const inProgress = tasks.filter((t) => t.status === 'in-progress' && !t.archived);
  const dialogState: DialogState = !activeWorkspaceId
    ? 'no-workspace'
    : inProgress.length === 0
      ? 'empty'
      : 'has-tasks';
  const caption = captionFor(dialogState, inProgress.length);

  useEffect(() => {
    const sync = (): void => setEnabled(readEnabled());
    const onStorage = (event: StorageEvent): void => {
      if (event.key === UI_PREFERENCES_KEY) {
        sync();
      }
    };
    window.addEventListener(UI_PREFERENCES_CHANGED_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(UI_PREFERENCES_CHANGED_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const onResize = (): void => {
      setPosition((current) =>
        clampPosition(current, window.innerWidth, window.innerHeight)
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (celebrateUntil === null) {
      return;
    }
    const remaining = celebrateUntil - Date.now();
    if (remaining <= 0) {
      setCelebrateUntil(null);
      return;
    }
    const timeout = window.setTimeout(() => setCelebrateUntil(null), remaining);
    return () => window.clearTimeout(timeout);
  }, [celebrateUntil]);

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setDialogOpen(false);
      }
    };
    const onMouseDown = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (target.closest('[data-vibe-dialog]') || target.closest('.vibe-wrapper')) {
        return;
      }
      setDialogOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [dialogOpen]);

  const openDialog = (): void => {
    setAnchor(computeDialogAnchor(position, window.innerWidth, window.innerHeight));
    setDialogOpen(true);
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>): void => {
    grabStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleMouseUp = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const start = grabStartRef.current;
    grabStartRef.current = null;
    if (!start) {
      return;
    }
    if (isClick(start, { x: event.clientX, y: event.clientY })) {
      if (dialogOpen) {
        setDialogOpen(false);
      } else {
        openDialog();
      }
    }
  };

  const handleDone = (taskId: string): void => {
    const wasLast = inProgress.length === 1;
    void moveTask(taskId, 'done');
    setCelebrateUntil(Date.now() + 1200);
    if (wasLast) {
      window.setTimeout(() => setDialogOpen(false), 250);
    }
  };

  const handleBacklog = (taskId: string): void => {
    const wasLast = inProgress.length === 1;
    void moveTask(taskId, 'backlog');
    if (wasLast) {
      window.setTimeout(() => setDialogOpen(false), 250);
    }
  };

  const handleOpenBoard = (): void => {
    toggleTaskBoard(true);
    setDialogOpen(false);
  };

  const celebrating = celebrateUntil !== null && celebrateUntil > Date.now();
  const leanClass = dialogOpen && anchor
    ? `vibe-lean vibe-lean--${anchor.side}`
    : 'vibe-lean';
  const celebrateClass = celebrating
    ? 'vibe-celebrate vibe-celebrate--active'
    : 'vibe-celebrate';
  const hasInProgress = inProgress.length > 0;

  if (!enabled) {
    return null;
  }

  return (
    <>
      <Rnd
        className="vibe-wrapper"
        style={{ position: 'fixed' }}
        bounds="window"
        enableResizing={false}
        size={{ width: VIBE_SIZE, height: VIBE_SIZE }}
        position={position}
        onDragStart={() => {
          grabStartRef.current = null;
          if (dialogOpen) {
            setDialogOpen(false);
          }
        }}
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
        <div
          className="vibe-grip"
          aria-label="Vibe — your floating companion"
          role="img"
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
        >
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <g className={leanClass}>
              <g className={celebrateClass} key={celebrating ? celebrateUntil : 'idle'}>
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
                      <g className={hasInProgress ? 'vibe-orb-pulse' : undefined}>
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
                    <g className={celebrating ? 'vibe-blink vibe-eyes-happy' : 'vibe-blink'}>
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
        </div>
      </Rnd>
      {dialogOpen && anchor && (
        <VibeDialog
          anchorX={anchor.x}
          anchorY={anchor.y}
          side={anchor.side}
          state={dialogState}
          caption={caption}
          tasks={inProgress}
          onDone={handleDone}
          onBacklog={handleBacklog}
          onOpenBoard={handleOpenBoard}
        />
      )}
    </>
  );
}
