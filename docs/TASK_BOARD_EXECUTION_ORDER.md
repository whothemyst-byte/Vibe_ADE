# Task Board Execution Order

This is the implementation sequence for delivering a complete Task Board from data model to UI and test coverage.

## Phase 1: Types (Start Here)
- File: `src/shared/types.ts`
- Add:
  - `TaskPriority`
  - `TaskSortMode`
  - `TaskFilterState`
- Extend `TaskItem` with:
  - `priority?`
  - `dueAt?`
  - `labels?`
  - `archived?`
  - `order?`
- Goal:
  - Introduce the complete task schema in a backward-compatible way.

## Phase 2: Store Actions and Selectors
- File: `src/renderer/src/state/workspaceStore.ts`
- Add actions:
  - create/update/delete/archive/move/reorder
- Add task board UI state:
  - search/filter/sort
- Add selectors:
  - visible/sorted/filtered task lists

## Phase 3: IPC Contract
- Files:
  - `src/shared/ipc.ts`
  - `src/preload/index.ts`
- Add task IPC surface:
  - list/create/update/delete/move/archive

## Phase 4: Main IPC Handlers + Validation
- File: `src/main/ipc/registerIpcHandlers.ts`
- Register `task:*` handlers with payload validation and persistence wiring.

## Phase 5: Main Persistence and Migration Logic
- File: `src/main/services/WorkspaceManager.ts`
- Add task normalization/migration defaults for legacy workspaces.
- Ensure stable ordering behavior after move/delete/archive.

## Phase 6: Task Board UI Completion
- File: `src/renderer/src/components/TaskBoard.tsx`
- Implement:
  - full board toolbar
  - create/edit flows
  - drag-drop across columns
  - status actions and pane attach

## Phase 7: Styling and Theme Parity
- File: `src/renderer/src/styles/app.css`
- Add complete Task Board visual system for light/dark modes.

## Phase 8: Command Palette and Shortcut Integration
- Files:
  - `src/renderer/src/components/CommandPalette.tsx`
  - `src/renderer/src/services/preferences.ts`
  - `src/renderer/src/components/SettingsDialog.tsx`
- Add optional task-focused shortcuts and palette commands.

## Phase 9: Tests
- Files:
  - `tests/main/registerIpcHandlers.test.ts`
  - `tests/main/WorkspaceManager.test.ts` (new)
  - `tests/renderer/workspaceStore.taskboard.test.ts` (new)
  - `tests/renderer/TaskBoard.test.tsx` (new)
- Cover:
  - validation
  - ordering logic
  - persistence
  - UI flows

## Phase 10: Final Migration + Smoke
- Backward compatibility validation against existing saved workspaces.
- Manual smoke:
  - create/edit/delete/move
  - restart persistence
  - workspace switching
  - cloud sync compatibility

