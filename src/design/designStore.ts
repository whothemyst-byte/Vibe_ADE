/** External store fed by Excalidraw's onChange. Panels subscribe to derived
 *  slices (via useDesignSelector) so a 60fps drag re-renders only components
 *  whose slice actually changed. Pure — no React/Excalidraw imports. */
import { type El } from "./commitCore";
import { sharedOuterGroup } from "./groups";
import { buildLayerTree, type LayerEl, type LayerNode } from "./layerTree";

export type StoreElement = El & {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  groupIds?: readonly string[];
};

export type DesignSnapshot = {
  elements: readonly StoreElement[];
  selectedIds: Readonly<Record<string, boolean>>;
  zoom: number;
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  activeType: string;
  snapOn: boolean;
};

export const EMPTY_SNAPSHOT: DesignSnapshot = {
  elements: [], selectedIds: {}, zoom: 1,
  scrollX: 0, scrollY: 0, width: 0, height: 0, activeType: "selection",
  snapOn: true,
};

export type DesignStore = {
  get(): DesignSnapshot;
  set(next: DesignSnapshot): void;
  subscribe(fn: () => void): () => void;
};

export function createDesignStore(): DesignStore {
  let snap = EMPTY_SNAPSHOT;
  const subs = new Set<() => void>();
  return {
    get: () => snap,
    set(next) {
      snap = next;
      subs.forEach((f) => f());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
  };
}

/* ── selectors ── */

export { layerTreeEqual } from "./layerTree";

/** Frames own what was drawn inside them, groups nest inside either. */
export function selectLayerTree(s: DesignSnapshot): LayerNode[] {
  return buildLayerTree(s.elements as unknown as readonly LayerEl[], s.selectedIds);
}

export type MultiValue<T> = T | "mixed";

export const LINEAR_TYPES: ReadonlySet<string> = new Set(["line", "arrow", "freedraw"]);

export type SelectionSel = {
  ids: string[];
  count: number;
  type: MultiValue<string>;
  x: MultiValue<number>; y: MultiValue<number>;
  width: MultiValue<number>; height: MultiValue<number>;
  angleDeg: MultiValue<number>;
  opacity: MultiValue<number>;
  strokeColor: MultiValue<string>;
  backgroundColor: MultiValue<string>;
  strokeWidth: MultiValue<number>;
  fontSize: MultiValue<number> | null;
  hasLinear: boolean;
  sharedGroup: string | null;
};

function uniform<T>(values: T[]): MultiValue<T> {
  return values.every((v) => v === values[0]) ? values[0] : "mixed";
}

export function selectSelection(s: DesignSnapshot): SelectionSel | null {
  const sel = s.elements.filter((e) => s.selectedIds[e.id] && e.isDeleted !== true);
  if (sel.length === 0) return null;
  const texts = sel.filter((e) => e.type === "text");
  const fontSizes = texts
    .map((e) => (typeof e.fontSize === "number" ? e.fontSize : null))
    .filter((v): v is number => v !== null);
  return {
    ids: sel.map((e) => e.id),
    count: sel.length,
    type: uniform(sel.map((e) => e.type)),
    x: uniform(sel.map((e) => Math.round(e.x))),
    y: uniform(sel.map((e) => Math.round(e.y))),
    width: uniform(sel.map((e) => Math.round(e.width))),
    height: uniform(sel.map((e) => Math.round(e.height))),
    angleDeg: uniform(sel.map((e) => Math.round((e.angle * 180) / Math.PI))),
    opacity: uniform(sel.map((e) => e.opacity)),
    strokeColor: uniform(sel.map((e) => e.strokeColor)),
    backgroundColor: uniform(sel.map((e) => e.backgroundColor)),
    strokeWidth: uniform(sel.map((e) => e.strokeWidth)),
    fontSize: fontSizes.length === 0 ? null : uniform(fontSizes),
    hasLinear: sel.some((e) => LINEAR_TYPES.has(e.type)),
    sharedGroup: sharedOuterGroup(sel, s.selectedIds),
  };
}

export function selectionEqual(a: SelectionSel | null, b: SelectionSel | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.ids.join(",") === b.ids.join(",") && a.count === b.count &&
    a.type === b.type && a.x === b.x && a.y === b.y &&
    a.width === b.width && a.height === b.height && a.angleDeg === b.angleDeg &&
    a.opacity === b.opacity && a.strokeColor === b.strokeColor &&
    a.backgroundColor === b.backgroundColor && a.strokeWidth === b.strokeWidth &&
    a.fontSize === b.fontSize && a.hasLinear === b.hasLinear &&
    a.sharedGroup === b.sharedGroup;
}

export const selectSnapOn = (s: DesignSnapshot): boolean => s.snapOn;

export const selectZoom = (s: DesignSnapshot): number => s.zoom;
export const selectActiveType = (s: DesignSnapshot): string => s.activeType;
