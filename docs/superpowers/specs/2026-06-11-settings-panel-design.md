# Settings Panel — Design

**Date:** 2026-06-11
**Status:** Approved
**Inspiration:** cnvs.dev settings modal (sidebar nav + grouped option pane)

## Problem

Vibe Walls has real configuration scattered or hardcoded: launch presets live in a
JSON file with no UI, terminal options (font size, scrollback, shell) are constants
in `sessions.ts`, and the wall background hides behind a bare three-row gear menu.
There is no one place to see or change how the software behaves.

## Design

A centered modal over a dim backdrop, opened from the gear in the wall toolbar
(replacing the old `BackgroundMenu`). Left sidebar navigation, right option pane,
warm Quansynd styling. Sections:

### 1. Agents

Edits the launch presets behind the "+ Terminal" menu (persisted via the existing
`presets_load`/`presets_save` commands):

- Row per preset: tier dot, editable label, editable command (empty = plain shell).
- Add preset (new UUID id, default icon) and delete (the `plain` preset cannot be
  deleted — `resolvePreset` falls back to the first entry).
- Saving writes presets.json and refreshes `presetStore` so the launch menu updates
  immediately.

### 2. Terminal

App-level terminal options consumed by `sessions.ts` at spawn:

- Font size (10–20, default 13) — applies **live** to running terminals via
  `term.options.fontSize` + refit.
- Scrollback (500–50000, default 5000) — applies to new terminals.
- Shell (default `powershell.exe`) — applies to new terminals.

### 3. Canvas

- Current wall background: color / image / video (absorbs the old gear menu;
  modal is only reachable from a wall, so "current wall" always exists).
- Default background for new walls (same picker), stored in settings.

### 4. About

App name, version (from package.json via Vite define or import), one-line blurb.

## Data model & persistence

```ts
export type Settings = {
  terminal: { fontSize: number; scrollback: number; shell: string };
  canvas: { defaultBackground: Background };
};
```

- `DEFAULT_SETTINGS` constant; `mergeSettings(partial)` deep-merges a loaded
  partial over defaults so old settings.json files stay forward-compatible.
- New Rust commands `settings_load` / `settings_save` mirroring the presets pair
  (atomic write to `settings.json` in app data); `settings_path` added to paths.rs.
- New zustand `settingsStore`: `settings`, `load()`, `save(patch)` (persists and
  notifies subscribers).
- `sessions.ts` reads the store at spawn; subscribes for live font-size changes.
- `WallView` uses `settings.canvas.defaultBackground` when a wall doc has no
  background (new wall).

## Out of scope

- Voice/Community tabs (no such subsystems — no fake UI).
- Theme switching (Quansynd brand is fixed).
- Per-wall terminal overrides.

## Testing

- Vitest: `mergeSettings` (defaults, partial overlay, unknown keys ignored),
  preset edit reducers if extracted.
- Existing suites stay green; `cargo test` passes with the new commands.
- Manual: edit a preset and see the launch menu update; change font size with a
  running terminal; set a default background and create a new wall.
