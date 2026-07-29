/** Figma-style layers hierarchy: frames own the elements drawn inside them,
 *  groups nest inside either, everything else sits at the top. Pure — no React
 *  or Excalidraw imports.
 *
 *  Excalidraw already parents new elements to whatever frame is under the
 *  cursor (`frameId`), and `groupIds` is ordered innermost -> outermost, so
 *  this only has to read what the canvas already recorded. */
import { isHidden, type El } from "./commitCore";
import { labelForElement } from "./designUtils";

export type LayerEl = El & {
  type: string;
  frameId?: string | null;
  groupIds?: readonly string[];
  name?: string | null;
  text?: string;
};

export type LayerNode = {
  /** Unique row key: the element id, or `group:<groupId>`. */
  key: string;
  kind: "element" | "group";
  /** Element id for element rows, group id for group rows. */
  refId: string;
  /** Every element id under this row (just itself for element rows). */
  memberIds: string[];
  /** Element type, or "group". */
  type: string;
  label: string;
  hidden: boolean;
  locked: boolean;
  selected: boolean;
  children: LayerNode[];
};

/** A frame's own name wins over the generic type label — that is what an agent
 *  and the user both refer to it by. */
function labelFor(el: LayerEl): string {
  if (el.type === "frame") {
    const name = typeof el.name === "string" ? el.name.trim() : "";
    return name || "Frame";
  }
  return labelForElement(el);
}

function elementNode(el: LayerEl, selectedIds: Readonly<Record<string, boolean>>): LayerNode {
  return {
    key: el.id,
    kind: "element",
    refId: el.id,
    memberIds: [el.id],
    type: el.type,
    label: labelFor(el),
    hidden: isHidden(el),
    locked: el.locked === true,
    selected: selectedIds[el.id] === true,
    children: [],
  };
}

type Bucket = {
  nodes: LayerNode[];
  groups: Map<string, { node: LayerNode; bucket: Bucket }>;
};

const newBucket = (): Bucket => ({ nodes: [], groups: new Map() });

/** Drop `node` into `bucket`, creating group rows along `path` (outermost
 *  first) as needed. A group row is created at the position of its topmost
 *  member, which is where Figma shows it. */
function insert(bucket: Bucket, path: readonly string[], node: LayerNode): void {
  if (path.length === 0) {
    bucket.nodes.push(node);
    return;
  }
  const [head, ...rest] = path;
  let entry = bucket.groups.get(head);
  if (!entry) {
    const groupNode: LayerNode = {
      key: `group:${head}`,
      kind: "group",
      refId: head,
      memberIds: [],
      type: "group",
      label: "Group",
      hidden: false,
      locked: false,
      selected: false,
      children: [],
    };
    entry = { node: groupNode, bucket: newBucket() };
    bucket.groups.set(head, entry);
    bucket.nodes.push(groupNode);
  }
  insert(entry.bucket, rest, node);
}

/** Hang each group's collected children off its row and roll up the aggregate
 *  flags. A group counts as hidden/locked/selected only when every member is. */
function finalise(bucket: Bucket): LayerNode[] {
  for (const { node, bucket: inner } of bucket.groups.values()) {
    node.children = finalise(inner);
    node.memberIds = node.children.flatMap((c) => c.memberIds);
    node.hidden = node.children.every((c) => c.hidden);
    node.locked = node.children.every((c) => c.locked);
    node.selected = node.children.every((c) => c.selected);
  }
  return bucket.nodes;
}

function buildBucket(
  els: readonly LayerEl[],
  selectedIds: Readonly<Record<string, boolean>>,
  childrenOfFrame: (frameId: string) => LayerNode[],
): LayerNode[] {
  const bucket = newBucket();
  for (const el of els) {
    const node = elementNode(el, selectedIds);
    if (el.type === "frame") {
      node.children = childrenOfFrame(el.id);
      // The frame row selects the frame itself, so its own id stays first.
      node.memberIds = [el.id, ...node.children.flatMap((c) => c.memberIds)];
    }
    // groupIds is innermost -> outermost; nesting reads outermost first.
    insert(bucket, [...(el.groupIds ?? [])].reverse(), node);
  }
  return finalise(bucket);
}

/** Build the layers tree, topmost first at every level (Excalidraw stores
 *  elements bottom-to-top; Figma lists them top-to-bottom). */
export function buildLayerTree(
  elements: readonly LayerEl[],
  selectedIds: Readonly<Record<string, boolean>>,
): LayerNode[] {
  const live = elements.filter((e) => e.isDeleted !== true);
  const frameIds = new Set(live.filter((e) => e.type === "frame").map((e) => e.id));

  // Topmost first, so group rows land at their topmost member.
  const topDown = [...live].reverse();
  const inFrame = new Map<string, LayerEl[]>();
  const roots: LayerEl[] = [];
  for (const el of topDown) {
    // A frameId pointing at a frame that no longer exists must not hide the
    // element — it falls back to the top level.
    const parent = typeof el.frameId === "string" && frameIds.has(el.frameId) ? el.frameId : null;
    if (parent !== null && el.type !== "frame") {
      const list = inFrame.get(parent);
      if (list) list.push(el);
      else inFrame.set(parent, [el]);
    } else {
      roots.push(el);
    }
  }

  const childrenOfFrame = (frameId: string) =>
    buildBucket(inFrame.get(frameId) ?? [], selectedIds, childrenOfFrame);

  return buildBucket(roots, selectedIds, childrenOfFrame);
}

export type LayerRow = LayerNode & { depth: number; hasChildren: boolean };

/** Flatten for rendering, skipping the contents of collapsed rows. */
export function flattenLayerTree(
  nodes: readonly LayerNode[],
  collapsed: ReadonlySet<string>,
  depth = 0,
): LayerRow[] {
  const rows: LayerRow[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    rows.push({ ...node, depth, hasChildren });
    if (hasChildren && !collapsed.has(node.key)) {
      rows.push(...flattenLayerTree(node.children, collapsed, depth + 1));
    }
  }
  return rows;
}

export function layerTreeEqual(a: readonly LayerNode[], b: readonly LayerNode[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.key !== y.key || x.type !== y.type || x.label !== y.label ||
        x.hidden !== y.hidden || x.locked !== y.locked || x.selected !== y.selected ||
        x.memberIds.length !== y.memberIds.length) return false;
    if (!layerTreeEqual(x.children, y.children)) return false;
  }
  return true;
}
