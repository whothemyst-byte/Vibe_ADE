import { useEffect, useMemo, useState } from 'react';
import type { PaneId, WorkspaceState } from '@shared/types';
import { collectPaneIds } from '@renderer/services/layoutEngine';
import { getPresetById, getPresetSlots } from '@renderer/services/layoutPresets';
import { useWorkspaceStore } from '@renderer/state/workspaceStore';
import { BrowserPane } from './BrowserPane';
import { TerminalPane } from './TerminalPane';

interface PaneLayoutProps {
  workspace: WorkspaceState;
  enableHorizontalScroll?: boolean;
}

interface PanePlacement {
  paneId: PaneId;
  columnStart: number;
  columnSpan: number;
  rowStart: number;
  rowSpan: number;
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

function distributeSpans(columns: number, count: number): number[] {
  const base = Math.floor(columns / count);
  const remainder = columns % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function buildPlacements(paneIds: PaneId[], presetId: string): PanePlacement[] {
  if (presetId === '3-pane-left-large' && paneIds.length === 3) {
    return getPresetSlots('3-pane-left-large').map((slot) => ({
      paneId: paneIds[slot.slotIndex],
      columnStart: slot.columnStart,
      columnSpan: slot.columnSpan,
      rowStart: slot.rowStart,
      rowSpan: slot.rowSpan
    }));
  }

  const preset = getPresetById(presetId as Parameters<typeof getPresetById>[0]);
  const placements: PanePlacement[] = [];
  let cursor = 0;

  for (let row = 1; row <= preset.rows && cursor < paneIds.length; row += 1) {
    const remaining = paneIds.length - cursor;
    const itemsInRow = row < preset.rows ? Math.min(preset.columns, remaining) : remaining;
    const spans = distributeSpans(preset.columns, itemsInRow);
    let columnStart = 1;

    for (let i = 0; i < itemsInRow; i += 1) {
      placements.push({
        paneId: paneIds[cursor],
        columnStart,
        columnSpan: spans[i],
        rowStart: row,
        rowSpan: 1
      });
      columnStart += spans[i];
      cursor += 1;
    }
  }

  return placements;
}

export function PaneLayout({ workspace, enableHorizontalScroll = false }: PaneLayoutProps): JSX.Element {
  const addPaneToLayout = useWorkspaceStore((s) => s.addPaneToLayout);
  const reorderPanes = useWorkspaceStore((s) => s.reorderPanes);
  const syncPaneOrder = useWorkspaceStore((s) => s.syncPaneOrder);
  const setActivePane = useWorkspaceStore((s) => s.setActivePane);
  const presetId = useWorkspaceStore((s) => s.ui.layoutPresetByWorkspace[workspace.id] ?? '1-pane');
  const paneOrder = useWorkspaceStore((s) => s.ui.paneOrderByWorkspace[workspace.id] ?? []);

  const [draggedPaneId, setDraggedPaneId] = useState<PaneId | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  const paneIds = useMemo(() => collectPaneIds(workspace.layout), [workspace.layout]);
  const preset = getPresetById(presetId as Parameters<typeof getPresetById>[0]);
  const placements = useMemo(
    () => buildPlacements(paneOrder.filter((paneId) => paneIds.includes(paneId)), presetId),
    [paneIds, paneOrder, presetId]
  );

  const [columnSizes, setColumnSizes] = useState<number[]>(() => evenSizes(preset.columns));
  const [rowSizes, setRowSizes] = useState<number[]>(() => evenSizes(preset.rows));
  const [dropTargetPaneId, setDropTargetPaneId] = useState<PaneId | null>(null);

  useEffect(() => {
    const nextOrder = paneOrder.filter((paneId) => paneIds.includes(paneId));
    const additions = paneIds.filter((paneId) => !nextOrder.includes(paneId));
    const syncedOrder = [...nextOrder, ...additions];
    if (syncedOrder.length === paneOrder.length && syncedOrder.every((paneId, index) => paneId === paneOrder[index])) {
      return;
    }
    syncPaneOrder(workspace.id, paneIds);
  }, [paneIds, paneOrder, syncPaneOrder, workspace.id]);

  useEffect(() => {
    setColumnSizes(evenSizes(preset.columns));
    setRowSizes(evenSizes(preset.rows));
  }, [preset.columns, preset.id, preset.rows]);

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const onMove = (event: MouseEvent): void => {
      if (resizeState.axis === 'column') {
        const deltaPercent = ((event.clientX - resizeState.startCoord) / (window.innerWidth || 1)) * 100;
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

      const deltaPercent = ((event.clientY - resizeState.startCoord) / (window.innerHeight || 1)) * 100;
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

  const paneIndexById = useMemo(() => {
    return new Map<PaneId, number>(paneOrder.map((paneId, index) => [paneId, index]));
  }, [paneOrder]);

  return (
    <div className="pane-layout-shell">
      <div
        className="pane-layout-grid"
        style={{
          minWidth: minGridWidth ? `${minGridWidth}px` : undefined,
          gridTemplateColumns: columnSizes.map((size) => `${size}fr`).join(' '),
          gridTemplateRows: rowSizes.map((size) => `${size}fr`).join(' ')
        }}
      >
        {placements.map((placement) => {
          const paneId = placement.paneId;
          return (
              <div
              key={`pane-${paneId}`}
              className={dropTargetPaneId === paneId ? 'pane-slot filled drop-target' : 'pane-slot filled'}
              style={{
                gridColumn: `${placement.columnStart} / span ${placement.columnSpan}`,
                gridRow: `${placement.rowStart} / span ${placement.rowSpan}`
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (draggedPaneId && draggedPaneId !== paneId) {
                  setDropTargetPaneId(paneId);
                }
              }}
              onDragLeave={() => {
                if (dropTargetPaneId === paneId) {
                  setDropTargetPaneId(null);
                }
              }}
              onDrop={() => {
                if (draggedPaneId && draggedPaneId !== paneId) {
                  reorderPanes(draggedPaneId, paneId);
                }
                setDraggedPaneId(null);
                setDropTargetPaneId(null);
              }}
              >
              {workspace.paneTypes[paneId] === 'browser' ? (
                <BrowserPane
                  paneId={paneId}
                  displayIndex={(paneIndexById.get(paneId) ?? 0) + 1}
                  workspace={workspace}
                  onFocus={() => void setActivePane(paneId)}
                  onPaneDragStart={() => setDraggedPaneId(paneId)}
                  onPaneDragEnd={() => {
                    setDraggedPaneId(null);
                    setDropTargetPaneId(null);
                  }}
                />
              ) : (
                <TerminalPane
                  paneId={paneId}
                  displayIndex={(paneIndexById.get(paneId) ?? 0) + 1}
                  workspace={workspace}
                  onFocus={() => void setActivePane(paneId)}
                  onPaneDragStart={() => setDraggedPaneId(paneId)}
                  onPaneDragEnd={() => {
                    setDraggedPaneId(null);
                    setDropTargetPaneId(null);
                  }}
                />
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
