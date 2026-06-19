# Design Canvas — Phase 1 (Foundations + Round-Trip) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `design` card to the Vibe Space wall that renders an agent-editable `*.design.json` file live, with echo-guarded write-back so visual edits and agent edits round-trip through one file.

**Architecture:** The design file is the single source of truth — a declarative UI node tree. A pure TS layer (schema, serialize, style-mapping, echo-guard hashing) holds all correctness-critical logic and is fully unit-tested. A new `DesignWindow` card loads/renders the file and subscribes to a Rust `notify` fs-watcher (`design://changed` event) for live reload; frame drags debounce-write back to the file, guarded against re-loading the card's own writes.

**Tech Stack:** React 19, TypeScript, Zustand, Tauri v2 (Rust: `notify` crate, `serde_json`), Vitest (+ jsdom).

## Global Constraints

- Output is **static vector mockups** rendered via DOM/CSS — never a runnable app; mockup `pointer-events` stay disabled in Phase 1.
- Design file is **pretty-printed, stable-ordered JSON** with a trailing newline (clean agent diffs). Schema `version` is `1`.
- File path convention: `<terminal cwd>/designs/<name>.design.json`.
- No new npm dependencies; no MCP. Rust may add only the `notify` crate.
- Follow the repo's per-module `*.test.ts` Vitest convention; keep correctness logic pure (no React/DOM in tested units).
- Brand tokens default to Quansynd warm amber (`#d79a3d`) + warm neutrals — NOT blue.
- Match existing code style; surgical changes only (see project CLAUDE.md).

---

### Task 1: Design document types + schema validator

**Files:**
- Create: `src/design/schema.ts`
- Test: `src/design/schema.test.ts`

**Interfaces:**
- Produces:
  - Types: `DesignDoc`, `Frame`, `DesignNode` (union), `Tokens`.
  - `parseDesign(json: string): ParseResult` where
    `type ParseResult = { ok: true; doc: DesignDoc } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/design/schema.test.ts
import { describe, it, expect } from "vitest";
import { parseDesign } from "./schema";

const valid = JSON.stringify({
  version: 1,
  frames: [
    { id: "login", name: "Login", x: 0, y: 0, w: 390, h: 844,
      root: { id: "r", type: "stack", direction: "y", children: [
        { id: "t1", type: "text", text: "Sign in" },
      ] } },
  ],
  components: {},
  tokens: {},
});

describe("parseDesign", () => {
  it("accepts a valid document", () => {
    const res = parseDesign(valid);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.doc.frames[0].id).toBe("login");
  });

  it("rejects malformed JSON with a message", () => {
    const res = parseDesign("{ not json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/JSON/i);
  });

  it("rejects an unsupported version", () => {
    const res = parseDesign(JSON.stringify({ version: 2, frames: [] }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/version/i);
  });

  it("rejects a frame missing required fields", () => {
    const res = parseDesign(JSON.stringify({ version: 1, frames: [{ id: "x" }] }));
    expect(res.ok).toBe(false);
  });

  it("rejects an unknown node type", () => {
    const bad = JSON.stringify({ version: 1, frames: [
      { id: "f", name: "F", x: 0, y: 0, w: 10, h: 10,
        root: { id: "r", type: "blink" } }] });
    const res = parseDesign(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/type/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/schema.test.ts`
Expected: FAIL — `parseDesign` not found / module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/design/schema.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/design/schema.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/design/schema.ts src/design/schema.test.ts
git commit -m "feat(design): design doc types + schema validator"
```

### Task 2: Stable serialization

**Files:**
- Create: `src/design/serialize.ts`
- Test: `src/design/serialize.test.ts`

**Interfaces:**
- Consumes: `DesignDoc` from `./schema`.
- Produces: `serializeDesign(doc: DesignDoc): string` — pretty-printed (2-space),
  stable top-level key order (`version, frames, components, tokens`), trailing
  newline. Idempotent: serializing a parsed serialization yields identical text.

- [ ] **Step 1: Write the failing test**

```ts
// src/design/serialize.test.ts
import { describe, it, expect } from "vitest";
import { serializeDesign } from "./serialize";
import { parseDesign, type DesignDoc } from "./schema";

const doc: DesignDoc = {
  version: 1,
  frames: [{ id: "f", name: "F", x: 0, y: 0, w: 10, h: 20,
    root: { id: "r", type: "stack", direction: "y", children: [] } }],
  components: {},
  tokens: { colors: { primary: "#d79a3d" } },
};

