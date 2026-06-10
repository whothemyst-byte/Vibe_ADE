# Performance Overhaul + Agent Card Polish — Design

**Date:** 2026-06-10
**Status:** Approved
**Inspiration:** cnvs.dev (agent cards with names, status footers, smooth canvas)

## Problem

Vibe Walls renders floating xterm terminal windows over an Excalidraw canvas. Five
performance problems make the core experience (many live agent terminals on a canvas)
sluggish, and the terminal cards lack the at-a-glance status that makes cnvs-style
walls legible:

1. **Per-frame React camera sync.** Excalidraw `onChange` fires on every pointer-move;
   `WallView` calls `setCamera`, which re-renders `TerminalOverlay` and every
   `TerminalWindow` (live xterm DOM inside) on every pan/zoom frame.
2. **Per-frame store updates during drag/resize.** Each pointer-move writes the zustand
   store, re-rendering all terminals and churning the autosave subscription.
3. **Slow terminal renderer.** xterm uses the default DOM renderer with unbounded
   scrollback; busy agent output chugs.
4. **Inefficient PTY transport.** Raw bytes cross Rust→JS as JSON number arrays
   (`[27,91,...]`) via Tauri events — ~4x payload size plus parse cost per 4 KB chunk,
   one IPC message per `read()`, no coalescing.
5. **Thumbnail export on every save.** A PNG `exportToBlob` (full canvas render) runs
   on every debounced save (800 ms after any change), including during interaction.

## Design

### 1. Imperative world-space overlay (fixes #1)

`.terminal-overlay` becomes a world-space layer:

- Each terminal window is positioned at its raw world coordinates
  (`left: t.x; top: t.y; width: t.w; height: t.h`) inside the layer.
- The layer carries `transform-origin: 0 0` and
  `transform: scale(z) translate(camX px, camY px)`, which reproduces the existing
  math `screen = (world + cam) * z`.
- Excalidraw `onChange` writes the camera into a ref and schedules **one**
  `requestAnimationFrame` callback that sets the layer's `style.transform` directly.
  No React state per frame. The `camera` React state in `WallView` is removed;
  consumers (drag math, spawn placement) read the camera ref.
- `TerminalOverlay` re-renders only when the terminals array changes.

Rejected alternative: keep `setCamera` + heavy memoization. Still pays React
reconciliation every frame; ceiling too low.

### 2. Gesture-local drag/resize (fixes #2)

- During a drag/resize, pointer-moves update the dragged window's element style
  directly (via ref). The zustand store gets a **single** update on pointer-up,
  which also triggers exactly one autosave.
- `TerminalWindow` is wrapped in `React.memo` so one terminal's store change does
  not re-render the others.

### 3. WebGL terminal renderer (fixes #3)

- Add `@xterm/addon-webgl`. Activate after `term.open()`; on WebGL context creation
  failure (or context loss), fall back to the DOM renderer gracefully.
- Bound scrollback (5000 lines).

### 4. Binary, coalesced PTY transport (fixes #4)

- Replace per-chunk `emit(data_channel, Vec<u8>)` events with a Tauri 2
  `tauri::ipc::Channel` passed into `pty_spawn`, sending **raw binary** payloads
  (no JSON arrays). Frontend receives bytes via the channel's `onmessage`.
- Coalesce in the Rust reader thread: accumulate consecutive reads for ~8–16 ms or
  until ~64 KB, then send one message. Heavy agent output no longer floods IPC.
- PTY exit remains a Tauri event (`pty://exit/<id>`). Keystroke writes keep the
  existing `invoke("pty_write")` path (tiny payloads).

### 5. Throttled thumbnails (fixes #5)

- Wall doc save stays debounced at 800 ms (cheap JSON serialization).
- Thumbnail `exportToBlob` runs at most once per ~20 s, plus once on wall
  exit/unmount. Failures stay best-effort.

### 6. Agent card polish (cnvs-inspired)

- **Names:** each terminal gets a short generated agent name at spawn (e.g. "Chase",
  "Marshall") from a curated list, stored on `TerminalState` and persisted in
  `WallDoc.terminals`. Docs saved before this change get names assigned on load.
- **Header:** the tier dot becomes a status dot — pulsing amber while the agent is
  *working* (any PTY output within the last ~2.5 s), dim neutral when idle. Title
  becomes "Name · Preset label". Warm Quansynd palette throughout (no blue).
- **Footer status line:** "Working 4m 12s" while active; "Cooked for 13m 30s" when
  idle, where the duration is **cumulative working time** (sum of active spans), not
  wall-clock since spawn. Rendered by a small isolated component that ticks once per
  second without re-rendering the xterm subtree. Activity timestamps live in refs /
  a per-terminal lightweight store slice so ticks never touch other windows.

### Data model changes

`TerminalState` and the persisted `WallDoc` terminal entries gain:

- `name: string` — generated agent name.

Working-time tracking is runtime-only (not persisted); a restored terminal starts
idle with zero accumulated time.

## Error handling

- WebGL addon activation wrapped in try/catch → DOM renderer fallback.
- Channel teardown on terminal close/kill mirrors current unlisten behavior; late
  messages after dispose are dropped.
- Thumbnail export remains best-effort (catch and continue).

## Testing

- Vitest units for new pure logic: agent name picker (no immediate repeats among
  live terminals), working-status/elapsed-time reducer, world-layer transform math
  (`screen = (world + cam) * z` equivalence with existing `worldRectToScreen`).
- Existing `transform`, `excalidrawCamera`, `terminalStore`, `presets` tests stay
  green.
- Manual verification: run the app, spawn 4+ agents with live output, confirm
  smooth pan/zoom/drag, terminal throughput, status dot/footer behavior, and that
  saved walls round-trip names.

## Out of scope

- Top pill bar redesign, media/YouTube nodes, parsed transcript view (future
  cnvs-parity rounds).
- Changes to Excalidraw scene handling, presets, taskboard, or start page.
