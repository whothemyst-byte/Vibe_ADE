import { v4 as uuidv4 } from 'uuid';
import type { LayoutNode, PaneId, PaneType, WorkspaceState } from '@shared/types';
import { createBrowserPaneState } from '@shared/browserPane';

export function countPanes(layout: LayoutNode): number {
  if (layout.type === 'pane') {
    return 1;
  }
  return layout.children.reduce((sum, child) => sum + countPanes(child), 0);
}

export function collectPaneIds(layout: LayoutNode): PaneId[] {
  if (layout.type === 'pane') {
    return [layout.paneId];
  }
  return layout.children.flatMap(collectPaneIds);
}

function splitNode(node: LayoutNode, targetPaneId: PaneId, newPaneId: PaneId): LayoutNode {
  if (node.type === 'pane' && node.paneId === targetPaneId) {
    return {
      id: uuidv4(),
      type: 'split',
      direction: 'vertical',
      sizes: [50, 50],
      children: [
        node,
        {
          id: uuidv4(),
          type: 'pane',
          paneId: newPaneId
        }
      ]
    };
  }

  if (node.type === 'split') {
    return {
      ...node,
      children: node.children.map((child) => splitNode(child, targetPaneId, newPaneId))
    };
  }

  return node;
}

function appendPane(
  workspace: WorkspaceState,
  targetPaneId: PaneId = workspace.activePaneId,
  paneType: PaneType = 'terminal',
  browserUrl?: string
): WorkspaceState {
  const total = countPanes(workspace.layout);
  if (total >= 16) {
    return workspace;
  }

  const paneIds = collectPaneIds(workspace.layout);
  const basePaneId = paneIds.includes(targetPaneId) ? targetPaneId : workspace.activePaneId;
  const newPaneId = uuidv4();

  return {
    ...workspace,
    layout: splitNode(workspace.layout, basePaneId, newPaneId),
    activePaneId: newPaneId,
    paneTypes: {
      ...workspace.paneTypes,
      [newPaneId]: paneType
    },
    paneShells:
      paneType === 'terminal'
        ? {
            ...workspace.paneShells,
            [newPaneId]: workspace.paneShells[basePaneId] ?? 'powershell'
          }
        : { ...workspace.paneShells },
    browserPanes: {
      ...workspace.browserPanes,
      ...(paneType === 'browser' ? { [newPaneId]: createBrowserPaneState({ sourcePaneId: targetPaneId, url: browserUrl }) } : {})
    },
    commandBlocks: {
      ...workspace.commandBlocks,
      [newPaneId]: paneType === 'terminal' ? [] : workspace.commandBlocks[newPaneId] ?? []
    }
  };
}

export function appendPaneToWorkspace(workspace: WorkspaceState): WorkspaceState {
  return appendPane(workspace);
}

export function appendBrowserPaneToWorkspace(
  workspace: WorkspaceState,
  targetPaneId: PaneId = workspace.activePaneId,
  url = 'about:blank'
): WorkspaceState {
  const existingBrowserPane = Object.values(workspace.browserPanes).find((pane) => pane.sourcePaneId === targetPaneId);
  if (existingBrowserPane) {
    return workspace;
  }
  return appendPane(workspace, targetPaneId, 'browser', url);
}

function normalizeSizes(count: number, sizes?: number[]): number[] {
  if (!sizes || sizes.length !== count) {
    return Array.from({ length: count }, () => 100 / count);
  }
  const total = sizes.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) {
    return Array.from({ length: count }, () => 100 / count);
  }
  return sizes.map((value) => (Math.max(0, value) / total) * 100);
}

function removePaneNode(node: LayoutNode, targetPaneId: PaneId): LayoutNode | null {
  if (node.type === 'pane') {
    return node.paneId === targetPaneId ? null : node;
  }

  const nextChildren = node.children
    .map((child) => removePaneNode(child, targetPaneId))
    .filter((child): child is LayoutNode => child !== null);

  if (nextChildren.length === 0) {
    return null;
  }
  if (nextChildren.length === 1) {
    return nextChildren[0];
  }

  return {
    ...node,
    children: nextChildren,
    sizes: normalizeSizes(nextChildren.length, node.sizes)
  };
}

export function removePaneFromWorkspace(workspace: WorkspaceState, paneId: PaneId): WorkspaceState {
  const paneIds = collectPaneIds(workspace.layout);
  if (paneIds.length <= 1 || !paneIds.includes(paneId)) {
    return workspace;
  }

  const nextLayout = removePaneNode(workspace.layout, paneId);
  if (!nextLayout) {
    return workspace;
  }
  const remainingPaneIds = collectPaneIds(nextLayout);
  if (remainingPaneIds.length === 0) {
    return workspace;
  }

  const nextPaneTypes = { ...workspace.paneTypes };
  const nextPaneShells = { ...workspace.paneShells };
  const nextBrowserPanes = { ...workspace.browserPanes };
  const nextCommandBlocks = { ...workspace.commandBlocks };
  delete nextPaneTypes[paneId];
  delete nextPaneShells[paneId];
  delete nextBrowserPanes[paneId];
  delete nextCommandBlocks[paneId];

  return {
    ...workspace,
    layout: nextLayout,
    activePaneId: workspace.activePaneId === paneId ? remainingPaneIds[0] : workspace.activePaneId,
    paneTypes: nextPaneTypes,
    paneShells: nextPaneShells,
    browserPanes: nextBrowserPanes,
    commandBlocks: nextCommandBlocks,
    tasks: workspace.tasks.map((task) => (task.paneId === paneId ? { ...task, paneId: undefined } : task))
  };
}

export function syncPaneOrder(existingOrder: PaneId[], paneIds: PaneId[]): PaneId[] {
  const alive = existingOrder.filter((paneId) => paneIds.includes(paneId));
  const additions = paneIds.filter((paneId) => !alive.includes(paneId));
  return [...alive, ...additions];
}

export function movePaneInOrder(order: PaneId[], sourcePaneId: PaneId, targetPaneId: PaneId): PaneId[] {
  if (sourcePaneId === targetPaneId) {
    return order;
  }

  const sourceIndex = order.indexOf(sourcePaneId);
  const targetIndex = order.indexOf(targetPaneId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return order;
  }

  const next = [...order];
  next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourcePaneId);
  return next;
}
