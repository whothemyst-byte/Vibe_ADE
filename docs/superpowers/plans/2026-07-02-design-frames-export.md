# Design Page Frames & Export (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Frames become first-class artboards (nested layers tree, inline rename) with PNG/SVG export (canvas/selection/frame), copy-as-PNG, and a frame-aware agent handoff that references a rendered PNG beside the design JSON.

**Architecture:** Pure scope/collection logic lives in `exportScene.ts` (node-tested); rendering goes through Excalidraw's own `exportToBlob`/`exportToSvg`/`exportToClipboard` (all support `exportingFrame`); bytes land on disk via a new guarded Rust command `write_export_file` (mirrors the existing `thumb_save` `Vec<u8>` pattern), with the file picked through `@tauri-apps/plugin-dialog`'s `save()`.

**Tech Stack:** React 19, `@excalidraw/excalidraw` 0.18.x, Tauri v2 (`plugin-dialog` already installed), Rust (src-tauri), vitest (node env).

**Spec:** `docs/superpowers/specs/2026-07-02-design-page-figma-overhaul-design.md` (Phase 3 section).

## Global Constraints

- Repo root for all paths/commands: `vibe-space/`.
- `.vibe-design.json` stays **version 1, backward compatible**. Frame `name`/`frameId` are native serialized Excalidraw fields — no format change.
- vitest is **node env**, `src/**/*.test.ts` only — tested logic in pure `.ts` modules with no Excalidraw/React imports (structural types).
- Do NOT launch or restart the app (Claude runs inside it). TS gates: `npx vitest run` + `npx tsc --noEmit`. Rust gate: `cargo test write_export` (run from `src-tauri/`). The new Rust command only becomes live after the user restarts the app — say so in the final report.
- Hidden elements (`customData.vsHidden`) and deleted elements are excluded from every export.
- PNG exports include the canvas background; SVG exports are transparent.
- Export writes are guarded in Rust to `.png`/`.svg` extensions only (same defensive pattern as `write_design_file`'s `.design.json` guard).
- Match existing style: 2-space indent, double quotes, co-located `*.test.ts`.
- Commit after each task with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Rust `write_export_file` + TS wrapper

**Files:**
- Modify: `src-tauri/src/store/commands.rs` (new command + tests)
- Modify: `src-tauri/src/lib.rs` (register the command)
- Modify: `src/store/persistence.ts` (TS wrapper)

**Interfaces:**
- Consumes: existing `write_atomic(path: &Path, bytes: &[u8]) -> Result<()>` from `store/atomic.rs`.
- Produces: Rust command `write_export_file(path: String, bytes: Vec<u8>) -> Result<(), String>` (rejects non-`.png`/`.svg` paths); TS `writeExportFile(path: string, bytes: Uint8Array): Promise<void>` in `src/store/persistence.ts`. Used by Tasks 4, 6.

- [ ] **Step 1: Write the failing Rust tests**

In `src-tauri/src/store/commands.rs`, inside the existing `#[cfg(test)] mod tests` block (next to `read_rejects_non_design_paths`), add:

```rust
    #[test]
    fn export_writes_png_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("ui.design.hero.png");
        write_export_file(p.to_string_lossy().into_owned(), vec![1, 2, 3]).unwrap();
        assert_eq!(fs::read(&p).unwrap(), vec![1, 2, 3]);
    }

    #[test]
    fn export_rejects_non_image_paths() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("evil.txt");
        assert!(write_export_file(p.to_string_lossy().into_owned(), vec![1]).is_err());
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `src-tauri/`): `cargo test write_export`
Expected: compile error — `write_export_file` not found.

- [ ] **Step 3: Implement the command**

In `src-tauri/src/store/commands.rs`, directly after `write_design_file`:

```rust
/// Write an exported image (design page export / frame reference PNG).
/// Restricted to image extensions so the command can't clobber other files.
#[tauri::command]
pub fn write_export_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    if !(path.ends_with(".png") || path.ends_with(".svg")) {
        return Err("refusing to write a non-export file".to_string());
    }
    write_atomic(std::path::Path::new(&path), &bytes).map_err(|e| e.to_string())
}
```

In `src-tauri/src/lib.rs`, add to the `invoke_handler` list directly after `store::commands::write_design_file,`:

```rust
            store::commands::write_export_file,
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `src-tauri/`): `cargo test write_export`
Expected: 2 passed.