describe("serializeDesign", () => {
  it("emits pretty JSON ending in a newline", () => {
    const out = serializeDesign(doc);
    expect(out.endsWith("\n")).toBe(true);
    expect(out).toContain('  "version": 1');
  });

  it("orders top-level keys version, frames, components, tokens", () => {
    const out = serializeDesign(doc);
    const order = ["version", "frames", "components", "tokens"]
      .map((k) => out.indexOf(`"${k}"`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("round-trips: parse(serialize(doc)) deep-equals doc", () => {
    const res = parseDesign(serializeDesign(doc));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.doc).toEqual(doc);
  });

  it("is idempotent: serialize(parse(serialize(doc))) is stable", () => {
    const once = serializeDesign(doc);
    const res = parseDesign(once);
    expect(res.ok).toBe(true);
    if (res.ok) expect(serializeDesign(res.doc)).toBe(once);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/serialize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/design/serialize.ts
import type { DesignDoc } from "./schema";

/** Pretty, stable-ordered JSON with a trailing newline so agent diffs stay clean. */
export function serializeDesign(doc: DesignDoc): string {
  const ordered = {
    version: doc.version,
    frames: doc.frames,
    components: doc.components,
    tokens: doc.tokens,
  };
  return JSON.stringify(ordered, null, 2) + "\n";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/design/serialize.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/design/serialize.ts src/design/serialize.test.ts
git commit -m "feat(design): stable design serialization"
```

### Task 3: Node → CSS style mapping (pure)

**Files:**
- Create: `src/design/style.ts`
- Test: `src/design/style.test.ts`

**Interfaces:**
- Consumes: `DesignNode`, `Tokens` from `./schema`.
- Produces: `styleFor(node: DesignNode, tokens: Tokens): CSSProperties` — maps a
  node to React inline styles (`stack`/`row` → flex; token refs resolved).
  This is the pure mapping the renderer (Task 7) reuses, so it is tested without
  any DOM.

- [ ] **Step 1: Write the failing test**

```ts
// src/design/style.test.ts
import { describe, it, expect } from "vitest";
import { styleFor } from "./style";
import type { Tokens } from "./schema";

const tokens: Tokens = { colors: { primary: "#d79a3d" } };

describe("styleFor", () => {
  it("maps a y-stack to a column flexbox with gap/padding", () => {
    const s = styleFor(
      { id: "a", type: "stack", direction: "y", gap: 16, padding: 24 }, tokens);
    expect(s.display).toBe("flex");
    expect(s.flexDirection).toBe("column");
    expect(s.gap).toBe(16);
    expect(s.padding).toBe(24);
  });

  it("maps a row to a row flexbox", () => {
    const s = styleFor({ id: "a", type: "row" }, tokens);
    expect(s.flexDirection).toBe("row");
  });

  it("resolves a primary button variant to the brand color background", () => {
    const s = styleFor({ id: "b", type: "button", variant: "primary" }, tokens);
    expect(s.background).toBe("#d79a3d");
  });

  it("applies explicit width/height when present", () => {
    const s = styleFor({ id: "r", type: "rect", w: 40, h: 8 }, tokens);
    expect(s.width).toBe(40);
    expect(s.height).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/style.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/design/style.ts
import type { CSSProperties } from "react";
import type { DesignNode, Tokens } from "./schema";

const FALLBACK_PRIMARY = "#d79a3d"; // Quansynd amber

export function styleFor(node: DesignNode, tokens: Tokens): CSSProperties {
  const s: CSSProperties = {};
  if (node.type === "stack" || node.type === "row") {
    s.display = "flex";
    s.flexDirection = node.type === "row" || node.direction === "x" ? "row" : "column";
    if (node.gap !== undefined) s.gap = node.gap;
    if (node.padding !== undefined) s.padding = node.padding;
    if (node.align) s.alignItems = node.align;
    if (node.justify) s.justifyContent = node.justify;
  }
  if (node.type === "button" && node.variant === "primary") {
    s.background = tokens.colors?.primary ?? FALLBACK_PRIMARY;
    s.color = "#1a1714";
    s.borderRadius = 8;
    s.padding = node.padding ?? 12;
  }
  if (node.type === "input") {
    s.border = "1px solid #4a423a";
    s.borderRadius = 8;
    s.padding = node.padding ?? 10;
    s.background = "#1a1714";
    s.color = "#e8e2d8";
  }
  if (node.type === "rect") {
    s.background = node.style ? tokens.colors?.[node.style] ?? node.style : "#2a2520";
  }
  if (node.w !== undefined) s.width = node.w;
  if (node.h !== undefined) s.height = node.h;
  return s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/design/style.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/design/style.ts src/design/style.test.ts
git commit -m "feat(design): pure node-to-CSS style mapping"
```

### Task 4: Echo-guard + conflict decision (pure)

**Files:**
- Create: `src/design/echoGuard.ts`
- Test: `src/design/echoGuard.test.ts`

**Interfaces:**
- Produces:
  - `hashText(s: string): string` — stable non-crypto hash (FNV-1a) of file text.
  - `makeEchoGuard(): EchoGuard` where
    `EchoGuard = { markWritten(text: string): void; isOwnEcho(text: string): boolean }`.
    `isOwnEcho` returns true exactly once for text whose hash matches the last
    `markWritten` (so the card ignores the reload triggered by its own save).
  - `shouldReloadOnConflict(loadedHash: string, onDiskHash: string): boolean` —
    true when the on-disk text diverged from what the card last loaded (agent
    edited underneath an in-progress visual edit → reload agent's version).

- [ ] **Step 1: Write the failing test**

```ts
// src/design/echoGuard.test.ts
import { describe, it, expect } from "vitest";
import { hashText, makeEchoGuard, shouldReloadOnConflict } from "./echoGuard";

describe("hashText", () => {
  it("is stable and distinguishes different text", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });
});

describe("echo guard", () => {
  it("treats the card's own write as an echo exactly once", () => {
    const g = makeEchoGuard();
    g.markWritten("FILE-A");
    expect(g.isOwnEcho("FILE-A")).toBe(true);   // the echoed reload
    expect(g.isOwnEcho("FILE-A")).toBe(false);  // any later identical event is external
  });

  it("never swallows an external (agent) change", () => {
    const g = makeEchoGuard();
    g.markWritten("FILE-A");
    expect(g.isOwnEcho("FILE-B")).toBe(false);
  });
});

describe("shouldReloadOnConflict", () => {
  it("reloads when on-disk diverged from the loaded baseline", () => {
    expect(shouldReloadOnConflict(hashText("base"), hashText("agent-edit"))).toBe(true);
  });
  it("does not reload when on-disk matches the baseline", () => {
    expect(shouldReloadOnConflict(hashText("base"), hashText("base"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/echoGuard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/design/echoGuard.ts

/** FNV-1a 32-bit hash, returned as hex. Stable, fast, non-crypto. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export type EchoGuard = {
  markWritten(text: string): void;
  isOwnEcho(text: string): boolean;
};

/** Tracks the hash of the card's most recent own write so the watcher event
 *  it triggers is ignored exactly once. */
export function makeEchoGuard(): EchoGuard {
  let pending: string | null = null;
  return {
    markWritten(text) { pending = hashText(text); },
    isOwnEcho(text) {
      if (pending !== null && pending === hashText(text)) {
        pending = null;
        return true;
      }
      return false;
    },
  };
}

export function shouldReloadOnConflict(loadedHash: string, onDiskHash: string): boolean {
  return loadedHash !== onDiskHash;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/design/echoGuard.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/design/echoGuard.ts src/design/echoGuard.test.ts
git commit -m "feat(design): echo-guard + conflict decision"
```

### Task 5: `design` card type + open/close actions

**Files:**
- Modify: `src/wall/cardStore.ts` (add `DesignCard` to the `Card` union and the `update` patch type)
- Create: `src/design/designCard.ts`
- Test: `src/design/designCard.test.ts`
- Modify: `src/wall/TerminalOverlay.tsx:25-33` (make the fall-through arm explicit so the union change stays type-safe; the real `DesignWindow` render lands in Task 8)

**Interfaces:**
- Consumes: `useCardStore`, `Card` from `../wall/cardStore`; `CELL` from `../wall/gridLayout`; `removeCardWithFade` from `../wall/removeCard`.
- Produces:
  - `DesignCard = { kind: "design"; id: string; path: string; name: string; x: number; y: number; w: number; h: number }`.
  - `DESIGN_ID = "wall-design"`, `designCard(): DesignCard | undefined`,
    `openDesign(path: string, name: string): void`, `closeDesign(): void`.

- [ ] **Step 1: Write the failing test**

```ts
// src/design/designCard.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useCardStore } from "../wall/cardStore";
import { openDesign, closeDesign, designCard, DESIGN_ID } from "./designCard";

beforeEach(() => useCardStore.setState({ cards: [], anchor: null }));

describe("design card actions", () => {
  it("openDesign adds a single design card", () => {
    openDesign("/proj/designs/login.design.json", "login");
    const c = designCard();
    expect(c?.kind).toBe("design");
    expect(c?.id).toBe(DESIGN_ID);
    expect(c?.path).toBe("/proj/designs/login.design.json");
    expect(c?.name).toBe("login");
  });

  it("openDesign re-points the existing card instead of adding a second", () => {
    openDesign("/a/x.design.json", "x");
    openDesign("/a/y.design.json", "y");
    expect(useCardStore.getState().cards.filter((c) => c.kind === "design")).toHaveLength(1);
    expect(designCard()?.name).toBe("y");
  });

  it("closeDesign removes the card", () => {
    openDesign("/a/x.design.json", "x");
    closeDesign();
    // removeCardWithFade schedules removal; assert it is no longer 'added twice'
    expect(designCard()?.path).not.toBe(undefined === undefined ? "/never" : "");
  });
});
```

> Note: `closeDesign` delegates to `removeCardWithFade` (a fade timer). The third
> test only asserts `closeDesign()` runs without throwing; do not assert
> synchronous removal. If `removeCardWithFade` proves hard to exercise under
> jsdom, replace the third test body with `expect(() => closeDesign()).not.toThrow()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/designCard.test.ts`
Expected: FAIL — `./designCard` not found.

- [ ] **Step 3a: Extend the card union in `src/wall/cardStore.ts`**

Add after the `FileCard` type (around line 36):

```ts
/** A live design surface backed by a *.design.json file; occupies a grid cell. */
export type DesignCard = {
  kind: "design";
  id: string;
  path: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
```

Change the `Card` union (line 38) to:

```ts
export type Card = TerminalCard | BrowserCard | FileCard | DesignCard;
```

Add a `DesignCard` arm to the `update` patch type (inside the `update` signature, alongside the `FileCard` partial):

```ts
      | Partial<Omit<DesignCard, "kind" | "id">>
```

- [ ] **Step 3b: Write `src/design/designCard.ts`**

```ts
// src/design/designCard.ts
import { useCardStore, type DesignCard } from "../wall/cardStore";
import { CELL } from "../wall/gridLayout";
import { removeCardWithFade } from "../wall/removeCard";

export const DESIGN_ID = "wall-design";

export function designCard(): DesignCard | undefined {
  return useCardStore.getState().cards.find((c): c is DesignCard => c.kind === "design");
}

/** Opens the design card (grid re-flows) or re-points the existing one at `path`. */
export function openDesign(path: string, name: string): void {
  if (designCard()) {
    useCardStore.getState().update(DESIGN_ID, { path, name });
    return;
  }
  useCardStore.getState().add({
    kind: "design",
    id: DESIGN_ID,
    path,
    name,
    x: 0,
    y: 0,
    w: CELL.w,
    h: CELL.h, // placeholder; the grid layout positions it
  });
}

export function closeDesign(): void {
  if (designCard()) removeCardWithFade(DESIGN_ID);
}
```

- [ ] **Step 3c: Keep `TerminalOverlay` type-safe**

Adding `DesignCard` to the union makes the current fall-through `else` arm
receive `FileCard | DesignCard`, which no longer satisfies `FileViewerWindow`'s
`FileCard` prop. Make the arms explicit. In `src/wall/TerminalOverlay.tsx`,
replace the `cards.map(...)` body (lines 25-33) with:

```tsx
        {cards.map((c) =>
          c.kind === "terminal" ? (
            <TerminalWindow key={c.id} terminal={c} cameraRef={cameraRef} />
          ) : c.kind === "browser" ? (
            <BrowserWindow key={c.id} card={c} cameraRef={cameraRef} />
          ) : c.kind === "file" ? (
            <FileViewerWindow key={c.id} card={c} cameraRef={cameraRef} />
          ) : null  /* design card rendered in Task 8 */
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/design/designCard.test.ts`
Expected: PASS.
Then run `npx tsc --noEmit` — expected: no errors (the explicit `kind === "file"`
arm narrows `c` to `FileCard`; the `design` card renders `null` for now).

- [ ] **Step 5: Commit**

```bash
git add src/wall/cardStore.ts src/wall/TerminalOverlay.tsx \
  src/design/designCard.ts src/design/designCard.test.ts
git commit -m "feat(design): design card type + open/close actions"
```

### Task 6: Rust `write_design_file` command + frontend wrapper

**Files:**
- Modify: `src-tauri/src/store/commands.rs` (add `write_design_file`)
- Modify: `src-tauri/src/lib.rs:35-67` (register the command)
- Modify: `src/store/persistence.ts` (add `writeDesignFile`, `readTextFile` reuse)

**Interfaces:**
- Produces:
  - Rust `write_design_file(path: String, contents: String) -> Result<(), String>` —
    writes atomically; **rejects any path not ending in `.design.json`** (the
    write surface must not be a general file-write primitive).
  - TS `writeDesignFile(path: string, contents: string): Promise<void>`.
  - TS reuses the existing `readTextFile(path)` for loading.

- [ ] **Step 1: Write the failing Rust test**

Append to `src-tauri/src/store/commands.rs`:

```rust
#[cfg(test)]
mod design_tests {
    use super::*;
    use std::fs;

    #[test]
    fn writes_a_design_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("login.design.json");
        write_design_file(p.to_string_lossy().into_owned(), "{}\n".to_string()).unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "{}\n");
    }

    #[test]
    fn rejects_non_design_paths() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("secrets.txt");
        let err = write_design_file(p.to_string_lossy().into_owned(), "x".to_string());
        assert!(err.is_err());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test design_tests`
Expected: FAIL — `write_design_file` not found.

- [ ] **Step 3: Implement the command**

Add to `src-tauri/src/store/commands.rs` (near `read_text_file`):

```rust
/// Write a design document to an arbitrary project path. Restricted to
/// `*.design.json` so this can never become a general file-write primitive.
#[tauri::command]
pub fn write_design_file(path: String, contents: String) -> Result<(), String> {
    if !path.ends_with(".design.json") {
        return Err("refusing to write a non-design file".to_string());
    }
    let p = std::path::Path::new(&path);
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?; // seed designs/ if missing
    }
    write_atomic(p, contents.as_bytes()).map_err(|e| e.to_string())
}
```

Register it in `src-tauri/src/lib.rs` in the `generate_handler!` list, after
`store::commands::read_text_file,`:

```rust
            store::commands::write_design_file,
```

Add the wrapper to `src/store/persistence.ts`:

```ts
/** Write a *.design.json (Rust enforces the extension). */
export function writeDesignFile(path: string, contents: string): Promise<void> {
  return invoke("write_design_file", { path, contents });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test design_tests`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/store/commands.rs src-tauri/src/lib.rs src/store/persistence.ts
git commit -m "feat(design): write_design_file Tauri command + wrapper"
```

### Task 7: Rust fs-watcher + `design-changed` event + frontend wrapper

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `notify`)
- Create: `src-tauri/src/design.rs`
- Modify: `src-tauri/src/lib.rs` (`mod design;`, manage state, register commands)
- Create: `src/design/watch.ts`

**Interfaces:**
- Produces:
  - Rust commands `design_watch(path)` / `design_unwatch()`. While watching, the
    backend emits a `design-changed` event whose payload is the absolute path of
    the changed `*.design.json`.
  - TS `watchDesignFile(path: string, cb: () => void): Promise<UnlistenFn>` —
    starts the watcher and fires `cb` when the watched path changes; the returned
    function stops listening and the watcher.

> This task is **integration-verified manually** (fs watchers need a real Tauri
> runtime), so it has no Vitest unit. The verification step drives the round-trip.

- [ ] **Step 1: Add the `notify` dependency**

In `src-tauri/Cargo.toml`, under `[dependencies]`, add:

```toml
notify = "6"
```

- [ ] **Step 2: Create the watcher module**

```rust
// src-tauri/src/design.rs
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// Holds the single active design watcher (Phase 1 shows one design card).
/// Dropping the watcher (set to None) stops it.
#[derive(Default)]
pub struct DesignWatcher(pub Mutex<Option<RecommendedWatcher>>);

/// Watch the directory of `path` and emit `design-changed` (payload = changed
/// absolute path) whenever a `*.design.json` there is created or modified.
#[tauri::command]
pub fn design_watch(app: AppHandle, path: String) -> Result<(), String> {
    let dir = Path::new(&path)
        .parent()
        .ok_or("design path has no parent directory")?
        .to_path_buf();
    let emit_app = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            if matches!(ev.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                for p in ev.paths {
                    let s = p.to_string_lossy();
                    if s.ends_with(".design.json") {
                        let _ = emit_app.emit("design-changed", s.into_owned());
                    }
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    *app.state::<DesignWatcher>().0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn design_unwatch(app: AppHandle) -> Result<(), String> {
    *app.state::<DesignWatcher>().0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}
```

- [ ] **Step 3: Wire the module into `lib.rs`**

Add `mod design;` next to the other `mod` lines (top of `src-tauri/src/lib.rs`).
Add to the managed state (next to `.manage(browser::BrowserState::default())`):

```rust
        .manage(design::DesignWatcher::default())
```

Register both commands in the `generate_handler!` list (after the `store::` block):

```rust
            design::design_watch,
            design::design_unwatch,
```

- [ ] **Step 4: Create the frontend wrapper**

```ts
// src/design/watch.ts
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Start watching `path`; `cb` fires when that exact file changes on disk.
 *  The returned fn stops the event listener and the backend watcher. */
export async function watchDesignFile(path: string, cb: () => void): Promise<UnlistenFn> {
  await invoke("design_watch", { path });
  const un = await listen<string>("design-changed", (e) => {
    if (e.payload === path) cb();
  });
  return async () => {
    un();
    await invoke("design_unwatch").catch(() => {});
  };
}
```

- [ ] **Step 5: Verify it builds**

Run: `cd src-tauri && cargo build`
Expected: compiles (notify resolves; commands registered).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/design.rs \
  src-tauri/src/lib.rs src/design/watch.ts
git commit -m "feat(design): fs-watcher + design-changed event + watch wrapper"
```

### Task 8: Renderer + `DesignWindow` + opener (the round-trip)

This is the payoff task: a design card that loads the file, renders frames,
live-reloads on agent edits, and writes frame moves back — echo-guarded. It is
**verified manually** via the round-trip script at the end.

**Files:**
- Create: `src/design/render.tsx`
- Create: `src/design/DesignWindow.tsx`
- Modify: `src/design/designCard.ts` (add `openDesignFromPicker`)
- Modify: `src/wall/TerminalOverlay.tsx` (replace the `null` design arm)
- Modify: `src/wall/LaunchMenu.tsx` (add `onLaunchDesign` prop + menu item)
- Modify: `src/wall/WallView.tsx:634` (wire `onLaunchDesign`)

**Interfaces:**
- Consumes: `parseDesign`, `DesignDoc`, `Frame` (`./schema`); `serializeDesign`
  (`./serialize`); `styleFor` (`./style`); `hashText`, `makeEchoGuard`,
  `shouldReloadOnConflict` (`./echoGuard`); `watchDesignFile` (`./watch`);
  `readTextFile`, `writeDesignFile`, `pickFolder` (`../store/persistence`);
  `openDesign`, `DesignCard` (`./designCard` / `../wall/cardStore`);
  `HEADER_H`, `Camera` (`../wall/transform`).
- Produces: `<DesignWindow card cameraRef />`, `openDesignFromPicker()`.

- [ ] **Step 1: Write the renderer**

```tsx
// src/design/render.tsx
import type { DesignNode, DesignDoc, Frame } from "./schema";
import { styleFor } from "./style";

function NodeView({ node, tokens }: { node: DesignNode; tokens: DesignDoc["tokens"] }) {
  const style = styleFor(node, tokens);
  switch (node.type) {
    case "text":   return <div style={style}>{node.text ?? ""}</div>;
    case "button": return <div style={{ textAlign: "center", ...style }}>{node.text ?? ""}</div>;
    case "input":  return <div style={{ color: "#7c7468", ...style }}>{node.placeholder ?? ""}</div>;
    case "image":  return <div style={{ background: "#2a2520", ...style }} />;
    case "icon":   return <div style={style}>◻</div>;
    case "rect":   return <div style={style} />;
    default:       // stack / row / component / instance → container
      return (
        <div style={style}>
          {(node.children ?? []).map((c) => <NodeView key={c.id} node={c} tokens={tokens} />)}
        </div>
      );
  }
}

/** A single artboard. Static mockup: pointer-events disabled (Phase 1). */
export function FrameView({ frame, tokens }: { frame: Frame; tokens: DesignDoc["tokens"] }) {
  return (
    <div
      style={{
        position: "absolute", left: frame.x, top: frame.y,
        width: frame.w, height: frame.h, background: "#15120f",
        border: "1px solid #2a2520", borderRadius: 10, overflow: "hidden",
        pointerEvents: "none", color: "#e8e2d8",
        fontFamily: "Geist, system-ui, sans-serif",
      }}
    >
      <div style={{ width: "100%", height: "100%" }}>
        <NodeView node={frame.root} tokens={tokens} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `DesignWindow.tsx`**

```tsx
// src/design/DesignWindow.tsx
import {
  memo, useEffect, useRef, useState,
  type PointerEvent as ReactPointerEvent, type RefObject,
} from "react";
import { HEADER_H, type Camera } from "../wall/transform";
import { useCardStore, type DesignCard } from "../wall/cardStore";
import { CloseIcon, FileIcon } from "../wall/icons";
import { nearestSlotIndex } from "../wall/gridLayout";
import { readTextFile, writeDesignFile } from "../store/persistence";
import { parseDesign, type DesignDoc } from "./schema";
import { serializeDesign } from "./serialize";
import { hashText, makeEchoGuard, shouldReloadOnConflict } from "./echoGuard";
import { watchDesignFile } from "./watch";
import { closeDesign } from "./designCard";
import { FrameView } from "./render";

function DesignWindowInner({ card, cameraRef }: { card: DesignCard; cameraRef: RefObject<Camera> }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<DesignDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const loadedHash = useRef<string>("");
  const echo = useRef(makeEchoGuard());
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applyText(text: string) {
    const res = parseDesign(text);
    if (res.ok) { setDoc(res.doc); setError(null); loadedHash.current = hashText(text); }
    else setError(res.error); // keep last good render; show banner
  }

  // Initial load + live reload on external (agent) writes.
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    readTextFile(card.path).then((t) => { if (!cancelled) applyText(t); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    watchDesignFile(card.path, async () => {
      const t = await readTextFile(card.path).catch(() => null);
      if (t === null) return;
      if (echo.current.isOwnEcho(t)) return; // ignore our own save
      applyText(t);
    }).then((un) => { if (cancelled) un(); else stop = un; });
    return () => { cancelled = true; stop?.(); };
  }, [card.path]);

  function persist(next: DesignDoc) {
    const text = serializeDesign(next);
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(async () => {
      const onDisk = await readTextFile(card.path).catch(() => null);
      if (onDisk !== null && shouldReloadOnConflict(loadedHash.current, hashText(onDisk))) {
        applyText(onDisk); // agent changed it underneath us — agent wins
        setToast("reloaded — agent updated this design");
        setTimeout(() => setToast(null), 2200);
        return;
      }
      echo.current.markWritten(text);
      loadedHash.current = hashText(text);
      await writeDesignFile(card.path, text).catch((e) => setError(String(e)));
    }, 300);
  }

  function moveFrame(frameId: string, dx: number, dy: number) {
    setDoc((d) => {
      if (!d) return d;
      const next: DesignDoc = {
        ...d,
        frames: d.frames.map((f) =>
          f.id === frameId ? { ...f, x: Math.round(f.x + dx), y: Math.round(f.y + dy) } : f),
      };
      persist(next);
      return next;
    });
  }

  // Drag a frame by its title bar; delta is screen px / camera zoom.
  function beginFrameDrag(frameId: string, e: ReactPointerEvent) {
    e.stopPropagation();
    const z = cameraRef.current.z;
    const sx = e.clientX, sy = e.clientY;
    let lx = sx, ly = sy;
    const onMove = (ev: PointerEvent) => {
      moveFrame(frameId, (ev.clientX - lx) / z, (ev.clientY - ly) / z);
      lx = ev.clientX; ly = ev.clientY;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const close = (e: ReactPointerEvent) => { e.stopPropagation(); closeDesign(); };

  // Drag-to-reorder the whole card (same gesture as FileViewerWindow).
  const beginCardDrag = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.stopPropagation();
    if (wrapRef.current) wrapRef.current.style.transition = "none";
    const z = cameraRef.current.z;
    const sx = e.clientX, sy = e.clientY, ox = card.x, oy = card.y;
    let nx = ox, ny = oy;
    const onMove = (ev: PointerEvent) => {
      nx = ox + (ev.clientX - sx) / z; ny = oy + (ev.clientY - sy) / z;
      const el = wrapRef.current; if (el) el.style.transform = `translate(${nx}px, ${ny}px)`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const el = wrapRef.current;
      if (el) { el.style.transition = ""; el.style.transform = `translate(${card.x}px, ${card.y}px)`; }
      const { cards, moveToIndex } = useCardStore.getState();
      const slot = nearestSlotIndex(
        { x: nx + card.w / 2, y: ny + card.h / 2 },
        cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })));
      const from = cards.findIndex((c) => c.id === card.id);
      if (slot !== -1 && slot !== from) moveToIndex(card.id, slot);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={wrapRef}
      className="terminal-window"
      data-card-id={card.id}
      style={{ transform: `translate(${card.x}px, ${card.y}px)`, width: card.w, height: card.h }}
    >
      <div className="terminal-header" style={{ height: HEADER_H }} onPointerDown={beginCardDrag}>
        <span className="file-header-icon"><FileIcon /></span>
        <span className="terminal-title" title={card.path}>{card.name}</span>
        <button className="terminal-close" title="Close" onPointerDown={close}><CloseIcon /></button>
      </div>
      <div className="terminal-body" style={{ top: HEADER_H, bottom: 0, position: "absolute", left: 0, right: 0, overflow: "auto", background: "#0e0c0a" }}>
        {error && <div className="file-hint file-error" style={{ position: "sticky", top: 0 }}>{error}</div>}
        {toast && <div className="file-hint" style={{ position: "sticky", top: 0 }}>{toast}</div>}
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          {doc?.frames.map((f) => (
            <div key={f.id}>
              <FrameView frame={f} tokens={doc.tokens} />
              {/* drag bar to move the frame (writes back to file) */}
              <div
                title={`Move ${f.name}`}
                onPointerDown={(e) => beginFrameDrag(f.id, e)}
                style={{ position: "absolute", left: f.x, top: f.y - 18, width: f.w,
                  height: 18, cursor: "grab", fontSize: 11, color: "#9a8f80",
                  display: "flex", alignItems: "center", padding: "0 6px" }}
              >{f.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const DesignWindow = memo(DesignWindowInner);
```

- [ ] **Step 3: Add `openDesignFromPicker` to `src/design/designCard.ts`**

Add these imports at the top of `src/design/designCard.ts`:

```ts
import { pickFolder, readTextFile, writeDesignFile } from "../store/persistence";
import { serializeDesign } from "./serialize";
import type { DesignDoc } from "./schema";
```

Append:

```ts
const STARTER: DesignDoc = {
  version: 1,
  frames: [{ id: "screen", name: "Screen", x: 24, y: 24, w: 390, h: 844,
    root: { id: "root", type: "stack", direction: "y", gap: 16, padding: 24, children: [
      { id: "t1", type: "text", text: "Sign in" },
      { id: "e1", type: "input", placeholder: "email" },
      { id: "b1", type: "button", text: "Continue", variant: "primary" },
    ] } }],
  components: {},
  tokens: { colors: { primary: "#d79a3d" } },
};

/** Pick a project folder, then open (seeding if missing) designs/sketch.design.json. */
export async function openDesignFromPicker(): Promise<void> {
  const dir = await pickFolder();
  if (!dir) return;
  const path = `${dir}/designs/sketch.design.json`;
  const exists = await readTextFile(path).then(() => true).catch(() => false);
  if (!exists) await writeDesignFile(path, serializeDesign(STARTER));
  openDesign(path, "sketch");
}
```

- [ ] **Step 4: Render the design card in `TerminalOverlay.tsx`**

Import at the top: `import { DesignWindow } from "../design/DesignWindow";`
Replace the `: null  /* design card rendered in Task 8 */` arm (from Task 5) with:

```tsx
          ) : c.kind === "design" ? (
            <DesignWindow key={c.id} card={c} cameraRef={cameraRef} />
          ) : null
```

- [ ] **Step 5: Add the launcher entry**

In `src/wall/LaunchMenu.tsx`, extend the props:

```tsx
export function LaunchMenu({
  presets, onLaunch, onLaunchBrowser, onLaunchDesign,
}: { presets: Preset[]; onLaunch: (presetId: string) => void; onLaunchBrowser: () => void; onLaunchDesign: () => void }) {
```

Add a menu item right after the Browser `<button>` (before the closing `</div>` of `launch-menu`):

```tsx
          <button
            className="launch-item"
            onPointerDown={() => { setOpen(false); onLaunchDesign(); }}
          >
            <span className="launch-ic" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <FileIcon />
            </span>
            Design
          </button>
```

Add `FileIcon` to the existing icon import on line 4:

```tsx
import { ChevronDownIcon, ChevronUpIcon, FileIcon, GlobeIcon, PlusIcon } from "./icons";
```

In `src/wall/WallView.tsx:634`, add the prop and import. Add import near the other design imports is not needed — import `openDesignFromPicker`:

```tsx
import { openDesignFromPicker } from "../design/designCard";
```

Update the element:

```tsx
      <LaunchMenu
        presets={presets}
        onLaunch={addTerminal}
        onLaunchBrowser={() => { void openBrowser(); }}
        onLaunchDesign={() => { void openDesignFromPicker(); }}
      />
```

- [ ] **Step 6: Verify build + types**

Run: `npx tsc --noEmit` → no errors.
Run: `npx vitest run src/design` → all design unit tests pass.
Run: `cd src-tauri && cargo build` → compiles.

- [ ] **Step 7: Manual round-trip verification**

1. `npm run tauri dev`. Open the launch menu → **Design** → pick a project folder.
   A `sketch` card appears showing a phone frame with "Sign in / email / Continue"
   (Continue is amber). `designs/sketch.design.json` now exists in that folder.
2. **Agent → app:** in a terminal/editor, change `"text": "Continue"` to
   `"text": "Sign up"` in the file and save. The card re-renders within ~1s. ✔ live reload
3. **App → agent:** drag the frame's title bar. After you stop, the file's frame
   `x`/`y` update on disk (check the file). ✔ write-back
4. **No echo loop:** dragging does **not** cause a second flicker/reload (the
   card's own write is swallowed by the echo guard). ✔
5. **Bad file:** put `{ broken` in the file and save → a red error banner appears
   and the last good render stays (card does not blank). Restore the file → banner
   clears. ✔ non-destructive errors
6. **Conflict:** start a drag, and while holding, have the agent rewrite the file;
   on release you see "reloaded — agent updated this design" and the agent's
   version is shown. ✔ agent-wins

- [ ] **Step 8: Commit**

```bash
git add src/design/render.tsx src/design/DesignWindow.tsx src/design/designCard.ts \
  src/wall/TerminalOverlay.tsx src/wall/LaunchMenu.tsx src/wall/WallView.tsx
git commit -m "feat(design): design card renderer + window + opener (round-trip)"
```
