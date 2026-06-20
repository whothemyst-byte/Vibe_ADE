# Vibe Space — Design Canvas (file-backed mini-Figma)

> **SUPERSEDED (2026-06-20)** by
> `2026-06-20-vibe-space-ui-canvas-design.md`. The node-tree mini-Figma card
> below was rejected: it built a thin renderer inside a wall card rather than a
> real, separately-opened, Figma-like editor page. The replacement reuses
> Excalidraw as a full-page per-space editor while keeping the file-backed agent
> bridge. Kept for history only.

**Date:** 2026-06-20
**Status:** Superseded — see banner above

## Summary

A "Figma-like" UI-design surface inside the Vibe Space wall, distinct from the
managed terminal grid. A design is a **purpose-built mini-Figma editor** hosted
as a new card type on the Excalidraw wall. The design is backed by a declarative
UI node-tree file (`*.design.json`) that is the single source of truth.

The defining capability: a **terminal agent** (Claude Code / Codex / any CLI
agent) reads and controls the design simply by editing that file with its normal
file tools. The app watches the file and re-renders live; visual edits in the
card write back to the same file. Because control reduces to "edit a file," it is
tool-agnostic, git-versionable, and reliable — no MCP server or per-agent config
required.

Scope includes create tooling (frames, auto-layout, components, brand-token
styles) and a **prototype mode** (link frames into clickable flows). The output
is static vector mockups rendered via DOM/CSS — not a runnable application.

## Goals & non-goals

**Goals**

- Let a user create real UI mockups (frames, components, auto-layout, styles)
  inside the space, away from the terminal grid.
- Let a terminal agent read and mutate those mockups by editing a plain file.
- Live, two-way sync: agent edits → live re-render; visual edits → file write-back.
- Prototype mode: link frames into clickable flows the user can play immediately.
- Stay consistent with the existing card model (terminal / browser / file → design).

**Non-goals**

- Not a runnable app / live React rendering (that was an explicitly rejected
  alternative — designs are static mockups).
- No MCP server and no per-agent configuration for the control path.
- No real-time multi-user CRDT merge of design files (last-write-wins, agent
  wins — see bridge section).
- Not extending Excalidraw to become a Figma-grade editor; the design editor is
  a separate purpose-built surface.

## Core model

- A new **`design` card type** joins `terminal | browser | file` in
  `src/wall/cardStore.ts`. One design card maps to one `*.design.json` file.
- The card is a self-contained editor with its own internal pan/zoom viewport,
  hosted as a window on the wall (like the browser/terminal/file cards). It does
  **not** introduce a second infinite canvas nested in Excalidraw.
- **Connection to a terminal is by shared project folder.** A design card opened
  from a terminal's `cwd` reads/writes `<cwd>/designs/<name>.design.json`. The
  agent running in that same terminal shares the cwd, so it sees the same file —
  that shared file *is* the connection.
- An optional Excalidraw arrow can visually link a terminal card and a design
  card; it is purely cosmetic and carries no behavior.

**New / touched modules (indicative):**

- `src/wall/cardStore.ts` — add `DesignCard` to the `Card` union.
- `src/design/` — new feature folder: schema, node-tree mutations, DOM/CSS
  renderer, editor overlay, file I/O, prototype graph. Mirrors the existing
  per-module `*.test.ts` convention.
- `src/design/DesignWindow.tsx` — the card's React surface (parallels
  `BrowserWindow.tsx` / `FileViewerWindow.tsx`).
- `src-tauri` — fs-watcher command + `design://changed/<path>` event.

## The design file (source of truth)

A declarative UI node tree, serialized as pretty-printed, stable-ordered JSON so
agent diffs are clean and nodes can be targeted by `id`.

