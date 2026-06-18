# Folder Reveal + Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users open a space's project folder in Windows Explorer (from Start cards, the wall toolbar, or by asking Vibe) and create a new space by dropping a folder onto the Start page.

**Architecture:** Reuse the existing `WallMeta.path` field and the already-installed `@tauri-apps/plugin-opener`. Reveal uses `openPath()` behind a thin `openFolder()` wrapper. Folder-drop flips Tauri's `dragDropEnabled` on and is handled inside `StartPage` (mounted only on the Start view, so it is naturally scoped there); a small Rust `is_dir` command filters directories from loose files. A pure `spaceFromFolder()` helper is shared by the picker and the drop handler.

**Tech Stack:** Tauri v2 (Rust), React + TypeScript, `@tauri-apps/plugin-opener`, `@tauri-apps/api/webview` drag-drop events, Vitest.

## Global Constraints

- No new npm or Cargo dependencies — use the installed `@tauri-apps/plugin-opener`, `@tauri-apps/api`, and a hand-written Rust command. (Disk/dep lean.)
- Match existing code style: 2-space indent, named exports, `invoke<...>()` wrappers in `persistence.ts`, icon components in `src/wall/icons.tsx`, styles in `src/App.css`.
- `spaceFromFolder` must stay pure (no Tauri imports) — its test runs under Vitest's `node` environment (`src/**/*.test.ts`).
- A space created from a folder must be byte-identical in shape to one created by the picker: `{ id, name: basename(path), path, updatedAt, isCurrent: true }`.
- Reveal opens the folder's **contents** (`openPath`), not highlight-in-parent (`revealItemInDir`).
- Drop acts on **directories only**; loose files are ignored.

---

### Task 1: `spaceFromFolder` pure helper

**Files:**
- Create: `src/store/spaceFromFolder.ts`
- Test: `src/store/spaceFromFolder.test.ts`

**Interfaces:**
- Produces: `spaceFromFolder(path: string): WallMeta` — `{ id: crypto.randomUUID(), name, path, updatedAt: Date.now(), isCurrent: true }`, where `name` is the trailing path segment (the same `basename` rule already used in `StartPage.tsx:9` and `App.tsx:112`).

- [ ] **Step 1: Write the failing test**

```ts
// src/store/spaceFromFolder.test.ts
import { describe, it, expect } from "vitest";
import { spaceFromFolder } from "./spaceFromFolder";

describe("spaceFromFolder", () => {
  it("derives name from the trailing folder segment", () => {
    const m = spaceFromFolder("C:\\Users\\admin\\Projects\\demo");
    expect(m.name).toBe("demo");
    expect(m.path).toBe("C:\\Users\\admin\\Projects\\demo");
  });

  it("ignores trailing slashes and handles forward slashes", () => {
    expect(spaceFromFolder("D:/work/site/").name).toBe("site");
  });

  it("falls back to 'wall' for a rootless path", () => {
    expect(spaceFromFolder("").name).toBe("wall");
  });

  it("marks the space current with a fresh id and timestamp", () => {
    const before = Date.now();
    const m = spaceFromFolder("C:\\a\\b");
    expect(m.isCurrent).toBe(true);
    expect(m.id).toMatch(/[0-9a-f-]{36}/);
    expect(m.updatedAt).toBeGreaterThanOrEqual(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/spaceFromFolder.test.ts`
Expected: FAIL — `Failed to resolve import "./spaceFromFolder"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/store/spaceFromFolder.ts
import type { WallMeta } from "./types";

const basename = (p: string) => p.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "wall";

/** Build the WallMeta for a new space rooted at a folder path. Pure (no Tauri). */
export function spaceFromFolder(path: string): WallMeta {
  return { id: crypto.randomUUID(), name: basename(path), path, updatedAt: Date.now(), isCurrent: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/spaceFromFolder.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/spaceFromFolder.ts src/store/spaceFromFolder.test.ts
git commit -m "feat(vibe-space): add pure spaceFromFolder helper"
```

---

### Task 2: Reuse `spaceFromFolder` in the picker flow

