# Folder Reveal + Drag-and-Drop — Design

**Date:** 2026-06-19
**Component:** Vibe Space (vibe-space/)
**Status:** Approved, pending implementation plan

## Goal

Make it effortless to get from a space to the folder it lives in, and to create a
space from a folder:

1. **Reveal in Explorer** — open Windows Explorer at a space's project folder from
   the Start page, the wall header, or by asking Vibe.
2. **Drag-and-drop a folder** onto the Start page to create a new space pointing at
   that folder and open it.

Both build on what already exists — every space already stores its folder in
`WallMeta.path` (`src/store/types.ts`), and `@tauri-apps/plugin-opener` is already
installed and enabled (`package.json`, `capabilities/default.json`).

## Background / current state

- A space's project folder is chosen at creation via the native picker
  `pickFolder()` (`src/store/persistence.ts`), from the Start page `newCanvas()`
  (`src/start/StartPage.tsx`) or the Vibe agent `create_space` command
  (`src/App.tsx`). It is stored as `WallMeta.path` and used as the default terminal
  `cwd` (`src/wall/WallView.tsx`).
- The space *document* lives in app-data
  (`%APPDATA%/com.admin.vibe-space/spaces/{id}.json`), separate from the project
  folder. This feature concerns the **project folder**, not the doc store.
- No HTML5 file-drop onto the canvas exists today: all drag handling is internal
  pointer-dragging (cards) or the task board's column drag. Backgrounds are added
  via a picker. So enabling Tauri's global drag-drop breaks no current feature.

## 1. Reveal the space's folder

### Action
Use `openPath(path)` from `@tauri-apps/plugin-opener` — opens Explorer showing the
folder's **contents** (not merely highlighting it in its parent, which is what
`revealItemInDir` does).

### Permission
`opener:default` covers only `reveal-item-in-dir` and `open-url`. Add an
`opener:allow-open-path` permission with a path scope to
`src-tauri/capabilities/default.json` so `openPath` is allowed.

### Surfaces
- **Start page:** an icon button on each space card (alongside the delete control)
  → `openPath(meta.path)`.
- **Wall:** a button in the wall header/toolbar → opens the current wall's folder
  (resolve the path the same way `addTerminal` does in `WallView.tsx`).
- **Vibe agent:** a new `open_folder` `useVibeCommand` in `App.tsx`. Opens the
  current wall's folder; if given a name, looks the space up in the index. Returns a
  human-readable confirmation/error string consistent with `create_space`.

### Wrapper
A thin `openFolder(path: string)` helper in `src/store/persistence.ts` wrapping
`openPath`, so the surfaces share one call site.

## 2. Drag a folder onto the Start page → new space

### Tauri config
Set `app.windows[].dragDropEnabled` to `true` in `src-tauri/tauri.conf.json`. This
is required: only Tauri's drag-drop event delivers real filesystem **paths**
(webview HTML5 drops cannot read paths). Tradeoff: this suppresses Excalidraw's
built-in image-drop, which the app does not currently use.

### Behavior
- Subscribe to Tauri's drag-drop event (`onDragDropEvent` /
  `getCurrentWebview().onDragDropEvent`) once, app-level.
- **Act only when the Start page is the active view.** Drops on a wall, tasks, or
  teams view are ignored.
- For each dropped path that is a **directory**, create a space and (for a single
  drop) open it. Multiple folders → multiple spaces created; the last/only one is
  opened. Dropped **files** (non-directories) are ignored.
- Confirm a dropped path is a directory before creating a space, via
  `@tauri-apps/plugin-fs` (`stat`) or a small Rust `is_dir` command.
- Show a drop-hover visual state on the Start page so it reads as a drop target.

### Shared helper
Extract a pure function
`spaceFromFolder(path: string): WallMeta`
that returns `{ id: crypto.randomUUID(), name: basename(path), path, updatedAt:
Date.now(), isCurrent: true }`. Reused by `newCanvas()`, the drop handler, and
(optionally) `create_space` so the three paths stay identical.

## Testing

- **Unit (Vitest):** `spaceFromFolder(path)` produces the expected `WallMeta` shape
  — basename-derived name, `path` preserved, well-formed id, `isCurrent: true`.
- **Manual:**
  - Reveal button (Start card + wall) opens the correct folder's contents.
  - `open_folder` Vibe command opens the current wall's folder.
  - Dropping a folder on the Start page creates and opens a space.
  - Dropping a loose file is ignored.
  - Dropping a folder while on a wall/tasks/teams view does nothing.

## Out of scope

- In-app file browser / tree view (the "Option B" panel).
- Re-pointing an existing wall's folder by dropping onto the wall.
- Drag-drop of files into the canvas as content.
