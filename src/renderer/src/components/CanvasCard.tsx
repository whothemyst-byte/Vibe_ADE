import { Rnd } from 'react-rnd';
import type { PaneId, WorkspaceState } from '@shared/types';
import { TerminalPane } from './TerminalPane';

interface Props {
  paneId: PaneId;
  workspace: WorkspaceState;
  rect: { x: number; y: number; w: number; h: number };
  snapToGrid?: boolean;
  onChange: (rect: { x: number; y: number; w: number; h: number }) => void;
}

const GRID = 16;
const snap = (n: number): number => Math.round(n / GRID) * GRID;

const noop = (): void => {};

export function CanvasCard({ paneId, workspace, rect, snapToGrid, onChange }: Props): JSX.Element {
  const apply = (next: { x: number; y: number; w: number; h: number }): void => {
    if (snapToGrid) {
      onChange({ x: snap(next.x), y: snap(next.y), w: snap(next.w), h: snap(next.h) });
    } else {
      onChange(next);
    }
  };

  return (
    <Rnd
      bounds="parent"
      size={{ width: rect.w, height: rect.h }}
      position={{ x: rect.x, y: rect.y }}
      onDragStop={(_e, d) => apply({ ...rect, x: d.x, y: d.y })}
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        apply({ x: pos.x, y: pos.y, w: ref.offsetWidth, h: ref.offsetHeight })
      }
      minWidth={320}
      minHeight={200}
      className="bg-bg-elev border border-line rounded-md shadow-qs-lg overflow-hidden"
    >
      <TerminalPane
        paneId={paneId}
        workspace={workspace}
        onFocus={noop}
        onPaneDragStart={noop}
        onPaneDragEnd={noop}
      />
    </Rnd>
  );
}
