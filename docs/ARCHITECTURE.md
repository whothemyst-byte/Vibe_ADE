# Vibe-ADE Architecture

## Project Structure

```text
src/
  main/
    index.ts
    ipc/registerIpcHandlers.ts
    services/
      WorkspaceManager.ts
      TerminalManager.ts
      TemplateRunner.ts
      CommandSafety.ts
      templates.ts
    windows/mainWindow.ts
  preload/
    index.ts
    global.d.ts
  renderer/
    index.html
    src/
      App.tsx
      main.tsx
      components/
        WorkspaceTabs.tsx
        PaneLayout.tsx
        TerminalPane.tsx
        CommandBlocks.tsx
        TaskBoard.tsx
        CommandPalette.tsx
      hooks/useIpcEvents.ts
      services/layoutEngine.ts
      state/workspaceStore.ts
      styles/app.css
  shared/
    types.ts
    ipc.ts
```

## Electron Main Process Architecture

- `index.ts`: app bootstrap, service construction, window creation.
- `windows/mainWindow.ts`: BrowserWindow policy and preload wiring.
- `ipc/registerIpcHandlers.ts`: single IPC contract layer.
- `WorkspaceManager`: JSON-backed workspace persistence with atomic write.
- `TerminalManager`: pane-scoped PTY sessions + structured command execution.
- `TemplateRunner`: sequential template command execution with progress events.

## React Component Hierarchy

- `App`
- `WorkspaceTabs`
- `PaneLayout`
- `TerminalPane` (one per pane)
- `CommandBlocks` (inside each pane)
- `TaskBoard`
- `CommandPalette`

## IPC Communication Layer

Channels:

- Workspace:
  - `workspace:list`
  - `workspace:create`
  - `workspace:clone`
  - `workspace:rename`
  - `workspace:remove`
  - `workspace:setActive`
  - `workspace:save`
  - `workspace:listTemplates`
- Terminal:
  - `terminal:startSession`
  - `terminal:stopSession`
  - `terminal:sendInput`
  - `terminal:resize`
  - `terminal:runStructuredCommand`
  - Event: `terminal:data`
  - Event: `terminal:exit`
- Template:
  - Event: `template:progress`

## Terminal Manager Design

- Uses `node-pty` for interactive terminal sessions per pane.
- Supports `powershell` and `cmd` shells.
- Each pane gets independent process lifecycle.
- Structured command blocks execute via child process capture and are appended per pane.

## Workspace Manager Design

Persistent fields:

- Layout tree
- Pane shell assignment
- Active pane
- Command block history per pane
- Task board state

Storage:

- `userData/vibe-ade-state.json`
- atomic write using temp file rename

## Layout Engine Design

- Layout stored as recursive split tree (`pane` / `split`).
- Split node stores direction + percentage sizes.
- Renderer maps layout tree onto nested `react-resizable-panels`.
- Max pane count enforced at 16.
- Split sizes persisted on every layout update.

## Task Board State Model

Task schema:

- `id`
- `title`
- `description`
- `status`: `backlog | in-progress | done`
- `paneId` optional
- timestamps

Board behavior:

- local-only CRUD
- column move
- pane attachment data support

## Build Plan

1. Bootstrapped Electron + React + TypeScript monorepo structure.
2. Added strict shared type contracts for layout, pane sessions, commands, and tasks.
3. Implemented main-process service layer and IPC routing.
4. Implemented renderer store + layout engine with persistence calls.
5. Added xterm-based terminal panes with independent session lifecycle.
6. Added structured command block UX (collapse, rerun, copy).
7. Added local Kanban task board.
8. Added command palette actions (`Ctrl+K`) for workspace/pane/task toggles.
9. Added workspace template execution pipeline with sequential command progress events.
10. Added destructive command detection warnings.

## Next Production Hardening Steps

1. Add end-to-end integration tests for IPC and pane lifecycle.
2. Add explicit shell executable validation and fallback strategy.
3. Add robust command block parser that links interactive prompt boundaries.
4. Add crash-safe session recovery and stale-process cleanup on startup.
5. Add Windows packaging (`electron-builder`) and signed release pipeline.

## Production Pass (Implemented)

- Windows packaging config:
  - `electron-builder.yml` with `nsis` + `portable` targets
  - script: `npm run dist:win`
- Crash/session recovery hardening:
  - `CrashRecoveryManager` tracks clean shutdown and crash events
  - `TerminalManager` persists active PTY PIDs and cleans stale sessions on next startup
  - `WorkspaceManager` includes backup file fallback (`vibe-ade-state.backup.json`)
- Integration tests:
  - `tests/main/registerIpcHandlers.test.ts`
  - `tests/main/TerminalManager.test.ts`
