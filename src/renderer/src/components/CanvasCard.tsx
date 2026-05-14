import { Rnd } from 'react-rnd';
import type { PaneId, WorkspaceState } from '@shared/types';
import { TerminalPane } from './TerminalPane';

interface Props {
  paneId: PaneId;
  workspace: WorkspaceState;
  rect: { x: number; y: number; w: number; h: number };
  onChange: (rect: { x: number; y: number; w: number; h: number }) => void;
}

const noop = (): void => {};

export function CanvasCard({ paneId, workspace, rect, onChange }: Props): JSX.Element {
  return (
    <Rnd
      bounds="parent"
      size={{ width: rect.w, height: rect.h }}
      position={{ x: rect.x, y: rect.y }}
      onDragStop={(_e, d) => onChange({ ...rect, x: d.x, y: d.y })}
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        onChange({ x: pos.x, y: pos.y, w: ref.offsetWidth, h: ref.offsetHeight })
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
