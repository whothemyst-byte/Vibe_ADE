import { useRef, useState, type WheelEvent, type MouseEvent } from 'react';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { CanvasCard } from './CanvasCard';

const DEFAULT_TRANSFORM = { x: 0, y: 0, scale: 1 };

const BACKGROUND_STYLES = `
  .canvas-bg-dots {
    background-color: var(--bg-sunken, #0f1115);
    background-image: radial-gradient(circle, color-mix(in srgb, var(--text-muted) 35%, transparent) 1px, transparent 1px);
    background-size: 16px 16px;
  }
  .canvas-bg-grid {
    background-color: var(--bg-sunken, #0f1115);
    background-image:
      linear-gradient(to right, color-mix(in srgb, var(--text-muted) 22%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in srgb, var(--text-muted) 22%, transparent) 1px, transparent 1px);
    background-size: 16px 16px;
  }
`;

export function CanvasLayout(): JSX.Element | null {
  const ws = useWorkspaceStore((s) => s.appState.workspaces.find((w) => w.id === s.appState.activeWorkspaceId));
  const setTransform = useWorkspaceStore((s) => s.setCanvasTransform);
  const setCard = useWorkspaceStore((s) => s.setCanvasCard);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);

  if (!ws) return null;
  const canvas = ws.canvas ?? { transform: DEFAULT_TRANSFORM, cards: {} };
  const { x, y, scale } = canvas.transform;
  const snapToGrid = canvas.snapToGrid ?? false;
  const background = canvas.background ?? 'blank';

  const onWheel = (e: WheelEvent): void => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const next = Math.min(2, Math.max(0.25, scale - e.deltaY * 0.001));
    setTransform(ws.id, { x, y, scale: next });
  };

  const onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 1 && !e.altKey) return;
    setPanning(true);
    dragRef.current = { x: e.clientX - x, y: e.clientY - y };
  };

  const onMouseMove = (e: MouseEvent): void => {
    if (!panning || !dragRef.current) return;
    setTransform(ws.id, { x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y, scale });
  };

  const onMouseUp = (): void => {
    setPanning(false);
    dragRef.current = null;
  };

  const backgroundClass = background === 'dots'
    ? 'canvas-bg-dots'
    : background === 'grid'
      ? 'canvas-bg-grid'
      : '';

  return (
    <>
      <style>{BACKGROUND_STYLES}</style>
      <div
        className={`relative w-full h-full overflow-hidden bg-bg-sunken ${backgroundClass}`}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${x}px, ${y}px) scale(${scale})` }}
        >
          {Object.entries(canvas.cards).map(([paneId, rect]) => (
            <CanvasCard
              key={paneId}
              paneId={paneId}
              workspace={ws}
              rect={rect}
              snapToGrid={snapToGrid}
              onChange={(r) => setCard(ws.id, paneId, r)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
