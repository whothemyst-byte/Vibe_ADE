# Vibe Space UI Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-space, full-page Excalidraw "UI canvas" opened from a new wall-toolbar icon, backed by one clean file in the space folder that terminal agents can read and edit live.

**Architecture:** A new top-level `design` view in `App.tsx` (parallel to `tasks`) renders `DesignPage.tsx`, a full-page Excalidraw editor for the current space. The scene persists to `<space folder>/designs/ui.design.json` as a normalized, pretty-printed JSON. A Tauri fs-watcher (already built) reloads the page when an agent edits the file; visual edits debounce-write it back, guarded against echo loops. Because wall terminals run with `cwd` = the space folder, any agent in the space already sees that file.

**Tech Stack:** React + TypeScript, Zustand, `@excalidraw/excalidraw` ^0.18.1 (already a dependency), Tauri v2 (existing `write_design_file` + `design_watch` Rust commands), Vitest.

## Global Constraints

- Reuse the existing, committed bridge infra unchanged: `src/design/echoGuard.ts`, `src/design/watch.ts`, the Rust `write_design_file` command, and `design_watch`/`design_unwatch`. Do NOT modify the Rust backend.
- The design file path MUST end in `.design.json` (the Rust `write_design_file` command rejects any other extension).
- One UI per space. No design picker, no tabs, no wall card.
- Brand: Quansynd warm amber (`#d79a3d`), warm neutral dark surfaces (e.g. `#0e0c0a`). NOT blue.
- Persisted JSON must be deterministic (stable field handling, pretty-printed) so agent diffs stay clean.
- Follow the repo's co-located `*.test.ts` Vitest convention. Pure logic is unit-tested; Excalidraw/fs-watcher interactions are verified manually via the run flow.
- TypeScript must pass (`npx tsc --noEmit` via the project's typecheck) and the full test suite must stay green after every task.

---

### Task 1: Remove the rejected node-tree card approach

Removes the obsolete "design card on the wall" code so the design becomes a page, not a card. Keeps the approach-agnostic bridge infra (`echoGuard.ts`, `watch.ts`, Rust commands). This is a deletion/cleanup task verified by typecheck + tests, not TDD.

**Files:**
- Modify: `src/wall/cardStore.ts` (remove `DesignCard`)
- Modify: `src/wall/TerminalOverlay.tsx:7,34` (remove `DesignWindow` render branch)
- Modify: `src/wall/LaunchMenu.tsx:8-9,43-48` (remove `onLaunchDesign` + "Design" item)
- Modify: `src/wall/WallView.tsx:24,639` (remove `openDesignFromPicker` import + usage)
- Delete: `src/design/DesignWindow.tsx`, `src/design/render.tsx`, `src/design/style.ts`, `src/design/style.test.ts`, `src/design/schema.ts`, `src/design/schema.test.ts`, `src/design/serialize.ts`, `src/design/serialize.test.ts`, `src/design/designCard.ts`, `src/design/designCard.test.ts`
- Keep (do not touch): `src/design/echoGuard.ts`, `src/design/echoGuard.test.ts`, `src/design/watch.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a `Card` union that is `TerminalCard | BrowserCard | FileCard` (the `design` kind is gone). `src/design/` now contains only `echoGuard.*` and `watch.ts`.

- [ ] **Step 1: Remove `DesignCard` from `src/wall/cardStore.ts`**

Delete the `DesignCard` type block (lines 38-48), remove `DesignCard` from the `Card` union (line 50), and remove the `| Partial<Omit<DesignCard, "kind" | "id">>` line from the `update` signature (line 67). Result:

```typescript
export type Card = TerminalCard | BrowserCard | FileCard;
```
```typescript
  update: (
    id: string,
    patch:
      | Partial<Omit<TerminalCard, "kind" | "id">>
      | Partial<Omit<BrowserCard, "kind" | "id">>
      | Partial<Omit<FileCard, "kind" | "id">>
  ) => void;
```

- [ ] **Step 2: Remove the design branch from `src/wall/TerminalOverlay.tsx`**

Delete the import on line 7 (`import { DesignWindow } from "../design/DesignWindow";`) and the render branch on line 34 (the `<DesignWindow .../>` case for `c.kind === "design"`). Leave the terminal/browser/file branches untouched.

- [ ] **Step 3: Remove the Design launcher from `src/wall/LaunchMenu.tsx`**

Remove the `onLaunchDesign` parameter from the props (lines 8-9) and delete the "Design" menu `<button>` (lines 43-48). The remaining launch items (terminals + browser) stay.

- [ ] **Step 4: Remove the design wiring from `src/wall/WallView.tsx`**

Delete the import on line 24 (`import { openDesignFromPicker } from "../design/designCard";`) and delete the `onLaunchDesign={() => { void openDesignFromPicker(); }}` prop on the `<LaunchMenu .../>` at line 639.

- [ ] **Step 5: Delete the obsolete files**

```bash
git rm src/design/DesignWindow.tsx src/design/render.tsx src/design/style.ts src/design/style.test.ts src/design/schema.ts src/design/schema.test.ts src/design/serialize.ts src/design/serialize.test.ts src/design/designCard.ts src/design/designCard.test.ts
```

- [ ] **Step 6: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck passes (no references to the deleted modules remain); all tests pass. `src/design/echoGuard.test.ts` still runs green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(design): remove rejected node-tree card; keep bridge infra"
```



### Task 2: `normalize.ts` — deterministic Excalidraw scene serialize/parse

The pure heart of the agent bridge: turn an Excalidraw scene into clean, stable JSON and back. Strips per-edit volatile fields so a no-op produces byte-identical output (clean diffs + the echo-guard works). No Excalidraw import here — elements are treated as plain records so this stays fast and unit-testable. `DesignPage` (Task 5) passes real `ExcalidrawElement[]` in and runs the parsed elements through Excalidraw's `restoreElements` on load.

**Files:**
- Create: `src/design/normalize.ts`
- Test: `src/design/normalize.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SceneElement = Record<string, unknown>`
  - `const DEFAULT_BG = "#0e0c0a"`
  - `serializeScene(elements: readonly SceneElement[], viewBackgroundColor: string): string`
  - `parseScene(text: string): { ok: true; elements: SceneElement[]; viewBackgroundColor: string } | { ok: false; error: string }`
  - `emptySceneJson(viewBackgroundColor?: string): string`

- [ ] **Step 1: Write the failing test**

Create `src/design/normalize.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { serializeScene, parseScene, emptySceneJson, DEFAULT_BG, type SceneElement } from "./normalize";

const rect = (over: Partial<SceneElement> = {}): SceneElement => ({
  id: "r1", type: "rectangle", x: 10, y: 20, width: 100, height: 40,
  strokeColor: "#d79a3d", backgroundColor: "transparent",
  seed: 12345, version: 7, versionNonce: 98765, updated: 1700000000000,
  ...over,
});

describe("serializeScene", () => {
  it("strips per-edit volatile fields but keeps semantic ones", () => {
    const out = serializeScene([rect()], DEFAULT_BG);
    const parsed = JSON.parse(out);
    const el = parsed.elements[0];
    expect(el.seed).toBeUndefined();
    expect(el.version).toBeUndefined();
    expect(el.versionNonce).toBeUndefined();
    expect(el.updated).toBeUndefined();
    expect(el.id).toBe("r1");
    expect(el.x).toBe(10);
    expect(el.strokeColor).toBe("#d79a3d");
  });

  it("drops deleted elements", () => {
    const out = serializeScene([rect(), rect({ id: "gone", isDeleted: true })], DEFAULT_BG);
    expect(JSON.parse(out).elements.map((e: SceneElement) => e.id)).toEqual(["r1"]);
  });

  it("is pretty-printed, version-tagged, and newline-terminated", () => {
    const out = serializeScene([rect()], DEFAULT_BG);
    expect(out.endsWith("\n")).toBe(true);
    expect(out).toContain("\n  "); // 2-space indent
    expect(JSON.parse(out).version).toBe(1);
    expect(JSON.parse(out).appState.viewBackgroundColor).toBe(DEFAULT_BG);
  });

  it("preserves element order and is idempotent across a round-trip", () => {
    const first = serializeScene([rect({ id: "a" }), rect({ id: "b" })], DEFAULT_BG);
    const round = parseScene(first);
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    const second = serializeScene(round.elements, round.viewBackgroundColor);
    expect(second).toBe(first);
    expect(round.elements.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("parseScene", () => {
  it("rejects malformed JSON", () => {
    const res = parseScene("{ not json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/json|parse|unexpected/i);
  });

  it("rejects a scene missing an elements array", () => {
    const res = parseScene(JSON.stringify({ version: 1, appState: {} }));
    expect(res.ok).toBe(false);
  });

  it("defaults the background when absent", () => {
    const res = parseScene(JSON.stringify({ version: 1, elements: [] }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.viewBackgroundColor).toBe(DEFAULT_BG);
  });
});

describe("emptySceneJson", () => {
  it("round-trips to an empty element list", () => {
    const res = parseScene(emptySceneJson());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.elements).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/normalize.test.ts`
Expected: FAIL — `normalize.ts` does not exist / exports undefined.

- [ ] **Step 3: Write minimal implementation**

Create `src/design/normalize.ts`:

```typescript
export type SceneElement = Record<string, unknown>;

export const DEFAULT_BG = "#0e0c0a";

/** Fields Excalidraw bumps on every edit; stripped so diffs and echo-hashing
 *  are stable. Excalidraw's restoreElements regenerates them on load. */
const STRIP_FIELDS = ["version", "versionNonce", "updated", "seed"] as const;

function stripElement(el: SceneElement): SceneElement {
  const out: SceneElement = {};
  for (const k of Object.keys(el)) {
    if ((STRIP_FIELDS as readonly string[]).includes(k)) continue;
    out[k] = el[k];
  }
  return out;
}

/** Excalidraw scene -> clean, stable, pretty JSON. Element array order (the
 *  z-order) is preserved; only deleted elements are dropped. */
export function serializeScene(
  elements: readonly SceneElement[],
  viewBackgroundColor: string,
): string {
  const kept = elements
    .filter((e) => e.isDeleted !== true)
    .map(stripElement);
  const scene = { version: 1, elements: kept, appState: { viewBackgroundColor } };
  return JSON.stringify(scene, null, 2) + "\n";
}

export type ParsedScene =
  | { ok: true; elements: SceneElement[]; viewBackgroundColor: string }
  | { ok: false; error: string };

export function parseScene(text: string): ParsedScene {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid JSON" };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "scene is not an object" };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.elements)) {
    return { ok: false, error: "scene is missing an `elements` array" };
  }
  const appState = (obj.appState ?? {}) as Record<string, unknown>;
  const bg = typeof appState.viewBackgroundColor === "string"
    ? appState.viewBackgroundColor
    : DEFAULT_BG;
  return { ok: true, elements: obj.elements as SceneElement[], viewBackgroundColor: bg };
}

export function emptySceneJson(viewBackgroundColor: string = DEFAULT_BG): string {
  return serializeScene([], viewBackgroundColor);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/design/normalize.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/design/normalize.ts src/design/normalize.test.ts
git commit -m "feat(design): deterministic Excalidraw scene normalize (serialize/parse)"
```



### Task 3: `designFile.ts` — the per-space design file path + seeding

Resolves the one well-known file for a space and seeds an empty scene so the Rust watcher (which watches the file's parent dir) has a `designs/` directory to watch. The path-building is pure and tested; the I/O helpers are thin wrappers over existing persistence functions.

**Files:**
- Create: `src/design/designFile.ts`
- Test: `src/design/designFile.test.ts`

**Interfaces:**
- Consumes: `loadIndex`, `readTextFile`, `writeDesignFile` from `src/store/persistence.ts`; `emptySceneJson` from `./normalize`.
- Produces:
  - `const DESIGN_REL = "designs/ui.design.json"`
  - `designPath(spaceFolder: string): string`
  - `resolveDesignPath(wallId: string): Promise<string | null>`
  - `ensureDesignFile(path: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/design/designFile.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { designPath, DESIGN_REL } from "./designFile";

describe("designPath", () => {
  it("joins the space folder with the well-known relative path", () => {
    expect(designPath("C:/Users/me/proj")).toBe(`C:/Users/me/proj/${DESIGN_REL}`);
  });

  it("trims a trailing slash on the folder", () => {
    expect(designPath("C:/Users/me/proj/")).toBe(`C:/Users/me/proj/${DESIGN_REL}`);
  });

  it("trims a trailing backslash on the folder", () => {
    expect(designPath("C:\\Users\\me\\proj\\")).toBe(`C:\\Users\\me\\proj/${DESIGN_REL}`);
  });

  it("ends in .design.json (required by the Rust write command)", () => {
    expect(designPath("C:/x").endsWith(".design.json")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/designFile.test.ts`
Expected: FAIL — `designFile.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/design/designFile.ts`:

```typescript
import { loadIndex, readTextFile, writeDesignFile } from "../store/persistence";
import { emptySceneJson } from "./normalize";

/** One UI per space: a single well-known file under the space's project folder. */
export const DESIGN_REL = "designs/ui.design.json";

/** Absolute path of a space folder's UI design file. */
export function designPath(spaceFolder: string): string {
  const base = spaceFolder.replace(/[/\\]+$/, "");
  return `${base}/${DESIGN_REL}`;
}

/** Resolve the design file path for a space id; null if the space is unknown. */
export async function resolveDesignPath(wallId: string): Promise<string | null> {
  const index = await loadIndex();
  const folder = index.find((w) => w.id === wallId)?.path;
  return folder ? designPath(folder) : null;
}

/** Ensure the file (and its parent `designs/` dir) exists before watching it.
 *  writeDesignFile creates parent directories. */
export async function ensureDesignFile(path: string): Promise<void> {
  const exists = await readTextFile(path).then(() => true).catch(() => false);
  if (!exists) await writeDesignFile(path, emptySceneJson());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/design/designFile.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/design/designFile.ts src/design/designFile.test.ts
git commit -m "feat(design): per-space design file path + empty-scene seeding"
```



### Task 4: Reference-in-terminal plumbing

Lets the design page insert an `@<path>` reference into the terminal the user most recently focused, falling back to the clipboard. `formatReference` is pure and tested; the session targeting is a thin wrapper over the existing `sendToSession`. The last-focused id is tracked in `sessions.ts` where focus already flows through `focusSession`.

**Files:**
- Modify: `src/design/designFile.ts` (add `formatReference`)
- Modify: `src/design/designFile.test.ts` (add `formatReference` cases)
- Modify: `src/wall/sessions.ts` (track + expose last-focused terminal id)
- Create: `src/design/reference.ts`

**Interfaces:**
- Consumes: `sendToSession` (`(id: string, text: string, submit: boolean) => boolean`) from `src/wall/sessions.ts`.
- Produces:
  - `formatReference(path: string): string` (in `designFile.ts`) → `"@" + path + " "`
  - `getLastFocusedTerminalId(): string | null` (in `sessions.ts`)
  - `referenceInActiveTerminal(path: string): Promise<"sent" | "copied">` (in `reference.ts`)

- [ ] **Step 1: Add the failing `formatReference` test**

Append to `src/design/designFile.test.ts`:

```typescript
import { formatReference } from "./designFile";

describe("formatReference", () => {
  it("prefixes @ and adds a trailing space so the agent's file mention parses", () => {
    expect(formatReference("C:/proj/designs/ui.design.json")).toBe("@C:/proj/designs/ui.design.json ");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/design/designFile.test.ts`
Expected: FAIL — `formatReference` is not exported.

- [ ] **Step 3: Add `formatReference` to `src/design/designFile.ts`**

Append:

```typescript
/** The text inserted into a terminal to point an agent at the design file.
 *  Submitted as a non-final paste so the user can review before sending. */
export function formatReference(path: string): string {
  return `@${path} `;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/design/designFile.test.ts`
Expected: PASS.

- [ ] **Step 5: Track the last-focused terminal in `src/wall/sessions.ts`**

Add a module-level variable next to `const sessions = new Map(...)` (around line 28):

```typescript
let lastFocusedTerminalId: string | null = null;
```

Set it inside `focusSession` (around line 203):

```typescript
/** Moves keyboard focus into a terminal's xterm so keystrokes go there. */
export function focusSession(id: string): void {
  lastFocusedTerminalId = id;
  sessions.get(id)?.term.focus();
}
```

Add the getter (place it after `focusSession`):

```typescript
/** The terminal the user most recently focused, if it still has a live session.
 *  Used to target the design page's "reference in terminal" action. */
export function getLastFocusedTerminalId(): string | null {
  return lastFocusedTerminalId && sessions.has(lastFocusedTerminalId)
    ? lastFocusedTerminalId
    : null;
}
```

(No change needed in `destroySession`: the getter's `sessions.has` check invalidates a stale id automatically.)

- [ ] **Step 6: Create `src/design/reference.ts`**

```typescript
import { getLastFocusedTerminalId, sendToSession } from "../wall/sessions";
import { formatReference } from "./designFile";

/** Insert an @-reference to the design file into the focused terminal; if there
 *  is no live focused terminal, copy the raw path to the clipboard instead.
 *  Returns which path was taken so the caller can toast appropriately. */
export async function referenceInActiveTerminal(path: string): Promise<"sent" | "copied"> {
  const id = getLastFocusedTerminalId();
  if (id && sendToSession(id, formatReference(path), false)) return "sent";
  await navigator.clipboard.writeText(path).catch(() => {});
  return "copied";
}
```

- [ ] **Step 7: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx vitest run src/design/designFile.test.ts`
Expected: typecheck passes; `formatReference` tests pass. (`reference.ts` and the `sessions.ts` change are exercised manually in Task 6 — they depend on a live xterm session.)

- [ ] **Step 8: Commit**

```bash
git add src/design/designFile.ts src/design/designFile.test.ts src/wall/sessions.ts src/design/reference.ts
git commit -m "feat(design): reference-in-terminal + last-focused terminal tracking"
```



### Task 5: `DesignPage.tsx` — the full-page Excalidraw editor + live file bridge

The integration surface: a full-page Excalidraw editor that loads/seeds the space's design file, writes visual edits back (debounced, echo-guarded, agent-wins on conflict), live-reloads on agent edits, and offers "reference in terminal." Verified manually via the run flow (Excalidraw + the Tauri watcher can't be unit-tested).

**Files:**
- Create: `src/design/DesignPage.tsx`
- Modify: `src/App.css` (add `.design-*` styles)

**Interfaces:**
- Consumes: `resolveDesignPath`, `ensureDesignFile` (`designFile.ts`); `serializeScene`, `parseScene`, `DEFAULT_BG`, `SceneElement` (`normalize.ts`); `hashText`, `makeEchoGuard` (`echoGuard.ts`); `watchDesignFile` (`watch.ts`); `referenceInActiveTerminal` (`reference.ts`); `readTextFile`, `writeDesignFile` (`persistence.ts`); `BackIcon` (`../wall/icons`).
- Produces: `DesignPage({ wallId, onBack }: { wallId: string; onBack: () => void })` — consumed by `App.tsx` in Task 6.

- [ ] **Step 1: Create `src/design/DesignPage.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { Excalidraw, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { BackIcon } from "../wall/icons";
import { readTextFile, writeDesignFile } from "../store/persistence";
import { resolveDesignPath, ensureDesignFile } from "./designFile";
import { serializeScene, parseScene, DEFAULT_BG, type SceneElement } from "./normalize";
import { hashText, makeEchoGuard } from "./echoGuard";
import { watchDesignFile } from "./watch";
import { referenceInActiveTerminal } from "./reference";

type Initial = { elements: ExcalidrawElement[]; appState: Partial<AppState> };

const toEls = (e: SceneElement[]) =>
  restoreElements(e as unknown as ExcalidrawElement[], null);

export function DesignPage({ wallId, onBack }: { wallId: string; onBack: () => void }) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const pathRef = useRef<string | null>(null);
  const loadedHash = useRef<string>("");
  const echo = useRef(makeEchoGuard());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initial, setInitial] = useState<Initial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  function applyExternal(text: string) {
    const r = parseScene(text);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    loadedHash.current = hashText(text);
    apiRef.current?.updateScene({
      elements: toEls(r.elements),
      appState: { viewBackgroundColor: r.viewBackgroundColor },
    });
  }

  // Resolve path -> seed -> load -> watch for agent edits.
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void (async () => {
      const path = await resolveDesignPath(wallId);
      if (!path) { if (!cancelled) setError("This space has no project folder."); return; }
      pathRef.current = path;
      await ensureDesignFile(path);
      const text = await readTextFile(path).catch((e) => { setError(String(e)); return null; });
      if (text === null || cancelled) return;
      const r = parseScene(text);
      if (!r.ok) { setError(r.error); return; }
      loadedHash.current = hashText(text);
      setInitial({ elements: toEls(r.elements), appState: { viewBackgroundColor: r.viewBackgroundColor } });
      const un = await watchDesignFile(path, async () => {
        const t = await readTextFile(path).catch(() => null);
        if (t === null || cancelled) return;
        if (echo.current.isOwnEcho(t)) return;          // ignore our own write
        if (hashText(t) === loadedHash.current) return; // no real change
        applyExternal(t);
        flash("reloaded — agent updated this UI");
      });
      if (cancelled) un(); else stop = un;
    })();
    return () => { cancelled = true; stop?.(); if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [wallId]);

  function onChange(elements: readonly ExcalidrawElement[], appState: AppState) {
    const path = pathRef.current;
    if (!path) return;
    const text = serializeScene(elements as unknown as SceneElement[], appState.viewBackgroundColor ?? DEFAULT_BG);
    if (hashText(text) === loadedHash.current) return; // load / reload / no-op change
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const onDisk = await readTextFile(path).catch(() => null);
      // Agent changed the file under our in-progress edit -> agent wins.
      if (onDisk !== null && hashText(onDisk) !== loadedHash.current && !echo.current.isOwnEcho(onDisk)) {
        applyExternal(onDisk);
        flash("reloaded — agent updated this UI");
        return;
      }
      echo.current.markWritten(text);
      loadedHash.current = hashText(text);
      await writeDesignFile(path, text).catch((e) => setError(String(e)));
    }, 300);
  }

  async function reference() {
    const path = pathRef.current;
    if (!path) return;
    const how = await referenceInActiveTerminal(path);
    flash(how === "sent" ? "added to the focused terminal" : "no terminal focused — path copied");
  }

  return (
    <div className="design-page">
      <div className="design-topbar">
        <button className="cnvs-btn" onClick={onBack} title="Back"><BackIcon /></button>
        <span className="design-title">UI</span>
        <span className="design-spacer" />
        <button className="cnvs-btn design-ref" onClick={() => void reference()} title="Reference this UI in the focused terminal">
          @ Reference in terminal
        </button>
      </div>
      <div className="design-canvas">
        {error && <div className="design-error">{error}</div>}
        {initial && !error && (
          <Excalidraw
            excalidrawAPI={(api) => { apiRef.current = api; }}
            initialData={initial}
            theme="dark"
            onChange={onChange}
          />
        )}
      </div>
      {toast && <div className="design-toast">{toast}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Add the page styles to `src/App.css`**

Append:

```css
/* ---- UI design page ---- */
.design-page { position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--bg); }
.design-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-bottom: 1px solid var(--rule);
  background: var(--glass); backdrop-filter: blur(10px); z-index: 5;
}
.design-title { color: var(--text); font: 600 12px var(--font-ui); letter-spacing: .04em; }
.design-spacer { flex: 1; }
.design-ref { width: auto; padding: 0 10px; gap: 6px; font: 600 11.5px var(--font-ui); }
.design-canvas { flex: 1; position: relative; min-height: 0; }
.design-error {
  position: absolute; inset: 0; display: grid; place-items: center; padding: 0 24px;
  text-align: center; color: var(--danger); font: 500 13px var(--font-mono);
}
.design-toast {
  position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%);
  background: var(--glass); border: 1px solid var(--rule); border-radius: var(--radius-sm);
  padding: 7px 14px; color: var(--text); font: 500 12px var(--font-ui);
  box-shadow: var(--shadow); z-index: 6;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (If Excalidraw's `onChange`/`initialData`/`restoreElements` types need a tweak, adjust the casts shown — keep `appState: AppState` matching Excalidraw's signature.)

- [ ] **Step 4: Commit**

```bash
git add src/design/DesignPage.tsx src/App.css
git commit -m "feat(design): full-page Excalidraw UI editor with live file bridge"
```



### Task 6: Navigation wiring — toolbar icon, `design` view, Vibe command, end-to-end verify

Wires the page into the app exactly like the task board: a new icon in the wall toolbar opens a `design` top-level view for the current space. Adds an `open_ui` Vibe voice command. Ends with a manual end-to-end run that proves the full agent round-trip.

**Files:**
- Modify: `src/wall/icons.tsx` (add `DesignIcon`)
- Modify: `src/wall/Toolbar.tsx` (add `onDesign` prop + button)
- Modify: `src/wall/WallView.tsx:59,609` (thread `onDesign` to `Toolbar`)
- Modify: `src/App.tsx` (add `design` view, render `DesignPage`, `open_ui` command)

**Interfaces:**
- Consumes: `DesignPage` (`src/design/DesignPage.tsx`).
- Produces: a reachable `design` view; `Toolbar` gains `onDesign: () => void`; `WallView` gains `onDesign: () => void`.

- [ ] **Step 1: Add `DesignIcon` to `src/wall/icons.tsx`**

Add next to the other icon exports (it uses the same `Svg` wrapper; a Figma-style frame glyph):

```tsx
export const DesignIcon = () => (
  <Svg><path d="M4 7h16" /><path d="M4 17h16" /><path d="M7 4v16" /><path d="M17 4v16" /></Svg>
);
```

- [ ] **Step 2: Add the toolbar button in `src/wall/Toolbar.tsx`**

Add `onDesign` to the props type and destructure, import `DesignIcon`, and add the button immediately before the Taskboard button:

```tsx
import { BackIcon, ChevronDownIcon, GearIcon, GridIcon, TeamsIcon, FolderIcon, DesignIcon } from "./icons";
```
```tsx
export function Toolbar({
  wallId, onBack, onSwitch, onGear, onExplorer, onDesign, onTasks, onTeams,
}: { wallId: string; onBack: () => void; onSwitch: (id: string) => void; onGear: () => void; onExplorer: () => void; onDesign: () => void; onTasks: () => void; onTeams: () => void }) {
```
```tsx
      <button className="cnvs-btn" onClick={onDesign} title="UI design"><DesignIcon /></button>
      <button className="cnvs-btn" onClick={onTasks} title="Taskboard"><GridIcon /></button>
```

- [ ] **Step 3: Thread `onDesign` through `src/wall/WallView.tsx`**

Add `onDesign` to the `WallView` props (line 59):

```tsx
export function WallView({ wallId, onExit, onSwitch, onDesign, onTasks, onTeams }: { wallId: string; onExit: () => void; onSwitch: (id: string) => void; onDesign: () => void; onTasks: () => void; onTeams: () => void }) {
```

Pass it to `<Toolbar>` (line 609):

```tsx
      <Toolbar wallId={wallId} onBack={() => { void exit(); }} onSwitch={onSwitch} onGear={() => setGearOpen((o) => !o)} onExplorer={() => setExplorerOpen((o) => !o)} onDesign={onDesign} onTasks={onTasks} onTeams={onTeams} />
```

- [ ] **Step 4: Add the `design` view to `src/App.tsx`**

Import the page (with the other view imports near line 5):

```tsx
import { DesignPage } from "./design/DesignPage";
```

Extend the `View` union (line 16-20):

```tsx
type View =
  | { kind: "start" }
  | { kind: "wall"; id: string }
  | { kind: "tasks"; from: View }
  | { kind: "teams"; from: View }
  | { kind: "design"; wallId: string; from: View };
```

Update the `useVibeContext("app", ...)` `where` expression (line 36-40) to name the new view:

```tsx
    const where =
      view.kind === "start" ? "start page"
      : view.kind === "tasks" ? "task board"
      : view.kind === "teams" ? "teams view"
      : view.kind === "design" ? "UI design canvas"
      : `space "${wallsRef.current.find((w) => w.id === view.id)?.name ?? "unknown"}"`;
```

Add the `open_ui` Vibe command (alongside `open_task_board`, after it):

```tsx
  useVibeCommand({
    name: "open_ui",
    description: "Open the current space's UI design canvas (the Figma-like infinite canvas).",
    run: () => {
      if (view.kind !== "wall") return "Open a space first, then open its UI canvas.";
      setView({ kind: "design", wallId: view.id, from: view });
      return "Opened the UI canvas.";
    },
  });
```

Render the page: in the `WallView` branch pass `onDesign`, and add a `design` page branch. Update the final `else if` chain:

```tsx
  } else if (view.kind === "teams") {
    page = <TeamsView onBack={() => setView(view.from)} onOpenWall={(id) => setView({ kind: "wall", id })} />;
  } else if (view.kind === "design") {
    page = <DesignPage wallId={view.wallId} onBack={() => setView(view.from)} />;
  } else {
    page = (
      <WallView
        wallId={view.id}
        onExit={() => setView({ kind: "start" })}
        onSwitch={(id) => setView({ kind: "wall", id })}
        onDesign={() => setView({ kind: "design", wallId: view.id, from: view })}
        onTasks={() => setView({ kind: "tasks", from: view })}
        onTeams={() => setView({ kind: "teams", from: view })}
      />
    );
  }
```

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck passes; all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/wall/icons.tsx src/wall/Toolbar.tsx src/wall/WallView.tsx src/App.tsx
git commit -m "feat(design): wall-toolbar UI icon + design view + open_ui voice command"
```

- [ ] **Step 7: Manual end-to-end verification**

Run: `npm run app` (Tauri dev). Then:

1. Open a space (one with a real project folder). Click the new **UI design** icon (the frame glyph) next to the task-board icon → the full-page Excalidraw editor opens.
2. Draw a rectangle and some text. Within ~1s, confirm `<space folder>/designs/ui.design.json` is created and contains your elements (open it in any editor). Drag the rectangle → the file updates; verify there are no `version`/`seed` fields and the diff is small.
3. **Agent round-trip:** with the design page open, edit `ui.design.json` externally (change the rectangle's `backgroundColor` to `"#d79a3d"` and save) → the canvas reloads live and shows the amber fill, with a "reloaded — agent updated this UI" toast. No echo loop (it doesn't immediately re-save).
4. Go back to the space, focus a terminal, return to the UI page, click **@ Reference in terminal** → switch to the space and confirm `@<path>/designs/ui.design.json` was inserted into that terminal's prompt (unsent). With no terminal ever focused, confirm the toast says the path was copied instead.
5. Back button returns to the space.

If any step fails, debug with `superpowers:systematic-debugging` before marking the plan complete.


