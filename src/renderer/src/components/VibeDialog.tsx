import type { CSSProperties } from 'react';
import type { TaskItem, TaskId } from '@shared/types';
import {
  VIBE_DIALOG_GAP,
  VIBE_DIALOG_WIDTH,
  VIBE_SIZE,
  type DialogSide
} from './Vibe.helpers';
import type { DialogState } from './Vibe.captions';

export interface VibeDialogProps {
  anchorX: number;
  anchorY: number;
  side: DialogSide;
  state: DialogState;
  caption: string;
  tasks: TaskItem[];
  onDone: (taskId: TaskId) => void;
  onBacklog: (taskId: TaskId) => void;
  onOpenBoard: () => void;
  onClose: () => void;
}

function dialogStyle(side: DialogSide, anchorX: number, anchorY: number): CSSProperties {
  const half = VIBE_DIALOG_WIDTH / 2;
  const gap = VIBE_SIZE / 2 + VIBE_DIALOG_GAP;
  switch (side) {
    case 'top':
      return { left: anchorX - half, bottom: window.innerHeight - anchorY + gap };
    case 'bottom':
      return { left: anchorX - half, top: anchorY + gap };
    case 'left':
      return { right: window.innerWidth - anchorX + gap, top: anchorY - 80 };
    case 'right':
      return { left: anchorX + gap, top: anchorY - 80 };
  }
}

export function VibeDialog(props: VibeDialogProps): JSX.Element {
  const { side, anchorX, anchorY, state, caption, tasks, onDone, onBacklog, onOpenBoard } = props;
  return (
    <div
      className={`vibe-dialog vibe-dialog--${side}`}
      data-vibe-dialog
      style={dialogStyle(side, anchorX, anchorY)}
      role="dialog"
      aria-label="Vibe — in-progress tasks"
    >
      <div className="vibe-dialog__tail" aria-hidden="true" />
      <p className="vibe-dialog__caption" aria-live="polite">
        {caption}
      </p>
      {state === 'has-tasks' && (
        <ul className="vibe-dialog__list">
          {tasks.map((task) => (
            <li key={task.id} className="vibe-dialog__row">
              {task.priority && (
                <span
                  className={`vibe-dialog__dot vibe-dialog__dot--${task.priority}`}
                  aria-hidden="true"
                />
              )}
              <span className="vibe-dialog__title" title={task.title}>
                {task.title}
              </span>
              <button
                type="button"
                className="vibe-dialog__btn vibe-dialog__btn--done"
                onClick={() => onDone(task.id)}
                aria-label={`Mark "${task.title}" done`}
              >
                ✓
              </button>
              <button
                type="button"
                className="vibe-dialog__btn vibe-dialog__btn--backlog"
                onClick={() => onBacklog(task.id)}
                aria-label={`Move "${task.title}" to backlog`}
              >
                ↩
              </button>
            </li>
          ))}
        </ul>
      )}
      {state === 'empty' && (
        <button
          type="button"
          className="vibe-dialog__board-btn"
          onClick={onOpenBoard}
        >
          Open task board
        </button>
      )}
    </div>
  );
}