- [ ] **Step 5: Add the TS wrapper**

In `src/store/persistence.ts`, directly after `writeDesignFile`:

```ts
/** Write an exported PNG/SVG (design page export / frame reference). */
export function writeExportFile(path: string, bytes: Uint8Array): Promise<void> {
  return invoke("write_export_file", { path, bytes: Array.from(bytes) });
}
```

Run: `npx tsc --noEmit` — expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/store/commands.rs src-tauri/src/lib.rs src/store/persistence.ts
git commit -m "feat(design): guarded write_export_file command for PNG/SVG exports

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: `exportScene.ts` — scope detection + element collection; `framePngPath`

**Files:**
- Create: `src/design/exportScene.ts`
- Create: `src/design/exportScene.test.ts`
- Modify: `src/design/designFile.ts` (add `framePngPath`)
- Modify: `src/design/designFile.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `isHidden`, `El` from `./commitCore`.
- Produces (used by Tasks 4, 6):
  - `type ExportEl = El & { type: string; frameId?: string | null; name?: string | null }`
  - `type ExportScope = { kind: "canvas" } | { kind: "selection" } | { kind: "frame"; frameId: string }`
  - `detectScope(elements: readonly ExportEl[], selectedIds: Readonly<Record<string, boolean>>): ExportScope` — exactly one selected frame → frame scope; any selection → selection; else canvas
  - `collectExportElements(elements, scope, selectedIds): { elements: ExportEl[]; frame: ExportEl | null }` — excludes deleted + hidden; frame scope returns the frame + its children; selection scope includes children of selected frames
  - `slugify(name: string): string` — lowercase, non-alphanumerics → `-`, trimmed; `"frame"` when empty
  - In `designFile.ts`: `framePngPath(designPath: string, frameName: string | null): string` — `designs/ui.design.json` → `designs/ui.design.<slug>.png`

- [ ] **Step 1: Write the failing tests**

Create `src/design/exportScene.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { collectExportElements, detectScope, slugify, type ExportEl } from "./exportScene";

const el = (over: Partial<ExportEl> = {}): ExportEl => ({
  id: "a", type: "rectangle", version: 1, versionNonce: 1, updated: 1, opacity: 100, ...over,
});

const sel = (...ids: string[]) => Object.fromEntries(ids.map((i) => [i, true]));

describe("detectScope", () => {
  const els = [el({ id: "f", type: "frame" }), el({ id: "r" }), el({ id: "s" })];
  it("is canvas when nothing is selected", () => {
    expect(detectScope(els, {})).toEqual({ kind: "canvas" });
  });
  it("is frame when exactly one frame is selected", () => {
    expect(detectScope(els, sel("f"))).toEqual({ kind: "frame", frameId: "f" });
  });
  it("is selection otherwise", () => {
    expect(detectScope(els, sel("r"))).toEqual({ kind: "selection" });
    expect(detectScope(els, sel("f", "r"))).toEqual({ kind: "selection" });
  });
});

describe("collectExportElements", () => {
  const els = [
    el({ id: "f", type: "frame" }),
    el({ id: "in", frameId: "f" }),
    el({ id: "out" }),
    el({ id: "hid", customData: { vsHidden: true } }),
    el({ id: "del", isDeleted: true }),
  ];
  it("canvas: everything except hidden and deleted", () => {
    const r = collectExportElements(els, { kind: "canvas" }, {});
    expect(r.elements.map((e) => e.id)).toEqual(["f", "in", "out"]);
    expect(r.frame).toBeNull();
  });
  it("frame: the frame plus its children", () => {
    const r = collectExportElements(els, { kind: "frame", frameId: "f" }, {});
    expect(r.elements.map((e) => e.id)).toEqual(["f", "in"]);
    expect(r.frame!.id).toBe("f");
  });
  it("frame: hidden children are excluded", () => {
    const withHiddenChild = [...els, el({ id: "hin", frameId: "f", customData: { vsHidden: true } })];
    const r = collectExportElements(withHiddenChild, { kind: "frame", frameId: "f" }, {});
    expect(r.elements.map((e) => e.id)).toEqual(["f", "in"]);
  });
  it("selection: selected elements plus children of selected frames", () => {
    const r = collectExportElements(els, { kind: "selection" }, sel("f", "out"));
    expect(r.elements.map((e) => e.id)).toEqual(["f", "in", "out"]);
    expect(r.frame).toBeNull();
  });
});