```jsonc
{
  "version": 1,
  "frames": [
    { "id": "login", "name": "Login", "x": 0, "y": 0, "w": 390, "h": 844,
      "root": {
        "type": "stack", "direction": "y", "gap": 16, "padding": 24, "align": "center",
        "children": [
          { "id": "t1", "type": "text", "text": "Sign in", "style": "h1" },
          { "id": "e1", "type": "input", "placeholder": "email" },
          { "id": "b1", "type": "button", "text": "Continue", "variant": "primary",
            "onTap": "home" }          // prototype link to frame "home"
        ] } }
  ],
  "components": { /* reusable nodes referenced by `instance` nodes */ },
  "tokens": { /* colors + text styles; Quansynd amber-brand defaults */ }
}
```

**Node model**

- **Frame** — an artboard (`id`, `name`, `x/y/w/h`, single `root` node).
- **Layout nodes** — `stack` (direction `y`) and `row` (direction `x`) implement
  auto-layout via flexbox (`gap`, `padding`, `align`, `justify`).
- **Primitive nodes** — `text`, `button`, `input`, `image`, `rect`, `icon`.
- **Reuse** — `component` (a named master in `components`) and `instance`
  (references a master by key; may override props).
- **Tokens** — `tokens` holds semantic colors and text styles. Nodes reference
  tokens (`"style": "h1"`, `"variant": "primary"`) rather than raw hex, so an
  agent restyles semantically and the brand stays consistent.
- Every node carries a stable `id` (used for selection, prototype links, and
  agent targeting).

**Schema validation** — a single validator (`src/design/schema.ts`) parses and
validates the file; invalid files surface an error banner rather than blanking
the card (see bridge).

## Renderer + editor

**Renderer (node tree → DOM/CSS).** The chosen technology is DOM/CSS rather than
canvas/vector primitives: `flex` *is* auto-layout, giving pixel-accurate mockups
for free, matching how agents already think, and making file round-trip trivial.
The render is a static mockup — `pointer-events` are gated so the mockup is not
interactive except in prototype preview.

- `src/design/render.tsx` maps each node type to a styled element. Token
  references resolve to CSS values from `tokens`.
- Deterministic: the same file always renders identically.

**Editor overlay.** On top of the render:

- **Selection** — click to select; selection box with resize/drag handles.
- **Layers tree** — panel reflecting the node hierarchy; select/reorder/delete.
- **Properties panel** — size, layout (gap/padding/align/justify), style tokens,
  text content, variant.
- All edits go through pure mutation helpers in `src/design/mutations.ts` that
  transform the in-memory tree; the result is debounced and written to the file.

**Create tools** — frame, stack, row, text, button, input, image, rect, and
component/instance. New nodes are inserted into the selected container.

The mutation layer is pure and unit-testable independent of React/DOM.

## Agent ↔ design bridge

The heart of the feature. The file is the single source of truth; the agent and
the visual editor are both just editors of it.

**Read (agent → understands design).** The agent opens the `*.design.json` with
its normal file tools — no app cooperation needed. The app keeps the file
pretty-printed and stable-ordered so diffs are clean and nodes are addressable by
`id`.

**Agent writes → app re-renders.** A Tauri fs-watcher (Rust, `notify` crate)
watches the project's `designs/` directory and emits `design://changed/<path>`.
The card reloads, validates, and re-renders. Invalid JSON (e.g. a mid-edit save)
shows a non-destructive error banner with the parse message instead of blanking
the card.

**Visual edit → app writes back.** Editor mutations debounce (~300 ms) then write
the file. The card records an "expected hash" of what it just wrote; the watcher
**ignores echoes** of the card's own saves — only genuinely external (agent)
changes trigger a reload.

**Conflict handling (last-write-wins, agent wins).** Before writing back, the
card compares the current on-disk hash with the hash it last loaded. If they
differ, the agent changed the file under an in-progress visual edit: the card
**reloads the agent's version and discards the stale visual edit**, showing a
small "reloaded — agent updated this design" toast. The user re-applies the tweak
on fresh state. Conscious tradeoff: no CRDT/merge engine; predictable and simple.