**Files:**
- Modify: `src/start/StartPage.tsx:9` (remove local `basename`), `:48-57` (`newCanvas`)

**Interfaces:**
- Consumes: `spaceFromFolder` (Task 1).

- [ ] **Step 1: Import the helper and replace the inline meta construction**

In `src/start/StartPage.tsx`, add to the imports near the top:

```ts
import { spaceFromFolder } from "../store/spaceFromFolder";
```

Replace the body of `newCanvas` (currently `StartPage.tsx:48-57`) so it uses the helper:

```ts
  const newCanvas = async () => {
    const path = await pickFolder();
    if (!path) return;
    const meta = spaceFromFolder(path);
    const next = [...walls.map((w) => ({ ...w, isCurrent: false })), meta];
    setWalls(next);
    await saveIndex(next);
    onOpen(meta.id);
  };
```

Note: the module-level `const basename = ...` at `StartPage.tsx:9` is still used by `WallCard`/elsewhere? Check with a search; it is only used inside `newCanvas` originally. After this change, if `basename` is now unused, delete the `StartPage.tsx:9` line (orphan cleanup from this change). If still referenced, leave it.

- [ ] **Step 2: Verify the app still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the existing test suite**

Run: `npx vitest run`
Expected: PASS (no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/start/StartPage.tsx
git commit -m "refactor(vibe-space): build new-canvas meta via spaceFromFolder"
```

---

### Task 3: Rust `is_dir` command

**Files:**
- Modify: `src-tauri/src/store/commands.rs` (append command), `src-tauri/src/lib.rs:52` (register in `generate_handler!`)

**Interfaces:**
- Produces: Tauri command `is_dir(path: String) -> bool` — true only when `path` points at an existing directory.

- [ ] **Step 1: Add the command**

Append to `src-tauri/src/store/commands.rs`:

```rust
/// True when `path` is an existing directory. Used to filter dropped folders
/// from loose files (drop only creates spaces from directories).
#[tauri::command]
pub fn is_dir(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
}
```

- [ ] **Step 2: Register the command**

In `src-tauri/src/lib.rs`, inside `tauri::generate_handler![ ... ]`, add a line after `store::commands::tasks_save,` (around `lib.rs:52`):

```rust
            store::commands::is_dir,
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles (warnings ok), no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/store/commands.rs src-tauri/src/lib.rs
git commit -m "feat(vibe-space): add is_dir Tauri command"
```

---

### Task 4: Permissions, config, and persistence wrappers for reveal + drop

**Files:**
- Modify: `src-tauri/capabilities/default.json` (add `opener:allow-open-path`)
- Modify: `src-tauri/tauri.conf.json` (set `dragDropEnabled: true`)
- Modify: `src/store/persistence.ts` (add `openFolder`, `isDir`)

**Interfaces:**
- Consumes: `is_dir` command (Task 3).
- Produces: `openFolder(path: string): Promise<void>`; `isDir(path: string): Promise<boolean>`.

- [ ] **Step 1: Allow `open_path` in capabilities**

In `src-tauri/capabilities/default.json`, add `"opener:allow-open-path"` to the `permissions` array (after `"opener:default"`). `allow-open-path` enables `open_path` with no pre-configured scope, so no scope object is needed:

```json
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "opener:default",
    "opener:allow-open-path",
    "deep-link:default"
  ]
```

- [ ] **Step 2: Enable OS drag-drop on the window**

In `src-tauri/tauri.conf.json`, in `app.windows[0]`, change `"dragDropEnabled": false` to `true`. (This routes OS drops through Tauri events — the only way to read dropped folder *paths*. It suppresses the webview's built-in image-drop, which this app does not use.)

- [ ] **Step 3: Add the persistence wrappers**

In `src/store/persistence.ts`, add the opener import at the top alongside the existing imports:

```ts
import { openPath } from "@tauri-apps/plugin-opener";
```

Append these functions:

```ts
/** Open a folder's contents in the OS file explorer. */
export function openFolder(path: string): Promise<void> {
  return openPath(path);
}

