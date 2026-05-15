# Vibe-ADE v0.5.0 — UI Redesign

Date: 2026-05-14

## Highlights
- New QuanSynd brand identity across every renderer surface (dark ink + warm bronze/gold, Sora + Manrope + JetBrains Mono).
- Three workspace modes on Start: Space, Swarm, Canvas.
- Card-grid terminal layout presets (2x1, 2x2, 3x2, 4x2).
- Canvas mode — free-form pan/zoom plane for terminals.
- Tasks <-> Agents <-> Files mindmap view in the workspace shell.

## Backwards compatibility
- Workspaces saved by v0.4.x load unchanged. They default to `mode: 'space'` on first read.
- One new IPC channel: `fileOwnership:list` (read-only).
- No persisted-state format breaks.

## Verification
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run test`: PASS (76 tests, 27 files)
- `npm run build`: PASS
- `npm run dist:win`: PARTIAL — `release/win-unpacked/` produced; NSIS + portable installer step blocked on this build host (electron-builder download/native-rebuild toolchain). Re-run `npm run dist:win` on a host with Visual Studio Build Tools + clean network to produce signed installers.
- Manual smoke (`docs/SMOKE_TEST_CHECKLIST.md`): DEFERRED — production install of Vibe-ADE on the build machine; smoke pass to be executed against the packaged artifact in an isolated profile.

## Artifacts
- `release/win-unpacked/` — built and verified.
- `release/Vibe-ADE-0.5.0-setup-x64.exe` — pending (re-run `npm run dist:win`).
- `release/Vibe-ADE-0.5.0-portable-x64.exe` — pending (re-run `npm run dist:win`).

## Known gaps
- Light theme tokens are defined but not validated. The Settings "Light" card switches theme but visuals may have minor gaps.
- Workspace mode is fixed at creation. Mode-switching for existing workspaces is a follow-up.
- Mindmap layout is layered (3 columns). A force-directed mode is a follow-up.
- `MindmapView` does not yet display agent nodes (no in-renderer agent registry); task->file edges via `fileOwnership.byTask` are wired and render correctly.
