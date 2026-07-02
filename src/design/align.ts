/** Align / distribute geometry. Pure — no framework imports. Elements
 *  sharing an outermost group form one unit that moves as a whole. */

export type AlignEl = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  groupIds?: readonly string[];
} & Record<string, unknown>;

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** Axis-aligned bounding box, accounting for rotation about the center. */
export function bboxOf(el: AlignEl): Box {
  const a = el.angle ?? 0;
  if (a === 0) {
    return { minX: el.x, minY: el.y, maxX: el.x + el.width, maxY: el.y + el.height };
  }
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const cos = Math.cos(a), sin = Math.sin(a);
  const hw = el.width / 2, hh = el.height / 2;
  const ex = Math.abs(hw * cos) + Math.abs(hh * sin);
  const ey = Math.abs(hw * sin) + Math.abs(hh * cos);
  return { minX: cx - ex, minY: cy - ey, maxX: cx + ex, maxY: cy + ey };
}

type Unit = { ids: string[]; box: Box };

const mergeBox = (a: Box, b: Box): Box => ({
  minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
});

function buildUnits(
  els: readonly AlignEl[],
  selectedIds: Readonly<Record<string, boolean>>,
): Unit[] {
  const byGroup = new Map<string, Unit>();
  const units: Unit[] = [];
  for (const el of els) {
    if (!selectedIds[el.id]) continue;
    const outer = el.groupIds?.length ? el.groupIds[el.groupIds.length - 1] : null;
    const box = bboxOf(el);
    if (outer === null) {
      units.push({ ids: [el.id], box });
    } else {
      const u = byGroup.get(outer);
      if (u) { u.ids.push(el.id); u.box = mergeBox(u.box, box); }
      else { const nu = { ids: [el.id], box }; byGroup.set(outer, nu); units.push(nu); }
    }
  }
  return units;
}

export type AlignMode = "left" | "center-h" | "right" | "top" | "center-v" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";
type Delta = { dx: number; dy: number };
type Patches = Record<string, { x?: number; y?: number }>;

function deltasToPatches(els: readonly AlignEl[], deltas: Map<Unit, Delta>): Patches {
  const byId = new Map<string, Delta>();
  for (const [unit, d] of deltas) {
    if (Math.abs(d.dx) < 1e-9 && Math.abs(d.dy) < 1e-9) continue;
    for (const id of unit.ids) byId.set(id, d);
  }
  const out: Patches = {};
  for (const el of els) {
    const d = byId.get(el.id);
    if (!d) continue;
    out[el.id] = {};
    if (Math.abs(d.dx) > 1e-9) out[el.id].x = el.x + d.dx;
    if (Math.abs(d.dy) > 1e-9) out[el.id].y = el.y + d.dy;
  }
  return out;
}

export function alignPatches(
  els: readonly AlignEl[],
  selectedIds: Readonly<Record<string, boolean>>,
  mode: AlignMode,
): Patches {
  const units = buildUnits(els, selectedIds);
  if (units.length < 2) return {};
  const combined = units.map((u) => u.box).reduce(mergeBox);
  const deltas = new Map<Unit, Delta>();
  for (const u of units) {
    let dx = 0, dy = 0;
    switch (mode) {
      case "left": dx = combined.minX - u.box.minX; break;
      case "right": dx = combined.maxX - u.box.maxX; break;
      case "center-h":
        dx = (combined.minX + combined.maxX) / 2 - (u.box.minX + u.box.maxX) / 2; break;
      case "top": dy = combined.minY - u.box.minY; break;
      case "bottom": dy = combined.maxY - u.box.maxY; break;
      case "center-v":
        dy = (combined.minY + combined.maxY) / 2 - (u.box.minY + u.box.maxY) / 2; break;
    }
    deltas.set(u, { dx, dy });
  }
  return deltasToPatches(els, deltas);
}

export function distributePatches(
  els: readonly AlignEl[],
  selectedIds: Readonly<Record<string, boolean>>,
  axis: DistributeAxis,
): Patches {
  const units = buildUnits(els, selectedIds);
  if (units.length < 3) return {};
  const lo = (b: Box) => (axis === "horizontal" ? b.minX : b.minY);
  const hi = (b: Box) => (axis === "horizontal" ? b.maxX : b.maxY);
  const sorted = [...units].sort((a, b) => lo(a.box) - lo(b.box));
  const span = hi(sorted[sorted.length - 1].box) - lo(sorted[0].box);
  const sizes = sorted.reduce((s, u) => s + (hi(u.box) - lo(u.box)), 0);
  const gap = (span - sizes) / (sorted.length - 1);
  const deltas = new Map<Unit, Delta>();
  let cursor = hi(sorted[0].box) + gap;
  for (let i = 1; i < sorted.length - 1; i++) {
    const u = sorted[i];
    const d = cursor - lo(u.box);
    deltas.set(u, axis === "horizontal" ? { dx: d, dy: 0 } : { dx: 0, dy: d });
    cursor += (hi(u.box) - lo(u.box)) + gap;
  }
  return deltasToPatches(els, deltas);
}