/** True when `path` is an existing directory (used to filter dropped items). */
export function isDir(path: string): Promise<boolean> {
  return invoke<boolean>("is_dir", { path });
}
```

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/capabilities/default.json src-tauri/tauri.conf.json src/store/persistence.ts
git commit -m "feat(vibe-space): enable open_path + drag-drop, add openFolder/isDir wrappers"
```

---

### Task 5: FolderIcon

**Files:**
- Modify: `src/wall/icons.tsx` (add `FolderIcon`)

**Interfaces:**
- Produces: `FolderIcon(): JSX.Element` — a stroke icon matching the existing icon set (see `BackIcon`/`GearIcon` for the `viewBox`/stroke conventions).

- [ ] **Step 1: Add the icon**

Add to `src/wall/icons.tsx`, following the same `width/height/viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"` pattern as the neighbouring icons:

```tsx
export function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
```

(If the existing icons use a different `strokeWidth` or size, match theirs.)

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/wall/icons.tsx
git commit -m "feat(vibe-space): add FolderIcon"
```

---

### Task 6: Reveal button on Start-page cards

**Files:**
- Modify: `src/start/StartPage.tsx` (`WallCard`, ~`:11-38`)
- Modify: `src/App.css` (button styling)

**Interfaces:**
- Consumes: `openFolder` (Task 4), `FolderIcon` (Task 5).

- [ ] **Step 1: Add the button to `WallCard`**

In `src/start/StartPage.tsx`, import `openFolder` and `FolderIcon`:

```ts
import { loadIndex, saveIndex, pickFolder, deleteWall, loadThumbnailUrl, openFolder } from "../store/persistence";
import { CloseIcon, GridIcon, TeamsIcon, FolderIcon } from "../wall/icons";
```

Inside `WallCard`'s returned markup, add an open-folder button next to the existing delete button (`StartPage.tsx:22-28`):

```tsx
      <button
        className="wall-folder"
        title="Open folder in Explorer"
        onClick={(e) => { e.stopPropagation(); void openFolder(meta.path); }}
      >
        <FolderIcon />
      </button>
```

- [ ] **Step 2: Style it**

In `src/App.css`, find the `.wall-del` rule and add a sibling `.wall-folder` rule that positions it just left of the delete button (copy `.wall-del`'s positioning, shifting `right` by the button width, e.g. `right: 2.4rem;`). Match `.wall-del`'s color/hover treatment.

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/start/StartPage.tsx src/App.css
git commit -m "feat(vibe-space): reveal-folder button on space cards"
```

---

### Task 7: Reveal button in the wall toolbar

**Files:**
- Modify: `src/wall/Toolbar.tsx`

**Interfaces:**
- Consumes: `openFolder` (Task 4), `FolderIcon` (Task 5). Uses the already-loaded `current` (`Toolbar.tsx:14`) for `current.path`.

- [ ] **Step 1: Add the button**

In `src/wall/Toolbar.tsx`, import the helper and icon:

```ts
import { loadIndex, openFolder } from "../store/persistence";
import { BackIcon, ChevronDownIcon, GearIcon, GridIcon, TeamsIcon, FolderIcon } from "./icons";
```

Add a button after the `onGear` button (`Toolbar.tsx:23`), disabled when there is no path yet:

```tsx
      <button
        className="cnvs-btn"
        onClick={() => current?.path && void openFolder(current.path)}
        title="Open folder"
        disabled={!current?.path}
      ><FolderIcon /></button>
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/wall/Toolbar.tsx
git commit -m "feat(vibe-space): reveal-folder button in wall toolbar"
```

---

### Task 8: `open_folder` Vibe command

**Files:**
- Modify: `src/App.tsx` (register a new `useVibeCommand` near the existing `create_space` at `:86-120`)

**Interfaces:**
- Consumes: `openFolder`, `loadIndex`. Reads current view (`view.kind === "wall"` exposes `view.id`).

- [ ] **Step 1: Register the command**

In `src/App.tsx`, add a `useVibeCommand` (mirroring the shape/return-string style of `create_space`). It opens the current wall's folder, or a named space's folder:

```tsx
  useVibeCommand({
    name: "open_folder",
    description:
      "Open a space's project folder in the OS file explorer. With no name, opens the currently open space's folder.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Optional space name; defaults to the currently open space" },
      },
    },
    run: async (args) => {
      const index = await loadIndex();
      const wanted = String(args.name ?? "").trim().toLowerCase();
      const target = wanted
        ? index.find((w) => w.name.toLowerCase() === wanted)
        : view.kind === "wall"
          ? index.find((w) => w.id === view.id)
          : undefined;
      if (!target) return wanted ? `Error: no space named "${args.name}".` : "Error: no space is open. Open one or pass a name.";
      await openFolder(target.path);
      return `Opened the folder for "${target.name}" (${target.path}).`;
    },
  });
```

Add `openFolder` to the existing persistence import at `App.tsx:9`.

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(vibe-space): add open_folder Vibe command"
```

---

### Task 9: Folder drag-and-drop on the Start page

**Files:**
- Modify: `src/start/StartPage.tsx` (drop listener + hover state)
- Modify: `src/App.css` (drop-hover style)

**Interfaces:**
- Consumes: `spaceFromFolder` (Task 1), `isDir` (Task 4). Uses `@tauri-apps/api/webview` `getCurrentWebview().onDragDropEvent`.

- [ ] **Step 1: Add the drop listener**

In `src/start/StartPage.tsx`, add the import:

```ts
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isDir } from "../store/persistence";
```

Add a `dragHover` state and an effect that subscribes while mounted (mounted == Start view, so no view-check needed). On `drop`, keep only directories, create one space per folder, save once, and open the last:

```tsx
  const [dragHover, setDragHover] = useState(false);
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent(async (e) => {
      if (e.payload.type === "over" || e.payload.type === "enter") { setDragHover(true); return; }
      if (e.payload.type === "leave") { setDragHover(false); return; }
      if (e.payload.type === "drop") {
        setDragHover(false);
        const dirs: string[] = [];
        for (const p of e.payload.paths) if (await isDir(p)) dirs.push(p);
        if (dirs.length === 0) return;
        const created = dirs.map(spaceFromFolder);
        setWalls((prev) => {
          const next = [...prev.map((w) => ({ ...w, isCurrent: false })), ...created];
          void saveIndex(next);
          return next;
        });
        onOpen(created[created.length - 1].id);
      }
    });
    return () => { void unlisten.then((f) => f()); };
  }, [onOpen]);
```

Add the `spaceFromFolder` import if not already present from Task 2. Apply `dragHover` to the page wrapper, e.g. `className={`start-page${dragHover ? " drag-over" : ""}`}` at `StartPage.tsx:67`.

- [ ] **Step 2: Style the hover state**

In `src/App.css`, add a `.start-page.drag-over` rule giving a clear drop affordance (e.g. an inset amber dashed outline using the brand accent, matching the warm palette — not blue):

```css
.start-page.drag-over { outline: 2px dashed var(--accent, #d79a3d); outline-offset: -10px; }
```

(Use whatever accent variable the codebase already defines; check `theme.css`.)

- [ ] **Step 3: Verify type-check + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/start/StartPage.tsx src/App.css
git commit -m "feat(vibe-space): create a space by dropping a folder on the Start page"
```

---

### Task 10: Manual verification — run the app and screenshot

**Files:** none (verification only)

- [ ] **Step 1: Launch the desktop app**

Run: `npm run tauri dev`
Expected: the Vibe Space window opens at the Start page.

- [ ] **Step 2: Verify reveal**

Open a space, click the toolbar folder button → Windows Explorer opens at that folder's contents. Back on the Start page, click a card's folder button → same.

- [ ] **Step 3: Verify drag-and-drop**

Drag a folder from Explorer onto the Start page → the page shows the dashed drop outline, then a new space named after the folder is created and opened. Drag a single loose file → nothing happens.

- [ ] **Step 4: Verify the Vibe command**

With a space open, ask Vibe "open this space's folder" → Explorer opens at the folder.

- [ ] **Step 5: Capture a screenshot**

Take a screenshot of the Start page (showing a card's folder button) and/or an open wall toolbar with the new button, for the review. Confirm no console errors in the dev window.


