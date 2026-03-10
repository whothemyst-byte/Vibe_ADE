# Agent Swarm Implementation Sequence

This document describes the implementation sequence for the Agent Swarm feature. No code changes are included here.

## Phase 0 - Grounding and Scope
1. Confirm paths and aliases:
   - src/main/*, src/renderer/src/*, src/shared/ipc.ts, src/preload/index.ts
1. Define swarm terms and app behavior in README.md (optional).

Deliverable: Agreed scope plus data shape documentation.

## Phase 1 - Data Model and Persistence
1. Add swarm types to shared contracts.
   - File: src/shared/types.ts
   - Add Swarm, Agent, SwarmTask, SwarmTranscriptMessage
1. Extend shared IPC shapes.
   - File: src/shared/ipc.ts
   - Add swarm:*, agent:*, swarmTask:*, swarmTranscript:* API signatures
1. Extend persisted app state.
   - File: src/main/services/WorkspaceManager.ts
   - Add swarm sections to app state storage (parallel to workspaces)

Deliverable: Persisted state supports swarm, tasks, transcript.

Checks:
1. npm run typecheck
1. npm test -- --run tests/main/* (if needed)

## Phase 2 - Main Process Orchestration
1. Add Swarm service.
   - File: src/main/services/SwarmManager.ts (new)
   - Swarm CRUD, agent lifecycle, task updates, transcript
1. Extend IPC handlers.
   - File: src/main/ipc/registerIpcHandlers.ts
   - Wire swarm:*, agent:*, swarmTask:*, swarmTranscript:*
1. Terminal control for agents.
   - File: src/main/services/TerminalManager.ts
   - Add agent session support or reuse existing session creation

Deliverable: Swarm actions work in main process and are callable via IPC.

Checks:
1. npm run typecheck
1. npm test -- --run tests/main/*

## Phase 3 - Preload Bridge
1. Expose new APIs.
   - File: src/preload/index.ts
   - Add swarm, agent, swarmTask, swarmTranscript functions

Deliverable: Renderer can call swarm APIs via window.vibeAde.

Checks:
1. npm run typecheck

## Phase 4 - Renderer State
1. Extend Zustand store.
   - File: src/renderer/src/state/workspaceStore.ts
   - Add swarm state branch, active swarm, agent/task/transcript data
   - Actions to call swarm IPC

Deliverable: UI can read and react to swarm data.

Checks:
1. npm run typecheck
1. npm test -- --run tests/renderer/*

## Phase 5 - Swarm UI
1. Add Swarm creation flow.
   - File: src/renderer/src/components/StartPage.tsx
   - Add New Agent Swarm tile and dialog
1. Add Swarm view.
   - File: src/renderer/src/components/SwarmView.tsx (new)
   - Split layout: task board and agent terminals
1. Task board for swarm.
   - File: src/renderer/src/components/SwarmTaskBoard.tsx (new) or reuse TaskBoard with swarm variant
   - Show per-agent status controls
1. Transcript feed.
   - File: src/renderer/src/components/SwarmTranscriptFeed.tsx (new)
   - Filter by agent and task

Deliverable: User can create swarm, assign tasks, see transcript feed.

Checks:
1. npm run typecheck
1. npm test -- --run tests/renderer/*

## Phase 6 - Agent Terminal Integration (Read-Only)
1. Extend TerminalPane for read-only mode.
   - File: src/renderer/src/components/TerminalPane.tsx
   - Disable input events for swarm agents
1. Agent layout.
   - File: src/renderer/src/components/SwarmView.tsx
   - Render a grid of TerminalPane with read-only mode

Deliverable: Each agent is a read-only terminal and auto-launched.

Checks:
1. npm run typecheck
1. Add renderer tests verifying read-only behavior

## Phase 7 - Task-to-Agent Orchestration
1. On Launch Swarm:
   - Inject role and task context into each agent session
1. Transcript:
   - Capture terminal output, store transcript, notify UI

Deliverable: Agent collaboration via shared transcript feed.

Checks:
1. npm test -- --run tests/main/*
1. npm test -- --run tests/renderer/*

## Phase 8 - Cloud Sync
1. Extend existing CloudSyncManager.
   - File: src/main/services/CloudSyncManager.ts
   - Sync swarm state, tasks, transcript
1. Conflict handling.
   - Add swarm conflict preview shape

Deliverable: Swarm state syncs across devices.

Checks:
1. npm run typecheck
1. npm test -- --run tests/main/*

## Phase 9 - Smoke and QA Checklist
1. Update docs/SMOKE_TEST_CHECKLIST.md:
   - Add steps for swarm creation, task assignment, agent launch, transcript visibility

Deliverable: Updated smoke test coverage.
