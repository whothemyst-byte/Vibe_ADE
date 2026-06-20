# Vibe Space — UI Canvas (per-space Excalidraw design page + file-backed agent bridge)

**Date:** 2026-06-20
**Status:** Design approved, ready for implementation planning
**Supersedes:** `2026-06-20-vibe-space-design-canvas-design.md` (the node-tree
mini-Figma card approach — rejected as a thin, wall-embedded "slop" that was
neither a separate page nor a real editor).

## Summary

A built-in, Figma-like **UI design page** inside Vibe Space. A new icon in the
wall toolbar (next to the task-board icon) opens a **full-page infinite-canvas
editor** for the current space — opened separately, exactly like the task board
is its own page. The editor is **Excalidraw** (already a dependency), used the
normal way: frames, shapes, text, arrows, images, selection/align, infinite
pan/zoom.

Each space has **exactly one** UI canvas ("the space's UI"). It is persisted to a
single normalized file in the space's project folder. Because the wall's
terminals run with their `cwd` set to that same folder, any **terminal agent**
(Claude Code / Codex / any CLI agent) automatically sees and can edit that file
with its normal file tools — that shared file *is* the connection. No MCP server,
no per-agent configuration.

## Goals & non-goals

**Goals**

- A real, complete infinite-canvas UI editor opened as its own full page from the
  wall toolbar (mirrors the task-board navigation pattern).
- One UI per space, persisted to one clean, agent-editable file in the space
  folder.
- A terminal agent in the space reads and mutates the UI by editing that file;
  visual edits write back. Live two-way sync.
- A one-click affordance to reference the UI's file path in the focused terminal.

**Non-goals**

- Not "all of Figma." Excalidraw's freeform model has no native auto-layout,
  components, or prototyping — these are explicitly out of scope (revisit later).
- No MCP server and no per-agent configuration for the control path.
- No real-time multi-user CRDT merge of the design file (last-write-wins, agent
  wins).
- The UI is not a card on the wall; it is a separate page.

## Surface & navigation

- `src/App.tsx` view union gains `{ kind: "design"; wallId: string; from: View }`,
  rendered as a full page parallel to `tasks` / `teams`.
- `src/wall/Toolbar.tsx` gains a new design icon (new `DesignIcon` in
  `src/wall/icons.tsx`) placed next to the task-board (Grid) icon. It calls an
  `onDesign` prop wired through `WallView` → `App`, opening the **current space's**
  UI page. The icon lives only in the wall toolbar (a UI belongs to a space).
- `WallView` passes `onDesign={() => setView({ kind: "design", wallId, from })}`.
- A Back control returns to the originating view (`from`), same pattern as
  `TaskBoard` / `TeamsView`.
- An `open_ui` Vibe voice command opens the current space's UI page (cheap, the
  command registry already exists).

## The editor

- `src/design/DesignPage.tsx` hosts the `@excalidraw/excalidraw` React component
  full-page. Standard Excalidraw tooling provides the "Figma-like" surface.
- Quansynd amber theme via the existing `excalidraw-skin.css` skinning approach
  used by the wall.
- One canvas per space — no design picker, no tabs.
- Initial data comes from the space's design file (if present); otherwise an empty
  scene.

## The file & agent bridge

**Location.** `<space folder>/designs/ui.design.json`. Visible and easy to
`@`-mention; the relative path is a single shared constant so it is trivial to
change. The space folder is `WallMeta.path`.

**Format (normalized Excalidraw scene).** `src/design/normalize.ts` is a pure,
unit-tested module converting **Excalidraw scene ↔ clean JSON**:

- *Serialize (save):* drop deleted elements (`isDeleted`); strip volatile fields
  (`seed`, `versionNonce`, `version`, `updated`, transient `appState` such as
  collaborators/cursors); keep stable semantic fields (`id`, `type`, `x`, `y`,
  `width`, `height`, `angle`, stroke/background/fill, `text`, `fontSize`,
  `fontFamily`, `textAlign`, `frameId`, `containerId`, `points`, `boundElements`,
  …); sort elements deterministically; pretty-print → clean agent diffs.
