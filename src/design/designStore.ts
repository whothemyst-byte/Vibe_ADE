/** External store fed by Excalidraw's onChange. Panels subscribe to derived
 *  slices (via useDesignSelector) so a 60fps drag re-renders only components
 *  whose slice actually changed. Pure — no React/Excalidraw imports. */
import { isHidden, type El } from "./commitCore";
import { labelForElement } from "./designUtils";

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
};

export const EMPTY_SNAPSHOT: DesignSnapshot = {
  elements: [], selectedIds: {}, zoom: 1,
  scrollX: 0, scrollY: 0, width: 0, height: 0, activeType: "selection",
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

export type InspectorSel = {
  id: string; type: string;
  x: number; y: number; width: number; height: number; angleDeg: number;
  opacity: number; strokeColor: string; backgroundColor: string; strokeWidth: number;
  fontSize: number | null;
  hidden: boolean;
};

export function selectInspector(s: DesignSnapshot): InspectorSel | null {
  const el = s.elements.find((e) => s.selectedIds[e.id] && e.isDeleted !== true);
  if (!el) return null;
  return {
    id: el.id,
    type: el.type,
    x: Math.round(el.x),
    y: Math.round(el.y),
    width: Math.round(el.width),
    height: Math.round(el.height),
    angleDeg: Math.round((el.angle * 180) / Math.PI),
    opacity: el.opacity,
    strokeColor: el.strokeColor,
    backgroundColor: el.backgroundColor,
    strokeWidth: el.strokeWidth,
    fontSize: el.type === "text" && typeof el.fontSize === "number" ? el.fontSize : null,
    hidden: isHidden(el),
  };
}

export function inspectorEqual(a: InspectorSel | null, b: InspectorSel | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.id === b.id && a.type === b.type &&
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height &&
    a.angleDeg === b.angleDeg && a.opacity === b.opacity &&
    a.strokeColor === b.strokeColor && a.backgroundColor === b.backgroundColor &&
    a.strokeWidth === b.strokeWidth && a.fontSize === b.fontSize && a.hidden === b.hidden;
}

export const selectZoom = (s: DesignSnapshot): number => s.zoom;
export const selectActiveType = (s: DesignSnapshot): string => s.activeType;
