# Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cnvs-style settings modal (sidebar + pane) covering Agents (preset editor), Terminal (font/scrollback/shell), Canvas (wall + default background), and About.

**Architecture:** Settings live in `settings.json` (app data) behind new `settings_load`/`settings_save` Rust commands mirroring the presets pair. A zustand `settingsStore` loads-merges-saves; `sessions.ts` consumes terminal settings at spawn and applies font size live. The modal replaces `BackgroundMenu` and is opened by the wall toolbar gear.

**Tech Stack:** React 19, zustand, Tauri 2 fs commands, vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-settings-panel-design.md`

**Working directory:** `vibe-walls/` (frontend), `vibe-walls/src-tauri/` (Rust). Never touch sibling projects' target dirs.

## File Map

| File | Change |
| --- | --- |
| `src/settings/settings.ts` (new) | `Settings` type, `DEFAULT_SETTINGS`, `mergeSettings` |
| `src/settings/settings.test.ts` (new) | mergeSettings unit tests |
| `src/settings/settingsStore.ts` (new) | zustand store: load/save |
| `src/settings/SettingsModal.tsx` (new) | modal shell + Agents/Terminal/Canvas/About panes |
| `src/store/persistence.ts` | `loadSettings`/`saveSettings`/`savePresets` wrappers |
| `src-tauri/src/store/paths.rs` | `settings_path` |
| `src-tauri/src/store/commands.rs` | `settings_load`/`settings_save` |
| `src-tauri/src/lib.rs` | register commands |
| `src/wall/WallView.tsx` | gear opens modal; default background for new walls |
| `src/wall/sessions.ts` | spawn-time settings + live font size |
| `src/wall/BackgroundMenu.tsx` | deleted (absorbed by Canvas pane) |
| `src/App.css` | modal styles |
| `src/main.tsx` | load settings at startup |

---

### Task 1: Settings model (TDD)

- [ ] Failing test: `mergeSettings(undefined)` → defaults; partial `{ terminal: { fontSize: 16 } }` keeps other defaults; unknown keys dropped; non-object input → defaults.
- [ ] Implement `Settings`, `DEFAULT_SETTINGS`, `mergeSettings(raw: unknown): Settings` (field-by-field pick with type guards — no generic deep merge).
- [ ] `npx vitest run src/settings/settings.test.ts` green; commit `feat(settings): settings model with forward-compatible merge`.

### Task 2: Rust settings commands

- [ ] `settings_path` in paths.rs (mirror `presets_path`, filename `settings.json`).
- [ ] `settings_load` (Option<String>, NotFound → None) + `settings_save` (write_atomic) in commands.rs; register both in lib.rs.
- [ ] `cargo test` green (existing tests); commit `feat(settings): settings.json load/save commands`.

### Task 3: Store + persistence wrappers

- [ ] persistence.ts: `loadSettings(): Promise<Settings>` (load → mergeSettings; null → defaults), `saveSettings(s: Settings)`, and `savePresets(presets: Preset[])` (the modal needs it; loadPresets already exists).
- [ ] `src/settings/settingsStore.ts`: zustand `{ settings, load(), save(next: Settings) }` — save sets state optimistically then persists.
- [ ] `src/main.tsx`: `void useSettingsStore.getState().load()` at startup.
- [ ] vitest + tsc green; commit `feat(settings): settings store wired to backend`.

### Task 4: Modal shell + wiring

- [ ] `SettingsModal.tsx`: backdrop (click closes), centered panel, sidebar (Agents / Terminal / Canvas / About with icons), pane area; Escape closes.
- [ ] App.css: `.settings-backdrop`, `.settings-modal`, `.settings-side`, `.settings-item(.active)`, `.settings-pane`, `.set-row`, `.set-label`, `.set-hint`, field styles — warm tokens, page-in style scale/fade animation.
- [ ] WallView: gear button toggles `<SettingsModal background onChangeBackground onClose />`; delete BackgroundMenu.tsx and its import/usage.
- [ ] vitest + tsc green; commit `feat(settings): modal shell replaces background menu`.

### Task 5: Agents pane

- [ ] List presets from `usePresetStore`; editable label + command inputs per row (tier dot via `presetTierColor`); Add (uuid id, icon "▷"); Delete (hidden for `plain`).
- [ ] Persist on change (debounced 400ms): `savePresets` + `usePresetStore.getState().load()`.
- [ ] Commit `feat(settings): agents pane edits launch presets`.

### Task 6: Terminal pane + sessions consumption

- [ ] Pane: fontSize number input (10–20), scrollback (500–50000), shell text; writes via `settingsStore.save`.
- [ ] sessions.ts: read `useSettingsStore.getState().settings.terminal` for Terminal options + shell at spawn; module-level subscribe — on fontSize change, set `term.options.fontSize` for all sessions and refit attached ones.
- [ ] Commit `feat(settings): terminal options consumed by sessions`.

### Task 7: Canvas pane + default background

- [ ] Pane: current wall background (color input + Image…/Video… pickers, reusing `pickBackgroundFile`/`importBackground`) driving the existing `changeBg`; below it, default-for-new-walls picker writing `settings.canvas.defaultBackground`.
- [ ] WallView load: `doc?.background ?? settings.canvas.defaultBackground`.
- [ ] About pane: name, version (`import pkg from "../../package.json"` or define), blurb.
- [ ] Commit `feat(settings): canvas backgrounds + about pane`.

### Task 8: Verification

- [ ] `npx vitest run` + `npx tsc --noEmit` + `cargo test` all green.
- [ ] Manual: preset edit reflects in launch menu; font size changes a live terminal; new wall gets the default background; modal opens/closes cleanly.