- *Deserialize (load):* feed the elements back to Excalidraw via `updateScene` /
  `initialData`. Excalidraw regenerates volatile fields on load.
- Pasted images are embedded as data-URLs in the file for now (noted size
  tradeoff; revisit if files grow large).
- A minimal persisted `appState` (e.g. `viewBackgroundColor`) is kept; everything
  transient is dropped.

**Live two-way sync (reuses existing committed infra).**

- *Agent writes → page reloads:* the Tauri fs-watcher (`src/design/watch.ts` +
  the committed Rust `write_design_file` command and `notify`-based watcher
  emitting `design://changed/<path>`) fires; the page reads, validates/normalizes,
  and re-renders the scene.
- *Visual edit → file write:* Excalidraw `onChange` debounces (~300ms) then writes
  the normalized file.
- *Echo-guard:* `src/design/echoGuard.ts` (already written + tested) records a hash
  of the app's own writes so the watcher ignores echoes; only genuine external
  (agent) writes trigger a reload.
- *Conflict = agent wins:* before writing back, compare the on-disk hash with the
  last-loaded hash; if they diverge, the agent changed the file under an
  in-progress visual edit → reload the agent's version, discard the stale visual
  edit, show a small "reloaded — agent updated this UI" toast. (Reuses the existing
  `shouldReloadOnConflict` logic. Conscious tradeoff: no CRDT/merge.)

**Connection UX.** Terminal `cwd` defaults to the space folder
(`src/wall/WallView.tsx:321`), so an agent in any terminal in the space already
sees `designs/ui.design.json`. Typical loop: user opens the UI page, draws a login
screen, clicks "reference in terminal," tells the agent "make the Continue button
amber" → agent edits the file → the page updates live.

## Reference-in-terminal affordance

- A button on the design page inserts `@<absolute path to ui.design.json>` into the
  **focused terminal session** in the space, via the existing `writePty` path,
  ready for the user to send. `@` is the file-attach syntax agents like Claude Code
  use.
- Falls back to copying the path to the clipboard if no terminal is focused (with a
  toast telling the user it was copied).

## Migration: removing the rejected approach

- **Keep & reuse (approach-agnostic):** `src/design/echoGuard.ts`,
  `src/design/watch.ts`, and the Rust fs-watcher + `write_design_file` command.
- **Remove (obsolete under Excalidraw):** `src/design/DesignWindow.tsx`,
  `render.tsx`, `style.ts`, `schema.ts`, `serialize.ts`, `designCard.ts` and their
  `*.test.ts`; and the `DesignCard` type plus its wiring in `src/wall/cardStore.ts`
  (the design is a page, not a wall card). Remove the dead launch path that opened
  a design card.

## Testing

Follow the repo's per-module `*.test.ts` Vitest convention. Correctness-critical
logic is pure and fully unit-tested with no UI:

- **`normalize.ts` round-trip:** a scene serializes byte-stably and deterministically
  (stable order, stripped volatile fields); strip→reload preserves all semantic
  fields; re-serializing a reloaded scene is idempotent.
- **Echo-guard + conflict:** already covered by existing tests; retain.
- **Reference-path formatting:** correct `@<path>` string for a given file path.

Excalidraw interactions and the Tauri fs-watcher are validated manually via the run
flow, consistent with how the existing wall/browser/file cards are exercised.

## Open questions / deferred

- **Auto-layout, components, prototyping** are not native to Excalidraw and are out
  of scope here. A future custom layer or engine swap could add them.
- **Image asset handling** beyond embedded data-URLs (external files the agent can
  reference) is deferred.
- **Multi-user merge** of the design file is out of scope (last-write-wins).
- **Multiple UIs per space** is intentionally not built (one UI per space).
