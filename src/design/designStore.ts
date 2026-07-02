/** External store fed by Excalidraw's onChange. Panels subscribe to derived
 *  slices (via useDesignSelector) so a 60fps drag re-renders only components
 *  whose slice actually changed. Pure — no React/Excalidraw imports. */
import { isHidden, type El } from "./commitCore";
import { labelForElement } from "./designUtils";
import { sharedOuterGroup } from "./groups";

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

export type LayerRow = {
  id: string; type: string; label: string;
  hidden: boolean; locked: boolean; selected: boolean;
};

export function selectLayers(s: DesignSnapshot): LayerRow[] {
  const rows: LayerRow[] = [];
  for (let i = s.elements.length - 1; i >= 0; i--) {
    const el = s.elements[i];
    if (el.isDeleted === true) continue;
    rows.push({
      id: el.id,
      type: el.type,
      label: labelForElement(el as { type: string; text?: string }),
      hidden: isHidden(el),
      locked: el.locked === true,
      selected: s.selectedIds[el.id] === true,
    });
  }
  return rows;
}

export function layersEqual(a: LayerRow[], b: LayerRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.id !== y.id || x.type !== y.type || x.label !== y.label ||
        x.hidden !== y.hidden || x.locked !== y.locked || x.selected !== y.selected) return false;
  }
  return true;
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
