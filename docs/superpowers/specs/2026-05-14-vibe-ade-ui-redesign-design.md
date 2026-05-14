# Vibe-ADE v0.5 — UI Redesign Design

Date: 2026-05-14
Status: Draft, awaiting user review
Branch: `redesign/v0.5`
Target release: v0.5.0

## Background

Vibe-ADE shipped V1 (v0.4.1) on 2026-02-18 as a Windows-native Electron + React + TypeScript ADE: multi-pane PTY terminals, workspace persistence, swarm orchestration, Supabase auth + cloud sync, browser pane, TaskBoard, Settings. The renderer UI was function-first and is now inconsistent with the QuanSynd brand.

A complete visual brand system was developed externally in `D:\Quansynd\vibeade\design\` — warm bronze + gold on deep ink, Sora / Manrope / JetBrains Mono — with 9 screen mockups (auth, start, workspace, browser, taskboard, swarm, settings × 3). The `D:\Quansynd\Vibe-ADE-REF\` folder holds BridgeMind screenshots used as additional layout/structure inspiration (premium dark feel, card-based panes, multi-mode workspace hero, agent mindmap).

## Goals

- Adopt the QuanSynd dark brand identity across every renderer surface.
- Adopt selected BridgeMind-inspired IA additions: three workspace modes on Start, card-grid terminal layout, Tasks↔Agents↔Files mindmap, free-form Canvas mode (terminals only).
- Ship as a single cutover release (v0.5.0) off a `redesign/v0.5` branch.
- Preserve every existing feature, IPC contract, and persisted state shape (additive changes only).

## Non-goals

- No light-theme polish in this release. Tokens are defined but unvalidated in light mode.
- No AI side-rail in the workspace.
- No code/symbol graph (the mindmap is task↔agent↔file only, no static analysis).
- No Mac/Linux packaging changes.
- No main-process refactors beyond the minimal IPC additions listed below.

## Locked decisions

1. **Brand**: QuanSynd dark — `--qs-ink-900` (`#14110B`) base, `--qs-gold-500` (`#D79A3D`) accent, Sora display / Manrope text / JetBrains Mono code. Source of truth: `D:\Quansynd\vibeade\design\tokens.css`.
2. **Inspiration**: `D:\Quansynd\Vibe-ADE-REF\` (BridgeMind) = visual feel and IA cues. `D:\Quansynd\vibeade\design\` = per-screen layout reference.
3. **Features added**: three workspace modes on Start, card-grid terminal layout, Tasks↔Agents↔Files mindmap, Canvas mode (terminals only).
4. **Canvas scope**: free-form pan/zoom plane hosting only terminal cards. No agent/task/note cards.
5. **Mindmap data**: existing services only — TaskBoard state, SwarmManager state, FileOwnershipManager. No new instrumentation, no code parsing.
6. **Rollout**: branch `redesign/v0.5`, single cutover release v0.5.0. No feature flag.

## Architecture overview

Renderer-only redesign with two small main-process additions:

- `WorkspaceManager` gains a `mode: 'space' | 'swarm' | 'canvas'` field on workspaces (backwards-compatible default `'space'`).
- One new read-only IPC channel: `fileOwnership:list` exposing a snapshot of `FileOwnershipManager` to the renderer.

Everything else — `TerminalManager`, PTY lifecycle, `terminal:*` channels, `AuthManager`, `CloudSyncManager`, `BillingUsageManager`, `SwarmManager`, `SwarmEventBus`, `MessageRouter`, `CrashRecoveryManager`, persistence file format — stays exactly as in v0.4.1.

## Section 1 — Design system foundation

**Goal**: every existing component inherits QuanSynd tokens automatically before any layout work begins.

Files added or changed:

- `src/renderer/src/styles/tokens.css` — copied verbatim from `D:\Quansynd\vibeade\design\tokens.css`. Defines `--qs-*` CSS variables for color, type, spacing, radii, shadows, motion. Includes `[data-theme="dark"]` overrides.
- `src/renderer/src/styles/app.css` — imports `tokens.css` first. Sets `<html data-theme="dark">` as default. Binds `body` font + background to QuanSynd vars.
- `tailwind.config.ts` — extend `theme.colors`, `fontFamily`, `borderRadius`, `boxShadow` to reference `--qs-*` vars via `var(...)`. Enables `bg-qs-ink-900`, `text-qs-gold-500`, `font-display`, `font-mono`, `shadow-qs-lg`, `rounded-qs-md` in JSX.
- `package.json` — add `@fontsource/sora`, `@fontsource/manrope`. Keep existing `@fontsource/jetbrains-mono`. Remove `@fontsource/inter` usage (package can stay until unused-import cleanup).
- `src/renderer/index.html` — set `<html data-theme="dark">`.

Outcome: existing screens render with the new palette, typography, focus rings, and radii with no layout changes. Hard-coded hex values inside components get a find-and-replace cleanup pass (estimate: 1-2 hours).

## Section 2 — Per-screen migration

Each screen gets one focused pass: tokens applied, layout matched to the corresponding JSX in `D:\Quansynd\vibeade\design\src\`. No logic changes. Order is smallest surface first.

1. **Auth** — `AuthScreen.tsx`. Centered card on ink-900. Gold Sign In button. Sign In / Create Account segmented control. Lucide icons in email/password fields. `AuthManager` IPC unchanged. Reference: `design/src/auth.jsx`.
2. **Start (restyle only)** — `StartPage.tsx`. Centered "Get Started" card with three rows (New Workspace, New Swarm, Open Environment). Mode-cards hero deferred to Section 3a. Reference: `design/src/start.jsx`, `design/src/start-content.jsx`.
3. **Workspace shell** — `App.tsx`, `WorkspaceSidebar.tsx`, `WorkspaceTabs.tsx`, `AppMenuBar.tsx`, `WorkspaceExplorerRail.tsx`. Left rail (workspace list + Customize footer + light/dark toggle). Top titlebar (back/forward, search, sidebar toggle, window controls). Main pane area. Bottom status bar (Online indicator, Tasks counter, current workspace path). Reference: `design/src/shell.jsx`, `design/src/workspace.jsx`.
4. **Terminal pane** — `TerminalPane.tsx`, `PaneLayout.tsx`, `TerminalActionMenu.tsx`. Pane header chrome: status dot, workspace path, globe + menu icons. Gold cursor color. JetBrains Mono prompt. Existing split-tree behavior unchanged. Card-grid presets deferred to Section 3b.
5. **TaskBoard** — `TaskBoard.tsx`. Three columns (Backlog / In Progress / Done) with count chips. Search bar. Gold "+ New Task" button. Empty-state copy "No tasks yet." Existing `taskHandlers` IPC unchanged. Reference: `design/src/taskboard.jsx`.
6. **SwarmBoard** — `SwarmBoard.tsx`, `SwarmDashboardDialog.tsx`, `SwarmSessionView.tsx`, `SwarmTerminalView.tsx`. Ink-900 card surfaces, gold status chips, JetBrains Mono agent transcripts. Mindmap is a separate view (Section 3d). Reference: `design/src/swarm.jsx`.
7. **BrowserPane** — `BrowserPane.tsx`. URL bar + nav controls restyled to match the workspace pane chrome. Reference: `design/src/browser.jsx`.
8. **Settings** — `SettingsDialog.tsx`. Top tabs: Appearance, Shortcuts, Environments, Task Board, Account. Appearance pane: Theme Color swatches + Interface Theme cards (System / Dark / Light — Light renders but stays unvalidated). Reference: `design/src/settings.jsx`.
9. **Overlays + small components** — `CreateFlowOverlay.tsx`, `CreateWorkspaceForm.tsx`, `OpenEnvironmentOverlay.tsx`, `Toast.tsx`, `ErrorBoundary.tsx`. Token sweep + modal/overlay treatment from the claude design.

Untouched in this phase: `src/main/**`, `src/preload/**`, `src/shared/**`. Renderer-only.

## Section 3 — New features

### 3a. Three workspace modes on Start

Start page becomes a hero with three large cards (Space / Swarm / Canvas). Each card → "Create workspace in this mode".

Data-model change:

- `Workspace` type gains `mode: 'space' | 'swarm' | 'canvas'`.
- `WorkspaceManager` loader migration: workspaces missing `mode` default to `'space'`. Backwards-compatible with v0.4.1 state files.

Files:

- `src/shared/types.ts` — add `mode` field.
- `src/main/services/WorkspaceManager.ts` — accept `mode` on create; default on load.
- `src/main/ipc/workspaceHandlers.ts` — extend `workspace:create` payload to accept `mode`.
- `src/renderer/src/components/StartPage.tsx` — rewrite with mode hero.
- `src/renderer/src/components/WorkspaceModeCard.tsx` — new small component.
- `App.tsx` — branch render on `workspace.mode`: `'space' | 'swarm'` → `<PaneLayout/>`, `'canvas'` → `<CanvasLayout/>`.

### 3b. Card-grid terminal layout

Implemented as additional layout presets over the existing split-tree, not a new layout engine.

Files:

- `src/renderer/src/services/layoutPresets.ts` — extend with grid presets (2×1, 2×2, 3×2, 4×2). Each preset generates a split tree of equal panes.
- `src/renderer/src/components/LayoutSelector.tsx` — surface the new preset buttons.

The visual "card chrome" per pane (header, status dot, action menu) is already delivered by Section 2 step 4 and applies in both split and grid arrangements.

No data-model change. No IPC change.

### 3c. Canvas mode

Free-form pan/zoom plane with terminals as draggable + resizable cards.

Library: `react-rnd` for drag/resize (~10KB minified).

Data model (only when `workspace.mode === 'canvas'`):

```ts
canvas: {
  transform: { x: number, y: number, scale: number },
  cards: Record<paneId, { x: number, y: number, w: number, h: number }>
}
```

Persisted via existing `workspace:save` channel — no new IPC. `TerminalManager`, `terminal:*` channels, PTY lifecycle all unchanged; the Canvas only relocates terminal cards visually.

Files:

- `src/renderer/src/components/CanvasLayout.tsx` — pan/zoom plane.
- `src/renderer/src/components/CanvasCard.tsx` — wraps `TerminalPane` with drag/resize chrome.
- `src/renderer/src/state/slices/canvasSlice.ts` — local state + persistence calls.
- `App.tsx` — mode branch (already listed in 3a).

### 3d. Tasks ↔ Agents ↔ Files mindmap

A new top-level view inside the workspace shell (left-rail "Memory" entry, full-page swap).

Library: `@xyflow/react` (~50KB) for the graph.

Data sources (all already exist in the main process):

- Tasks — TaskBoard state, already in renderer.
- Agents — `SwarmManager`, already exposed via `swarmHandlers`.
- Files — `FileOwnershipManager`, **not currently bridged to the renderer**.

Edges:

- Task → Agent: from existing task↔agent assignment in TaskBoard state.
- Agent → File: from `FileOwnershipManager`.
- Task → File: derived in the renderer as the union of files touched by all agents assigned to the task.

IPC addition (the only new channel in this redesign):

- `fileOwnership:list` — read-only snapshot of `FileOwnershipManager`.

Files:

- `src/main/ipc/swarmHandlers.ts` — add `fileOwnership:list` handler.
- `src/preload/index.ts`, `src/preload/global.d.ts` — expose the channel.
- `src/shared/ipc.ts` — channel name + payload types.
- `src/renderer/src/components/MindmapView.tsx` — the graph component.
- `src/renderer/src/components/MindmapNode.tsx` — custom node renderers (task / agent / file shapes).
- `src/renderer/src/state/slices/mindmapSlice.ts` — derived selector → `{ nodes, edges }`.
- `src/renderer/src/components/WorkspaceSidebar.tsx` — add "Memory" nav entry.

## Section 4 — Testing, branch, build sequence

### Testing

- **Type gate**: `npm run typecheck` (aliased as `lint`) must pass after every numbered step below.
- **Unit tests (Vitest)** — existing `tests/main/` must keep passing throughout. New tests added for:
  - `WorkspaceManager` mode migration (missing `mode` → `'space'`).
  - `layoutPresets` grid generators (each preset produces the expected split tree).
  - `fileOwnership:list` IPC handler shape.
  - Mindmap derived selector (sample task/agent/file fixture → expected nodes/edges).
- **Renderer smoke** — manual pass against `docs/SMOKE_TEST_CHECKLIST.md` (auth, session, cloud sync) plus a new checklist section covering: mode selection, grid presets, Canvas drag/zoom/persist, mindmap render with seeded data.
- **Visual QA** — each redesigned screen compared against the matching `D:\Quansynd\vibeade\design\src\*.jsx` at the end of its step.
- **Packaging** — `npm run dist:win` produces NSIS + portable installers; both launch and reach Start before merge.

### Branch and rollout

- Branch `redesign/v0.5` off current `main`.
- Single cutover. No feature flag.
- Version bumped to `0.5.0` in the final step.
- Rollback: revert to `main` and ship a patch off the v0.4.x line. Both additive changes (workspace `mode` field, `fileOwnership:list` channel) are backwards-compatible defaults, so partial dogfooding cannot corrupt persisted state.

### Build sequence

Each numbered step is one focused chunk; `npm run typecheck` passes at the end of each.

1. Tokens + Tailwind + fonts (Section 1). Verify: app launches with new colors.
2. Auth screen (Section 2 step 1). Verify: Supabase sign-in still works.
3. Start screen restyle only (Section 2 step 2). Verify: existing list still functional.
4. Workspace shell (Section 2 step 3). Verify: rail, titlebar, status bar render; nav works.
5. Terminal pane chrome (Section 2 step 4). Verify: PTY I/O unchanged; split tree works.
6. TaskBoard restyle (Section 2 step 5). Verify: CRUD + drag between columns unchanged.
7. SwarmBoard restyle (Section 2 step 6). Verify: swarm sessions render; transcripts readable.
8. BrowserPane restyle (Section 2 step 7). Verify: browser loads and navigates.
9. Settings restyle (Section 2 step 8). Verify: all tabs functional.
10. Overlays + Toast + small components (Section 2 step 9). Verify: create-workspace + open-environment flows work.
11. Workspace `mode` field + Start hero with three cards (Section 3a). Verify: existing workspaces migrate to `mode: 'space'`; new workspaces in each mode created and routed correctly.
12. Card-grid layout presets (Section 3b). Verify: each preset spawns expected number of panes; split tree still works.
13. Canvas mode (Section 3c). Verify: terminals drag/resize; pan/zoom and positions persist across reload.
14. `fileOwnership:list` IPC (Section 3d backend slice). Verify: handler returns snapshot; types compile across `preload`, `shared`, `renderer`.
15. Mindmap view (Section 3d frontend slice). Verify: graph renders with seeded data; nav entry reachable from rail.
16. Final pass: bump version to `0.5.0`, extend `docs/SMOKE_TEST_CHECKLIST.md` with new sections, run `npm run dist:win`, complete manual smoke.

## Open questions

- **Mindmap node-layout algorithm**: `@xyflow/react` provides positions on demand but not an automatic layout. Default plan: use `dagre` for an initial layered layout, allow user drag. If `dagre` proves heavy, fall back to a hand-rolled force layout with `d3-force`. To be decided during step 15.
- **Light theme**: tokens are defined but not validated in this release. A follow-up release should add a light-theme validation pass before exposing the Settings "Light" card as a real choice (today it switches `data-theme` but visuals may have gaps).
- **Mode switching for existing workspaces**: an existing workspace's `mode` is set at creation. Whether to allow changing the mode of an existing workspace (Space → Canvas, etc.) post-hoc is deferred; the redesign treats `mode` as immutable. If users ask for it, a small follow-up adds a mode-switch action in workspace settings.

## References

- Visual reference: `D:\Quansynd\Vibe-ADE-REF\` (BridgeMind screenshots).
- Per-screen layouts: `D:\Quansynd\vibeade\design\src\*.jsx`.
- Brand tokens: `D:\Quansynd\vibeade\design\tokens.css`.
- Current architecture: `D:\Quansynd\Vibe ADE\docs\ARCHITECTURE.md`.
- Last shipped release notes: `D:\Quansynd\Vibe ADE\docs\V1_PUBLIC_LAUNCH_STATUS_2026-02-18.md`.
