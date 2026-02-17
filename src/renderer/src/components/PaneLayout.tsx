import { useEffect, useMemo, useRef, useState } from 'react';
import type { PaneId, WorkspaceState } from '@shared/types';
import { collectPaneIds } from '@renderer/services/layoutEngine';
import { getPresetById, getPresetSlots } from '@renderer/services/layoutPresets';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { TerminalPane } from './TerminalPane';

interface PaneLayoutProps {
  workspace: WorkspaceState;
  enableHorizontalScroll?: boolean;
}

interface ResizeState {
  axis: 'column' | 'row';
  index: number;
  startCoord: number;
  snapshot: number[];
}

function evenSizes(count: number): number[] {
  return Array.from({ length: count }, () => 100 / count);
}

function clampSize(value: number, min = 8): number {
  return Math.max(min, Math.min(100 - min, value));
}

export function PaneLayout({ workspace, enableHorizontalScroll = false }: PaneLayoutProps): JSX.Element {
  const addPaneToLayout = useWorkspaceStore((s) => s.addPaneToLayout);
  const reorderPanes = useWorkspaceStore((s) => s.reorderPanes);
  const syncPaneOrder = useWorkspaceStore((s) => s.syncPaneOrder);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);
  const ui = useWorkspaceStore((s) => s.ui);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [draggedPaneId, setDraggedPaneId] = useState<PaneId | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  const paneIds = useMemo(() => collectPaneIds(workspace.layout), [workspace.layout]);
  const presetId = ui.layoutPresetByWorkspace[workspace.id] ?? '1-pane';
  const preset = getPresetById(presetId);
  const slots = getPresetSlots(presetId);
  const paneOrder = ui.paneOrderByWorkspace[workspace.id] ?? paneIds;

  const [columnSizes, setColumnSizes] = useState<number[]>(() => evenSizes(preset.columns));
  const [rowSizes, setRowSizes] = useState<number[]>(() => evenSizes(preset.rows));

  useEffect(() => {
    syncPaneOrder(workspace.id, paneIds);
  }, [paneIds, syncPaneOrder, workspace.id]);

  useEffect(() => {
    setColumnSizes(evenSizes(preset.columns));
    setRowSizes(evenSizes(preset.rows));
  }, [preset.columns, preset.id, preset.rows]);

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const onMove = (event: MouseEvent): void => {
      const host = containerRef.current;
      if (!host) {
        return;
      }

      if (resizeState.axis === 'column') {
        const total = host.clientWidth;
        if (total <= 0) {
          return;
        }
        const deltaPercent = ((event.clientX - resizeState.startCoord) / total) * 100;
        const next = [...resizeState.snapshot];
        const left = clampSize(resizeState.snapshot[resizeState.index] + deltaPercent);
        const right = clampSize(resizeState.snapshot[resizeState.index + 1] - deltaPercent);
        const combined = resizeState.snapshot[resizeState.index] + resizeState.snapshot[resizeState.index + 1];
        const normalizedLeft = (left / (left + right)) * combined;
        next[resizeState.index] = normalizedLeft;
        next[resizeState.index + 1] = combined - normalizedLeft;
        setColumnSizes(next);
        return;
      }

      const total = host.clientHeight;
      if (total <= 0) {
        return;
      }
      const deltaPercent = ((event.clientY - resizeState.startCoord) / total) * 100;
      const next = [...resizeState.snapshot];
      const top = clampSize(resizeState.snapshot[resizeState.index] + deltaPercent);
      const bottom = clampSize(resizeState.snapshot[resizeState.index + 1] - deltaPercent);
      const combined = resizeState.snapshot[resizeState.index] + resizeState.snapshot[resizeState.index + 1];
      const normalizedTop = (top / (top + bottom)) * combined;
      next[resizeState.index] = normalizedTop;
      next[resizeState.index + 1] = combined - normalizedTop;
      setRowSizes(next);
    };

    const onUp = (): void => setResizeState(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizeState]);

  const visiblePaneIds = useMemo(() => {
    const nextOrder = paneOrder.filter((paneId) => paneIds.includes(paneId));
    return nextOrder.slice(0, preset.slots);
  }, [paneIds, paneOrder, preset.slots]);

  const columnStops = useMemo(() => {
    const stops: number[] = [];
    let current = 0;
    for (let i = 0; i < columnSizes.length - 1; i += 1) {
      current += columnSizes[i];
      stops.push(current);
    }
    return stops;
  }, [columnSizes]);

  const rowStops = useMemo(() => {
    const stops: number[] = [];
    let current = 0;
    for (let i = 0; i < rowSizes.length - 1; i += 1) {
      current += rowSizes[i];
      stops.push(current);
    }
    return stops;
  }, [rowSizes]);

  const forceWideLayout = enableHorizontalScroll && paneIds.length >= 8;
  const minGridWidth = forceWideLayout ? Math.max(1200, preset.columns * 320) : undefined;

  return (
    <div className="pane-layout-shell" ref={containerRef}>
      <div
        className="pane-layout-grid"
        style={{
          minWidth: minGridWidth ? `${minGridWidth}px` : undefined,
          gridTemplateColumns: columnSizes.map((size) => `${size}fr`).join(' '),
          gridTemplateRows: rowSizes.map((size) => `${size}fr`).join(' ')
        }}
      >
        {slots.map((slot) => {
          const paneId = visiblePaneIds[slot.slotIndex];
          return (
            <div
              key={`slot-${slot.slotIndex}`}
              className={paneId ? 'pane-slot filled' : 'pane-slot empty'}
              style={{
                gridColumn: `${slot.columnStart} / span ${slot.columnSpan}`,
                gridRow: `${slot.rowStart} / span ${slot.rowSpan}`
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedPaneId && paneId && draggedPaneId !== paneId) {
                  reorderPanes(draggedPaneId, paneId);
                }
                setDraggedPaneId(null);
              }}
            >
              {paneId ? (
                <TerminalPane
                  paneId={paneId}
                  displayIndex={slot.slotIndex + 1}
                  workspace={workspace}
                  onFocus={() => void setActivePane(paneId)}
                  onPaneDragStart={() => setDraggedPaneId(paneId)}
                  onPaneDragEnd={() => setDraggedPaneId(null)}
                />
              ) : (
                <button className="empty-slot-button" title="Add Terminal" aria-label="Add Terminal" onClick={() => void addPaneToLayout()}>
                  {'\u2795'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {columnStops.map((stop, index) => (
        <div
          key={`col-stop-${index}`}
          className="grid-resize-handle vertical"
          style={{ left: `${stop}%` }}
          onMouseDown={(event) =>
            setResizeState({
              axis: 'column',
              index,
              startCoord: event.clientX,
              snapshot: columnSizes
            })
          }
        />
      ))}

      {rowStops.map((stop, index) => (
        <div
          key={`row-stop-${index}`}
          className="grid-resize-handle horizontal"
          style={{ top: `${stop}%` }}
          onMouseDown={(event) =>
            setResizeState({
              axis: 'row',
              index,
              startCoord: event.clientY,
              snapshot: rowSizes
            })
          }
        />
      ))}
    </div>
  );
}