**Connection UX.** Opening a design card from a terminal's launch menu seeds the
file under that terminal's `cwd/designs/`. The agent in that terminal shares the
cwd and can immediately see and edit it. Typical loop: user tells the agent "the
login screen is `designs/login.design.json`, make the button amber" → agent edits
the file → the card updates live. The optional wall arrow is cosmetic.

**Vibe voice agent (incidental).** Vibe already drives the wall via a command
registry, so a few new commands ("open a design", "link this design to the Claude
terminal", "zoom to the design") come cheaply. This is independent of, and not
required by, the terminal-agent control path above.

## Prototype mode

- Any node may carry **`onTap`** — a frame id (`"onTap": "home"`), later
  extensible to `{ "to": "home", "transition": "fade" }`.
- In the editor, a **prototype layer** lets the user drag a noodle from a node to
  a target frame, which simply sets that node's `onTap`. Agents author the same
  links by editing the file.
- A **Play button** flips the card into **preview**: the mockup becomes clickable,
  `onTap` navigates between frames with a basic transition (instant / fade /
  slide). Escape exits preview.
- Because links live in the file, an agent can wire whole flows ("connect every
  Back button to the previous screen") and the user plays them immediately.
- The prototype graph (nodes with `onTap` → frames) is pure and unit-testable:
  reachability, dangling-link detection, and navigation traversal.

## Phased build plan

The full feature is large, so implementation is sequenced. **Phase 1 is the
meaningful MVP** (proves the round-trip); later phases layer on capability.

1. **Foundations + round-trip.** `design` card type in `cardStore`; file schema +
   validator; DOM/CSS renderer; `DesignWindow.tsx`; Tauri fs-watcher +
   `design://changed` event; echo-guarded write-back.
   *Verify:* agent edits `design.json` → card re-renders; visual drag → file
   updates; no echo loops; invalid JSON shows a banner, not a blank card.

2. **Create tools + properties.** Frames; stack/row auto-layout; text / button /
   input / image / rect; layers tree; properties panel; brand tokens.
   *Verify:* build a login screen both by hand and via agent; both round-trip.

3. **Components.** Define masters + `instance` nodes; edit master → instances
   update.
   *Verify:* change a component; all instances reflect it in file and render.

4. **Prototype mode.** `onTap` links; noodle UI; Play/preview with transitions.
   *Verify:* agent wires a 2-screen flow; Play navigates between frames.

5. **Polish + connection sugar.** Cosmetic wall link arrow; Vibe voice commands;
   export (PNG/SVG); conflict toasts.

Each phase is a candidate for its own implementation plan; Phase 1 should be
planned and built first.

## Testing

Follow the repo's per-module `*.test.ts` Vitest convention. The
correctness-critical logic is pure and fully unit-tested with no UI:

- **Schema validation** — valid/invalid files, version handling, helpful errors.
- **Node-tree mutations** — insert/move/delete/restyle preserve invariants.
- **Serialization stability** — round-trip is byte-stable and stable-ordered
  (so agent diffs stay clean).
- **Echo-guard hashing** — the card ignores its own writes, reloads external ones.
- **Conflict resolution** — divergent on-disk hash → reload-agent-version path.
- **Prototype graph** — `onTap` reachability, dangling-link detection, navigation.
- **Renderer mapping** — each primitive and auto-layout node → expected DOM/CSS.

The Tauri fs-watcher and the live editor interactions are validated manually via
the run flow, consistent with how the existing wall/browser/file cards are
exercised.

## Open questions / deferred

- **Live-UI rendering** (design → runnable React/Tailwind) was explicitly
  rejected for this surface, but the DOM/CSS renderer keeps the door open if it's
  ever wanted as a separate mode.
- **Real multi-user merge** of design files is out of scope (last-write-wins).
  Revisit if Team-tier shared spaces need concurrent design editing.
- **Richer prototype interactions** (gestures, conditional flows, overlays)
  beyond `onTap` frame navigation are deferred.
- **Asset handling** for `image` nodes (where files live, how the agent
  references them) to be detailed in the Phase 2 plan.
- **MCP convenience layer** over the file remains a possible future addition but
  is intentionally not part of this design.
