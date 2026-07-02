/** Group/ungroup as element patches. Pure — no framework imports.
 *  Excalidraw convention: groupIds is ordered innermost -> outermost. */

export type GroupEl = { id: string; groupIds?: readonly string[] } & Record<string, unknown>;

export function newGroupId(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function groupPatches(
  els: readonly GroupEl[],
  selectedIds: Readonly<Record<string, boolean>>,
  gid: string = newGroupId(),
): { patches: Record<string, { groupIds: string[] }>; groupId: string } | null {
  const selected = els.filter((e) => selectedIds[e.id]);
  if (selected.length < 2) return null;
  const patches: Record<string, { groupIds: string[] }> = {};
  for (const e of selected) {
    patches[e.id] = { groupIds: [...(e.groupIds ?? []), gid] };
  }
  return { patches, groupId: gid };
}

export function sharedOuterGroup(
  els: readonly GroupEl[],
  selectedIds: Readonly<Record<string, boolean>>,
): string | null {
  const selected = els.filter((e) => selectedIds[e.id]);
  if (selected.length === 0) return null;
  let shared: string | null = null;
  for (const e of selected) {
    const outer = e.groupIds?.length ? e.groupIds[e.groupIds.length - 1] : null;
    if (outer === null) return null;
    if (shared === null) shared = outer;
    else if (shared !== outer) return null;
  }
  return shared;
}

export function ungroupPatches(
  els: readonly GroupEl[],
  selectedIds: Readonly<Record<string, boolean>>,
): Record<string, { groupIds: string[] }> | null {
  const gid = sharedOuterGroup(els, selectedIds);
  if (gid === null) return null;
  const patches: Record<string, { groupIds: string[] }> = {};
  for (const e of els) {
    if (!selectedIds[e.id]) continue;
    patches[e.id] = { groupIds: (e.groupIds ?? []).filter((g) => g !== gid) };
  }
  return patches;
}
