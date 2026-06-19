export type Tokens = {
  colors?: Record<string, string>;
  text?: Record<string, Record<string, string | number>>;
};

export type NodeType =
  | "stack" | "row" | "text" | "button" | "input"
  | "image" | "rect" | "icon" | "component" | "instance";

export type DesignNode = {
  id: string;
  type: NodeType;
  direction?: "x" | "y";
  gap?: number;
  padding?: number;
  align?: string;
  justify?: string;
  text?: string;
  placeholder?: string;
  style?: string;
  variant?: string;
  src?: string;
  componentKey?: string;
  onTap?: string;
  w?: number;
  h?: number;
  children?: DesignNode[];
};

export type Frame = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  root: DesignNode;
};

export type DesignDoc = {
  version: 1;
  frames: Frame[];
  components: Record<string, DesignNode>;
  tokens: Tokens;
};

export type ParseResult =
  | { ok: true; doc: DesignDoc }
  | { ok: false; error: string };

const NODE_TYPES: ReadonlySet<string> = new Set([
  "stack", "row", "text", "button", "input",
  "image", "rect", "icon", "component", "instance",
]);

function validateNode(n: unknown, path: string): string | null {
  if (typeof n !== "object" || n === null) return `${path}: node must be an object`;
  const node = n as Record<string, unknown>;
  if (typeof node.id !== "string") return `${path}: node missing string id`;
  if (typeof node.type !== "string" || !NODE_TYPES.has(node.type))
    return `${path}: unknown node type "${String(node.type)}"`;
  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) return `${path}: children must be an array`;
    for (let i = 0; i < node.children.length; i++) {
      const err = validateNode(node.children[i], `${path}.children[${i}]`);
      if (err) return err;
    }
  }
  return null;
}

export function parseDesign(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof raw !== "object" || raw === null)
    return { ok: false, error: "Design must be a JSON object" };
  const d = raw as Record<string, unknown>;
  if (d.version !== 1) return { ok: false, error: `Unsupported version: ${String(d.version)}` };
  if (!Array.isArray(d.frames)) return { ok: false, error: "frames must be an array" };
  for (let i = 0; i < d.frames.length; i++) {
    const f = d.frames[i] as Record<string, unknown>;
    if (typeof f?.id !== "string" || typeof f?.name !== "string")
      return { ok: false, error: `frames[${i}]: missing id/name` };
    for (const k of ["x", "y", "w", "h"] as const) {
      if (typeof f[k] !== "number") return { ok: false, error: `frames[${i}]: ${k} must be a number` };
    }
    const err = validateNode(f.root, `frames[${i}].root`);
    if (err) return { ok: false, error: err };
  }
  const doc: DesignDoc = {
    version: 1,
    frames: d.frames as Frame[],
    components: (d.components as Record<string, DesignNode>) ?? {},
    tokens: (d.tokens as Tokens) ?? {},
  };
  return { ok: true, doc };
}