describe("slugify", () => {
  it("kebab-cases arbitrary names", () => {
    expect(slugify("Hero Section v2!")).toBe("hero-section-v2");
  });
  it("falls back to 'frame' for empty input", () => {
    expect(slugify("")).toBe("frame");
    expect(slugify("  ??  ")).toBe("frame");
  });
});
```

Append to `src/design/designFile.test.ts` (add `framePngPath` to its import from `./designFile`):

```ts
describe("framePngPath", () => {
  it("derives the sibling PNG path from the design path", () => {
    expect(framePngPath("C:/proj/designs/ui.design.json", "Hero Section"))
      .toBe("C:/proj/designs/ui.design.hero-section.png");
  });
  it("uses the fallback slug for unnamed frames", () => {
    expect(framePngPath("/p/designs/ui.design.json", null))
      .toBe("/p/designs/ui.design.frame.png");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/design/exportScene.test.ts src/design/designFile.test.ts`
Expected: FAIL — cannot resolve `./exportScene`; `framePngPath` not exported.

- [ ] **Step 3: Write the implementation**

Create `src/design/exportScene.ts`:

```ts
/** Export scope + element collection. Pure — no framework imports. */
import { isHidden, type El } from "./commitCore";

export type ExportEl = El & {
  type: string;
  frameId?: string | null;
  name?: string | null;
};

export type ExportScope =
  | { kind: "canvas" }
  | { kind: "selection" }
  | { kind: "frame"; frameId: string };

const visible = (e: ExportEl) => e.isDeleted !== true && !isHidden(e);

export function detectScope(
  elements: readonly ExportEl[],
  selectedIds: Readonly<Record<string, boolean>>,
): ExportScope {
  const selected = elements.filter((e) => selectedIds[e.id] && e.isDeleted !== true);
  if (selected.length === 1 && selected[0].type === "frame") {
    return { kind: "frame", frameId: selected[0].id };
  }
  return selected.length > 0 ? { kind: "selection" } : { kind: "canvas" };
}

export function collectExportElements(
  elements: readonly ExportEl[],
  scope: ExportScope,
  selectedIds: Readonly<Record<string, boolean>>,
): { elements: ExportEl[]; frame: ExportEl | null } {
  if (scope.kind === "canvas") {
    return { elements: elements.filter(visible), frame: null };
  }
  if (scope.kind === "frame") {
    const frame = elements.find((e) => e.id === scope.frameId && visible(e)) ?? null;
    if (!frame) return { elements: [], frame: null };
    return {
      elements: elements.filter((e) => visible(e) && (e.id === frame.id || e.frameId === frame.id)),
      frame,
    };
  }
  const selectedFrameIds = new Set(
    elements.filter((e) => selectedIds[e.id] && e.type === "frame").map((e) => e.id),
  );
  return {
    elements: elements.filter(
      (e) => visible(e) && (selectedIds[e.id] || (e.frameId != null && selectedFrameIds.has(e.frameId))),
    ),
    frame: null,
  };
}

export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "frame";
}
```

In `src/design/designFile.ts`, add (with `import { slugify } from "./exportScene";` at the top):

```ts
/** PNG rendered beside the design file for a frame reference:
 *  designs/ui.design.json -> designs/ui.design.<slug>.png */
export function framePngPath(designPath: string, frameName: string | null): string {
  return designPath.replace(/\.json$/, `.${slugify(frameName ?? "")}.png`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/exportScene.test.ts src/design/designFile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/design/exportScene.ts src/design/exportScene.test.ts src/design/designFile.ts src/design/designFile.test.ts
git commit -m "feat(design): export scope detection + element collection + frame PNG path

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: Layers tree — frames as parents, children nested

**Files:**
- Modify: `src/design/designUtils.ts` (`labelForElement` learns frame names)
- Modify: `src/design/designUtils.test.ts` (frame label cases)
- Modify: `src/design/designStore.ts` (`StoreElement` + `LayerRow` + `selectLayers`/`layersEqual`)
- Modify: `src/design/designStore.test.ts` (nesting cases)
- Modify: `src/design/DesignRightPanel.tsx` (indent nested rows)

**Interfaces:**
- Consumes: existing selectors.
- Produces: `LayerRow` gains `depth: 0 | 1` and `isFrame: boolean`; `selectLayers` lists frames as top-level rows with their children nested directly beneath (both in reverse z-order); children whose frame is missing/deleted fall back to top level. `StoreElement` gains `frameId?: string | null` and `name?: string | null`. Used by Tasks 5.

- [ ] **Step 1: Write the failing tests**

In `src/design/designUtils.test.ts`, add inside the `labelForElement` describe:

```ts
  it("uses the frame's name for frames", () =>
    expect(labelForElement({ type: "frame", name: "Hero" })).toBe("Hero"));
  it("falls back to 'Frame' for unnamed frames", () => {
    expect(labelForElement({ type: "frame", name: null })).toBe("Frame");
    expect(labelForElement({ type: "frame", name: "  " })).toBe("Frame");
  });
```

In `src/design/designStore.test.ts`, add a describe block at the end:

```ts
describe("selectLayers with frames", () => {
  it("nests children under their frame, both in reverse z-order", () => {
    const s = snap({
      elements: [
        el({ id: "f", type: "frame", name: "Hero" }),
        el({ id: "c1", frameId: "f" }),
        el({ id: "c2", frameId: "f" }),
        el({ id: "solo" }),
      ],
    });
    const rows = selectLayers(s);
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ["solo", 0], ["f", 0], ["c2", 1], ["c1", 1],
    ]);
    expect(rows.find((r) => r.id === "f")!.isFrame).toBe(true);
    expect(rows.find((r) => r.id === "f")!.label).toBe("Hero");
  });
  it("orphaned children (frame missing) fall back to top level", () => {
    const s = snap({ elements: [el({ id: "c", frameId: "gone" })] });
    expect(selectLayers(s).map((r) => [r.id, r.depth])).toEqual([["c", 0]]);
  });
  it("layersEqual notices depth changes", () => {
    const flat = snap({ elements: [el({ id: "f", type: "frame" }), el({ id: "c" })] });
    const nested = snap({ elements: [el({ id: "f", type: "frame" }), el({ id: "c", frameId: "f" })] });
    expect(layersEqual(selectLayers(flat), selectLayers(nested))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/design/designUtils.test.ts src/design/designStore.test.ts`
Expected: FAIL — frame label is "Frame"→got "Frame"? No: `labelForElement({type:"frame"})` currently capitalizes to `"Frame"` so the *name* case fails ("Hero" expected); `depth`/`isFrame` are undefined.

- [ ] **Step 3: Write the implementation**

In `src/design/designUtils.ts`, replace `labelForElement` with:

```ts
export function labelForElement(el: { type: string; text?: string; name?: string | null }): string {
  if (el.type === "frame" || el.type === "magicframe") {
    return el.name?.trim() || "Frame";
  }
  if (el.type === "text") {
    const t = (el.text ?? "").trim();
    if (!t) return '"…"';
    const snippet = t.slice(0, 18);
    return `"${snippet}${t.length > 18 ? "…" : ""}"`;
  }
  return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}
```

In `src/design/designStore.ts`:

1. `StoreElement` gains two fields (after `groupIds`):

```ts
  frameId?: string | null;
  name?: string | null;
```

2. `LayerRow` gains:

```ts
  depth: 0 | 1;
  isFrame: boolean;
```

3. Replace `selectLayers` with:

```ts
export function selectLayers(s: DesignSnapshot): LayerRow[] {
  const frameIds = new Set(
    s.elements.filter((e) => e.type === "frame" && e.isDeleted !== true).map((e) => e.id),
  );
  const childrenOf = new Map<string, StoreElement[]>();
  for (const el of s.elements) {
    if (el.isDeleted === true) continue;
    if (el.frameId != null && frameIds.has(el.frameId)) {
      const list = childrenOf.get(el.frameId);
      if (list) list.push(el); else childrenOf.set(el.frameId, [el]);
    }
  }
  const row = (el: StoreElement, depth: 0 | 1): LayerRow => ({
    id: el.id,
    type: el.type,
    label: labelForElement(el as { type: string; text?: string; name?: string | null }),
    hidden: isHidden(el),
    locked: el.locked === true,
    selected: s.selectedIds[el.id] === true,
    depth,
    isFrame: el.type === "frame",
  });
  const rows: LayerRow[] = [];
  for (let i = s.elements.length - 1; i >= 0; i--) {
    const el = s.elements[i];
    if (el.isDeleted === true) continue;
    if (el.frameId != null && frameIds.has(el.frameId)) continue; // rendered under its frame
    rows.push(row(el, 0));
    if (el.type === "frame") {
      const kids = childrenOf.get(el.id) ?? [];
      for (let k = kids.length - 1; k >= 0; k--) rows.push(row(kids[k], 1));
    }
  }
  return rows;
}
```

4. In `layersEqual`, extend the field comparison with:

```ts
        x.depth !== y.depth || x.isFrame !== y.isFrame ||
```

(added to the existing `if (...) return false;` condition alongside the other fields.)

In `src/design/DesignRightPanel.tsx`, indent nested rows — on the layer row div, add a style:

```tsx
              style={row.depth ? { paddingLeft: 14 } : undefined}
```

(directly after the `className` on the `.design-layer-row` div.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/design/designUtils.test.ts src/design/designStore.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/design/designUtils.ts src/design/designUtils.test.ts src/design/designStore.ts src/design/designStore.test.ts src/design/DesignRightPanel.tsx
git commit -m "feat(design): frames as parents in the layers tree

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 4: `renderExport.ts` + `DesignExportMenu.tsx` — PNG/SVG/copy export UI

**Files:**
- Create: `src/design/renderExport.ts` (thin Excalidraw wrappers, no unit test)
- Create: `src/design/DesignExportMenu.tsx`
- Modify: `src/design/DesignTopBar.tsx` (mount the menu; new `onToast` prop)
- Modify: `src/design/DesignPage.tsx` (pass `flash` as `onToast`)
- Modify: `src/App.css` (menu styles)

**Interfaces:**
- Consumes: `collectExportElements`/`detectScope`/`slugify`/`ExportEl` (Task 2), `writeExportFile` (Task 1), `save` from `@tauri-apps/plugin-dialog`, `exportToBlob`/`exportToSvg`/`exportToClipboard` from `@excalidraw/excalidraw`.
- Produces (Task 6 reuses `renderPngBytes`):
  - `renderPngBytes(api, elements: readonly ExportEl[], frame: ExportEl | null): Promise<Uint8Array>` — PNG with canvas background
  - `renderSvgText(api, elements: readonly ExportEl[], frame: ExportEl | null): Promise<string>` — transparent SVG markup
  - `copyPng(api, elements, frame): Promise<void>`
  - `<DesignExportMenu store={...} apiRef={...} onToast={(msg) => void} />` — "Export" button + dropdown (PNG / SVG / Copy PNG) with automatic scope (frame → selection → canvas)
- `DesignTopBar` props gain `onToast: (msg: string) => void`.

- [ ] **Step 1: Create `src/design/renderExport.ts`**

```ts
/** Rendering wrappers over Excalidraw's export utils. PNG includes the
 *  canvas background; SVG is transparent. */
import { exportToBlob, exportToSvg, exportToClipboard } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, ExcalidrawFrameLikeElement, NonDeleted } from "@excalidraw/excalidraw/element/types";
import type { ExportEl } from "./exportScene";

function baseOpts(api: ExcalidrawImperativeAPI, elements: readonly ExportEl[], frame: ExportEl | null) {
  return {
    elements: elements as unknown as readonly NonDeleted<ExcalidrawElement>[],
    files: api.getFiles(),
    exportingFrame: (frame ?? null) as ExcalidrawFrameLikeElement | null,
    exportPadding: frame ? 0 : 16,
  };
}

export async function renderPngBytes(
  api: ExcalidrawImperativeAPI,
  elements: readonly ExportEl[],
  frame: ExportEl | null,
): Promise<Uint8Array> {
  const blob = await exportToBlob({
    ...baseOpts(api, elements, frame),
    mimeType: "image/png",
    appState: {
      exportBackground: true,
      viewBackgroundColor: api.getAppState().viewBackgroundColor,
    },
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function renderSvgText(
  api: ExcalidrawImperativeAPI,
  elements: readonly ExportEl[],
  frame: ExportEl | null,
): Promise<string> {
  const svg = await exportToSvg({
    ...baseOpts(api, elements, frame),
    appState: { exportBackground: false },
  });
  return new XMLSerializer().serializeToString(svg);
}

export async function copyPng(
  api: ExcalidrawImperativeAPI,
  elements: readonly ExportEl[],
  frame: ExportEl | null,
): Promise<void> {
  await exportToClipboard({
    ...baseOpts(api, elements, frame),
    type: "png",
    appState: {
      exportBackground: true,
      viewBackgroundColor: api.getAppState().viewBackgroundColor,
    },
  });
}
```

(If tsc flags `exportToClipboard`'s option names, check `node_modules/@excalidraw/excalidraw/dist/types/utils/export.d.ts` and match — do not cast to `any`.)

- [ ] **Step 2: Create `src/design/DesignExportMenu.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { writeExportFile } from "../store/persistence";
import { collectExportElements, detectScope, slugify, type ExportEl, type ExportScope } from "./exportScene";
import { renderPngBytes, renderSvgText, copyPng } from "./renderExport";
import type { DesignStore } from "./designStore";

const scopeLabel = (s: ExportScope, frameName: string | null) =>
  s.kind === "canvas" ? "whole canvas"
  : s.kind === "selection" ? "selection"
  : `frame · ${frameName?.trim() || "Frame"}`;

export function DesignExportMenu({ store, apiRef, onToast }: {
  store: DesignStore;
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>;
  onToast: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  function collect() {
    const s = store.get();
    const els = s.elements as unknown as readonly ExportEl[];
    const scope = detectScope(els, s.selectedIds);
    return { scope, ...collectExportElements(els, scope, s.selectedIds) };
  }

  async function run(kind: "png" | "svg" | "copy") {
    setOpen(false);
    const api = apiRef.current;
    if (!api) return;
    const { scope, elements, frame } = collect();
    if (!elements.length) { onToast("nothing to export"); return; }
    const name = frame ? slugify(frame.name ?? "") : "ui-design";
    try {
      if (kind === "copy") {
        await copyPng(api, elements, frame);
        onToast("PNG copied to clipboard");
        return;
      }
      const ext = kind;
      const path = await save({
        defaultPath: `${name}.${ext}`,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      if (!path) return;
      const bytes = kind === "png"
        ? await renderPngBytes(api, elements, frame)
        : new TextEncoder().encode(await renderSvgText(api, elements, frame));
      await writeExportFile(path, bytes);
      onToast(`exported ${path.split(/[\\/]/).pop()} (${scopeLabel(scope, frame?.name ?? null)})`);
    } catch (e) {
      onToast(`export failed: ${String(e)}`);
    }
  }

  const { scope, frame } = open ? collect() : { scope: null, frame: null };

  return (
    <div className="design-export" ref={rootRef}>
      <button className="cnvs-btn" onClick={() => setOpen((v) => !v)} title="Export as image">
        Export
      </button>
      {open && scope && (
        <div className="design-export-menu">
          <div className="design-export-scope">{scopeLabel(scope, frame?.name ?? null)}</div>
          <button className="design-export-item" onClick={() => void run("png")}>PNG</button>
          <button className="design-export-item" onClick={() => void run("svg")}>SVG</button>
          <button className="design-export-item" onClick={() => void run("copy")}>Copy PNG</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Mount in `src/design/DesignTopBar.tsx`**

Add the prop `onToast: (msg: string) => void` to `DesignTopBar`'s props type, add the import `import { DesignExportMenu } from "./DesignExportMenu";`, and render directly before the `@ Reference in terminal` button:

```tsx
      <DesignExportMenu store={store} apiRef={apiRef} onToast={onToast} />
```

In `src/design/DesignPage.tsx`, pass it:

```tsx
      <DesignTopBar store={storeRef.current} apiRef={apiRef} onBack={handleBack} onReference={() => void reference()} onToast={flash} />
```

- [ ] **Step 4: Append to `src/App.css`** (after the `.design-shortcuts-*` rules)

```css
.design-export { position: relative; }
.design-export-menu { position: absolute; top: 30px; right: 0; z-index: 45; min-width: 150px; display: flex; flex-direction: column; background: var(--glass); backdrop-filter: blur(14px); border: 1px solid var(--rule); border-radius: var(--radius-sm); box-shadow: var(--shadow); padding: 4px; }
.design-export-scope { font: 500 10px var(--font-mono); color: var(--text-faint); text-transform: uppercase; padding: 4px 8px 6px; }
.design-export-item { text-align: left; background: transparent; border: none; color: var(--text); cursor: pointer; font: 400 12px var(--font-ui); padding: 5px 8px; border-radius: var(--radius-sm); }
.design-export-item:hover { background: rgba(243,238,229,.06); }
```

(If `--text-faint` doesn't exist in `:root`, use `var(--text-muted)`.)

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — expected: no errors.
Run: `npx vitest run` — expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/design/renderExport.ts src/design/DesignExportMenu.tsx src/design/DesignTopBar.tsx src/design/DesignPage.tsx src/App.css
git commit -m "feat(design): PNG/SVG export + copy-as-PNG with automatic scope

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 5: Inline frame rename in the layers panel

**Files:**
- Modify: `src/design/DesignRightPanel.tsx`
- Modify: `src/App.css` (rename input style)

**Interfaces:**
- Consumes: `LayerRow.isFrame` (Task 3), `commitPatches` (Phase 1).
- Produces: double-clicking a frame row's name swaps it for an input; Enter/blur commits `{ name }` (empty → `null`, so the label falls back to "Frame"); Escape cancels. Renaming on the canvas itself is Excalidraw-native (double-click the frame's label) and needs no code.

- [ ] **Step 1: Add rename state + handler to `DesignRightPanel`**

Inside the `DesignRightPanel` component body (after `const [opDraft, ...]`):

```tsx
  const [renamingId, setRenamingId] = useState<string | null>(null);
```

Add next to `toggleHidden`:

```tsx
  function commitRename(id: string, raw: string) {
    const name = raw.trim();
    commitOne(id, { name: name || null });
    setRenamingId(null);
  }
```

- [ ] **Step 2: Swap the name span when renaming**

Replace the layer row's name span (`<span className="design-layer-name">{row.label}</span>`) with:

```tsx
              {renamingId === row.id ? (
                <input
                  className="design-layer-rename"
                  autoFocus
                  defaultValue={(store.get().elements.find((e) => e.id === row.id)?.name as string | null) ?? ""}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => commitRename(row.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") { setRenamingId(null); e.stopPropagation(); }
                  }}
                />
              ) : (
                <span
                  className="design-layer-name"
                  onDoubleClick={(e) => {
                    if (!row.isFrame) return;
                    e.stopPropagation();
                    setRenamingId(row.id);
                  }}
                >
                  {row.label}
                </span>
              )}
```

- [ ] **Step 3: Append to `src/App.css`** (after the `.design-export-item:hover` rule)

```css
.design-layer-rename { flex: 1; min-width: 0; background: transparent; border: 1px solid var(--rule); border-radius: var(--radius-sm); color: var(--text); font: 400 12px var(--font-ui); padding: 1px 4px; }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — expected: no errors.
Run: `npx vitest run` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/design/DesignRightPanel.tsx src/App.css
git commit -m "feat(design): inline frame rename in the layers panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 6: Frame-aware "Reference in terminal" with rendered PNG

**Files:**
- Modify: `src/design/reference.ts` (accept multiple paths)
- Modify: `src/design/DesignPage.tsx` (`reference()` renders the selected frame's PNG)

**Interfaces:**
- Consumes: `detectScope`/`collectExportElements`/`ExportEl` (Task 2), `framePngPath` (Task 2), `renderPngBytes` (Task 4), `writeExportFile` (Task 1).
- Produces: `referenceInActiveTerminal(paths: string[]): Promise<"sent" | "copied">`. When exactly one frame is selected, `reference()` renders it to `designs/ui.design.<slug>.png` and references both the JSON and the PNG; PNG render failures fall back silently to the JSON-only reference.

- [ ] **Step 1: Generalize `src/design/reference.ts`**

Replace the whole file with:

```ts
import { getLastFocusedTerminalId, sendToSession } from "../wall/sessions";
import { formatReference } from "./designFile";

/** Insert @-references into the focused terminal; if there is no live focused
 *  terminal, copy the raw paths to the clipboard instead. Returns which path
 *  was taken so the caller can toast appropriately. */
export async function referenceInActiveTerminal(paths: string[]): Promise<"sent" | "copied"> {
  const id = getLastFocusedTerminalId();
  const text = paths.map(formatReference).join("");
  if (id && sendToSession(id, text, false)) return "sent";
  await navigator.clipboard.writeText(paths.join(" ")).catch(() => {});
  return "copied";
}
```

- [ ] **Step 2: Frame-aware `reference()` in `src/design/DesignPage.tsx`**

Add imports:

```ts
import { framePngPath } from "./designFile";
import { detectScope, collectExportElements, type ExportEl } from "./exportScene";
import { renderPngBytes } from "./renderExport";
import { writeExportFile } from "../store/persistence";
```

(`resolveDesignPath, ensureDesignFile` are already imported from `./designFile` — extend that import instead of duplicating it. Same for the `../store/persistence` import line.)

Replace the `reference` function with:

```ts
  /** Reference the design file in the focused terminal; when exactly one
   *  frame is selected, also render it to a PNG beside the JSON so the agent
   *  gets the visual too. PNG failures fall back to the JSON-only reference. */
  async function reference() {
    const path = pathRef.current;
    if (!path) return;
    const paths = [path];
    const api = apiRef.current;
    const s = storeRef.current.get();
    const els = s.elements as unknown as readonly ExportEl[];
    const scope = detectScope(els, s.selectedIds);
    if (scope.kind === "frame" && api) {
      try {
        const { elements, frame } = collectExportElements(els, scope, s.selectedIds);
        if (frame && elements.length) {
          const png = framePngPath(path, frame.name ?? null);
          await writeExportFile(png, await renderPngBytes(api, elements, frame));
          paths.push(png);
        }
      } catch { /* json-only reference is still useful */ }
    }
    const how = await referenceInActiveTerminal(paths);
    flash(how === "sent"
      ? paths.length > 1 ? "frame PNG + design added to the terminal" : "added to the focused terminal"
      : "no terminal focused — path copied");
  }
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — expected: no errors.
Run: `npx vitest run` — expected: PASS (full suite).

- [ ] **Step 4: Commit**

```bash
git add src/design/reference.ts src/design/DesignPage.tsx
git commit -m "feat(design): frame-aware terminal reference with rendered PNG

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Phase 3 acceptance (from the spec)

Testable items verified by the implementer; visual/runtime items by the user after an app restart (the new Rust command requires the restart — never restart the app yourself):

- Frames are top-level nodes in the layers tree with children nested; inline rename in the panel; canvas double-click rename is Excalidraw-native (Tasks 3, 5).
- PNG and SVG export for whole canvas / selection / single frame via the Tauri save dialog; copy-as-PNG to clipboard; hidden elements excluded; PNG has background, SVG transparent (Tasks 1, 2, 4).
- "Reference in terminal" with a frame selected writes `designs/ui.design.<slug>.png` and references both files (Task 6).
- File format unchanged; export writes are extension-guarded in Rust (Task 1).
