import { v4 as uuidv4 } from 'uuid';
import type { LayoutNode, PaneId, WorkspaceState } from '@shared/types';

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

export function appendPaneToWorkspace(workspace: WorkspaceState): WorkspaceState {
  const total = countPanes(workspace.layout);
  if (total >= 16) {
    return workspace;
  }

  const basePaneId = workspace.activePaneId;
  const newPaneId = uuidv4();

  return {
    ...workspace,
    layout: splitNode(workspace.layout, basePaneId, newPaneId),
    activePaneId: newPaneId,
    paneShells: {
      ...workspace.paneShells,
      [newPaneId]: workspace.paneShells[basePaneId] ?? 'cmd'
    },
    commandBlocks: {
      ...workspace.commandBlocks,
      [newPaneId]: []
    },
    paneAgents: {
      ...workspace.paneAgents,
      [newPaneId]: {
        paneId: newPaneId,
        attached: false,
        model: workspace.selectedModel,
        running: false
      }
    }
  };
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

  const nextPaneShells = { ...workspace.paneShells };
  const nextCommandBlocks = { ...workspace.commandBlocks };
  const nextPaneAgents = { ...workspace.paneAgents };
  delete nextPaneShells[paneId];
  delete nextCommandBlocks[paneId];
  delete nextPaneAgents[paneId];

  return {
    ...workspace,
    layout: nextLayout,
    activePaneId: workspace.activePaneId === paneId ? remainingPaneIds[0] : workspace.activePaneId,
    paneShells: nextPaneShells,
    commandBlocks: nextCommandBlocks,
    paneAgents: nextPaneAgents,
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
