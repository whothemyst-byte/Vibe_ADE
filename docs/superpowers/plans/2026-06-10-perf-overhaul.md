# Performance Overhaul + Agent Card Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pan/zoom/drag and terminal output buttery with many live agent terminals, and give terminal cards cnvs-style names + working/idle status.

**Architecture:** Terminals move into a single world-space overlay layer whose CSS transform is updated imperatively (one rAF per camera change, zero React work per frame). Drag/resize become gesture-local (store commit on release only). PTY bytes flow over a Tauri 2 ipc Channel as raw binary with read coalescing in Rust. xterm gets the WebGL renderer. Thumbnails throttle to ~20s. New pure modules handle agent names and working-time tracking.

**Tech Stack:** React 19, zustand, Excalidraw 0.18, @xterm/xterm 6 + @xterm/addon-webgl 0.19, Tauri 2 (tauri::ipc::Channel, portable-pty), vitest, cargo test.

**Spec:** `docs/superpowers/specs/2026-06-10-perf-overhaul-design.md`

**Working directory:** all commands run from `vibe-walls/` (frontend) or `vibe-walls/src-tauri/` (Rust). NEVER touch sibling projects' `target/` or `node_modules/` directories — disk space is tight on this machine.

## File Map

| File | Change |
| --- | --- |
| `src/wall/agentNames.ts` (new) | curated name list + `pickAgentName` |
| `src/wall/agentNames.test.ts` (new) | unit tests |
| `src/wall/agentStatus.ts` (new) | working/idle activity reducer + formatting |
| `src/wall/agentStatus.test.ts` (new) | unit tests |
| `src/wall/transform.ts` | add `layerTransform`, `FOOTER_H` |
| `src/wall/transform.test.ts` | equivalence test for `layerTransform` |
| `src-tauri/src/pty/actor.rs` | channel transport + coalescing forwarder |
| `src-tauri/src/pty/commands.rs` | `pty_spawn` takes a Channel |
| `src/pty/client.ts` | `spawnPty` with `onData` channel callback, `toBytes` |
| `src/pty/client.test.ts` | update for new API |
| `src/wall/TerminalOverlay.tsx` | world-space layer, no camera prop |
| `src/wall/TerminalWindow.tsx` | owns wrapper div, memo, imperative drag/resize, WebGL, activity, footer |
| `src/wall/StatusFooter.tsx` (new) | 1s ticker rendering status line + data-working attribute |
| `src/wall/WallView.tsx` | camera ref + rAF transform, thumbnail throttle, exit save, names on load/spawn |
| `src/store/types.ts` | `SavedTerminal.name?` |
| `src/wall/terminalStore.ts` | `TerminalState.name` |
| `src/App.css` | `.terminal-layer`, status dot/footer styles |
| `package.json` | add `@xterm/addon-webgl` |

---

### Task 1: Agent name picker

**Files:**
- Create: `src/wall/agentNames.ts`
- Test: `src/wall/agentNames.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/wall/agentNames.test.ts
import { describe, expect, it } from "vitest";
import { AGENT_NAMES, pickAgentName } from "./agentNames";

describe("pickAgentName", () => {
  it("returns a name from the curated list", () => {
    expect(AGENT_NAMES).toContain(pickAgentName([], () => 0));
  });

  it("never returns a taken name while free names remain", () => {
    const taken = AGENT_NAMES.slice(0, AGENT_NAMES.length - 1);
    expect(pickAgentName(taken, () => 0.99)).toBe(AGENT_NAMES[AGENT_NAMES.length - 1]);
  });

  it("suffixes a counter when every base name is taken", () => {
    const taken = [...AGENT_NAMES];
    expect(pickAgentName(taken, () => 0)).toBe(`${AGENT_NAMES[0]} 2`);
  });

  it("skips suffixed names that are also taken", () => {
    const taken = [...AGENT_NAMES, `${AGENT_NAMES[0]} 2`];
    expect(pickAgentName(taken, () => 0)).toBe(`${AGENT_NAMES[0]} 3`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wall/agentNames.test.ts`
Expected: FAIL — cannot resolve `./agentNames`

- [ ] **Step 3: Write the implementation**

```ts
// src/wall/agentNames.ts
/** Short friendly agent names shown in terminal card headers (cnvs-style). */
export const AGENT_NAMES = [
  "Atlas", "Juno", "Miles", "Hazel", "Wren", "Otis", "Nova", "Reed",
  "Ivy", "Felix", "Luna", "Moss", "Sage", "Remy", "Cleo", "Dash",
  "Ember", "Finch", "Goldie", "Hank", "Indie", "Jett", "Koda", "Lark",
  "Maple", "Nico", "Olive", "Pico", "Quill", "Rosco", "Scout", "Tilly",
  "Umber", "Vesper", "Willa", "Ziggy",
];

/** Picks a random name not in `taken`; suffixes a counter once all are in use. */
export function pickAgentName(taken: string[], rand: () => number = Math.random): string {
  const free = AGENT_NAMES.filter((n) => !taken.includes(n));
  if (free.length > 0) return free[Math.floor(rand() * free.length)];
  const base = AGENT_NAMES[Math.floor(rand() * AGENT_NAMES.length)];
  let i = 2;
  while (taken.includes(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/wall/agentNames.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add src/wall/agentNames.ts src/wall/agentNames.test.ts
git commit -m "feat(wall): agent name picker for terminal cards"
```

### Task 2: Agent activity tracker

Pure logic for the working/idle status dot and the cumulative working-time footer
("Working 4m 12s" / "Cooked for 13m 30s"). An agent is *working* while PTY output
arrived within the last `IDLE_AFTER_MS`. Working time is the sum of active spans —
not wall-clock since spawn.

**Files:**
- Create: `src/wall/agentStatus.ts`
- Test: `src/wall/agentStatus.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/wall/agentStatus.test.ts
import { describe, expect, it } from "vitest";
import {
  IDLE_AFTER_MS, newActivity, recordOutput, settle,
  isWorking, workedMs, formatElapsed, statusLabel,
} from "./agentStatus";

describe("activity tracking", () => {
  it("starts idle with zero worked time", () => {
    const a = newActivity();
    expect(isWorking(a, 1000)).toBe(false);
    expect(workedMs(a, 1000)).toBe(0);
    expect(statusLabel(a, 1000)).toBe("Idle");
  });

  it("is working right after output, idle once IDLE_AFTER_MS passes", () => {
    const a = recordOutput(newActivity(), 1000);
    expect(isWorking(a, 1000 + IDLE_AFTER_MS - 1)).toBe(true);
    expect(isWorking(a, 1000 + IDLE_AFTER_MS)).toBe(false);
  });

  it("accumulates the live span while working", () => {
    let a = recordOutput(newActivity(), 1000);
    a = recordOutput(a, 5000);
    expect(workedMs(a, 6000)).toBe(5000); // 1000 -> 6000, still working
  });

  it("caps a finished span at the last output time", () => {
    const a = recordOutput(newActivity(), 1000);
    // long idle: span counts 1000 -> 1000 (zero length), not up to `now`
    expect(workedMs(a, 60_000)).toBe(0);
  });

  it("settle folds the finished span and a new span adds to it", () => {
    let a = recordOutput(newActivity(), 1000);
    a = recordOutput(a, 4000); // span worth 3000ms
    a = settle(a, 4000 + IDLE_AFTER_MS); // idle -> fold
    expect(a.activeSince).toBeNull();
    expect(workedMs(a, 99_000)).toBe(3000);
    a = recordOutput(a, 100_000);
    expect(workedMs(a, 102_000)).toBe(5000); // 3000 folded + 2000 live
  });

  it("settle is a no-op while still working", () => {
    const a = recordOutput(newActivity(), 1000);
    expect(settle(a, 1500)).toEqual(a);
  });
});

describe("formatting", () => {
  it("formats seconds, minutes, hours", () => {
    expect(formatElapsed(45_000)).toBe("45s");
    expect(formatElapsed(252_000)).toBe("4m 12s");
    expect(formatElapsed(3_660_000)).toBe("1h 1m");
  });

  it("labels working and cooked states", () => {
    let a = recordOutput(newActivity(), 0);
    a = recordOutput(a, 252_000);
    expect(statusLabel(a, 252_000)).toBe("Working 4m 12s");
    a = settle(a, 252_000 + IDLE_AFTER_MS);
    expect(statusLabel(a, 300_000)).toBe("Cooked for 4m 12s");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wall/agentStatus.test.ts`
Expected: FAIL — cannot resolve `./agentStatus`

- [ ] **Step 3: Write the implementation**

```ts
// src/wall/agentStatus.ts
/** An agent counts as working while output arrived within this window. */
export const IDLE_AFTER_MS = 2500;

export type Activity = {
  /** Sum of completed working spans, in ms. */
  doneMs: number;
  /** Start of the current span, or null when no span is open. */
  activeSince: number | null;
  /** Timestamp of the most recent PTY output (0 = never). */
  lastOutputAt: number;
};

export const newActivity = (): Activity => ({ doneMs: 0, activeSince: null, lastOutputAt: 0 });

/** Call whenever PTY output arrives. Opens a span if none is active. */
export function recordOutput(a: Activity, now: number): Activity {
  return { doneMs: a.doneMs, activeSince: a.activeSince ?? now, lastOutputAt: now };
}

/** Folds the open span into doneMs once the agent has gone idle. */
export function settle(a: Activity, now: number): Activity {
  if (a.activeSince !== null && now - a.lastOutputAt >= IDLE_AFTER_MS) {
    return {
      doneMs: a.doneMs + (a.lastOutputAt - a.activeSince),
      activeSince: null,
      lastOutputAt: a.lastOutputAt,
    };
  }
  return a;
}

export function isWorking(a: Activity, now: number): boolean {
  return a.activeSince !== null && now - a.lastOutputAt < IDLE_AFTER_MS;
}

/** Total working ms: completed spans plus the live one (capped at last output when idle). */
export function workedMs(a: Activity, now: number): number {
  if (a.activeSince === null) return a.doneMs;
  const end = isWorking(a, now) ? now : a.lastOutputAt;
  return a.doneMs + (end - a.activeSince);
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function statusLabel(a: Activity, now: number): string {
  const worked = workedMs(a, now);
  if (isWorking(a, now)) return `Working ${formatElapsed(worked)}`;
  if (worked > 0) return `Cooked for ${formatElapsed(worked)}`;
  return "Idle";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/wall/agentStatus.test.ts`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add src/wall/agentStatus.ts src/wall/agentStatus.test.ts
git commit -m "feat(wall): agent working/idle activity tracker"
```

### Task 3: World-layer transform helper

One CSS transform on the overlay layer must reproduce the existing per-window math
`screen = (world + cam) * z`. CSS applies right-to-left, so `scale(z) translate(x, y)`
maps a point `p` to `(p + cam) * z` — exactly `worldRectToScreen`.

**Files:**
- Modify: `src/wall/transform.ts` (append at end of file)
- Test: `src/wall/transform.test.ts` (append a new describe block)

- [ ] **Step 1: Write the failing test**

Append to `src/wall/transform.test.ts` (add `layerTransform` to the existing import from `./transform`):

```ts
describe("layerTransform", () => {
  it("scale-then-translate reproduces worldRectToScreen", () => {
    const cam = { x: 120, y: -40, z: 1.5 };
    expect(layerTransform(cam)).toBe("scale(1.5) translate(120px, -40px)");
    // CSS right-to-left order: p -> translate -> scale = (p + cam) * z,
    // which is exactly worldRectToScreen's mapping for the rect origin.
    const rect = { x: 10, y: 20, w: 100, h: 50 };
    const screen = worldRectToScreen(rect, cam);
    expect((rect.x + cam.x) * cam.z).toBe(screen.left);
    expect((rect.y + cam.y) * cam.z).toBe(screen.top);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wall/transform.test.ts`
Expected: FAIL — `layerTransform` is not exported

- [ ] **Step 3: Write the implementation**

Append to `src/wall/transform.ts`:

```ts
/** Height (world px) of the terminal card's status footer. */
export const FOOTER_H = 22;

/**
 * CSS transform for the world-space terminal layer. Children positioned at raw
 * world coordinates land at screen = (world + cam) * z, matching worldRectToScreen.
 * (CSS applies transforms right-to-left: translate first, then scale.)
 */
export function layerTransform(cam: Camera): string {
  return `scale(${cam.z}) translate(${cam.x}px, ${cam.y}px)`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/wall/transform.test.ts`
Expected: all pass (existing tests stay green)

- [ ] **Step 5: Commit**

```bash
git add src/wall/transform.ts src/wall/transform.test.ts
git commit -m "feat(wall): layerTransform for world-space terminal layer"
```

### Task 4: Rust — binary coalesced PTY channel transport

Replace the per-read `emit(pty://data/<id>, Vec<u8>)` event (JSON number array) with a
`tauri::ipc::Channel` sending **raw binary** (`InvokeResponseBody::Raw`). The reader
thread pushes chunks into a bounded tokio mpsc; an async forwarder drains whatever is
immediately available (up to 64 KB) into one message — coalescing only when output
outpaces the consumer, with zero added latency for single chunks. The exit event
(`pty://exit/<id>`) stays.

**Files:**
- Modify: `src-tauri/src/pty/actor.rs`
- Modify: `src-tauri/src/pty/commands.rs`
- Tests: inline `#[cfg(test)]` in `actor.rs`

- [ ] **Step 1: Write the failing test**

In `src-tauri/src/pty/actor.rs`, replace the existing `mod tests` block at the bottom with:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exit_channel_is_namespaced_by_id() {
        assert_eq!(exit_channel("abc"), "pty://exit/abc");
    }

    #[test]
    fn drain_pending_concatenates_available_chunks() {
        let (tx, mut rx) = mpsc::channel::<Vec<u8>>(8);
        tx.try_send(vec![2, 3]).unwrap();
        tx.try_send(vec![4]).unwrap();
        assert_eq!(drain_pending(&mut rx, vec![1]), vec![1, 2, 3, 4]);
    }

    #[test]
    fn drain_pending_returns_first_alone_when_queue_is_empty() {
        let (_tx, mut rx) = mpsc::channel::<Vec<u8>>(8);
        assert_eq!(drain_pending(&mut rx, vec![9]), vec![9]);
    }

    #[test]
    fn drain_pending_stops_at_the_batch_cap() {
        let (tx, mut rx) = mpsc::channel::<Vec<u8>>(8);
        tx.try_send(vec![1]).unwrap();
        let batch = drain_pending(&mut rx, vec![0; BATCH_CAP]);
        assert_eq!(batch.len(), BATCH_CAP); // queued chunk stays for the next batch
        assert_eq!(rx.try_recv().unwrap(), vec![1]);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `src-tauri/`): `cargo test`
Expected: compile FAIL — `drain_pending` and `BATCH_CAP` not found

- [ ] **Step 3: Rewrite `actor.rs` transport**

Apply these changes to `src-tauri/src/pty/actor.rs`:

**3a.** Update imports and `SpawnConfig` — replace the current `use tauri::{AppHandle, Emitter};` line and add the channel field:

```rust
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter};
```

```rust
pub struct SpawnConfig {
    pub id: String,
    pub shell: String,
    pub cwd: Option<String>,
    pub rows: u16,
    pub cols: u16,
    /// Optional command typed into the shell after a warm-up delay (e.g. "claude").
    /// Used to launch an agent CLI inside the spawned shell rather than spawning the
    /// CLI's .cmd shim directly under ConPTY.
    pub command: Option<String>,
    /// IPC channel that receives raw output bytes (coalesced batches).
    pub on_data: Channel<InvokeResponseBody>,
}
```

**3b.** Delete the `data_channel` function (keep `exit_channel`).

**3c.** Add the batching constant and helper above `spawn`:

```rust
/// Max bytes per coalesced IPC message.
const BATCH_CAP: usize = 64 * 1024;

/// Appends every immediately-available chunk to `batch` (no waiting), stopping at
/// BATCH_CAP. Coalesces only when the PTY outpaces the IPC consumer, so single
/// chunks are forwarded with zero added latency.
fn drain_pending(rx: &mut mpsc::Receiver<Vec<u8>>, mut batch: Vec<u8>) -> Vec<u8> {
    while batch.len() < BATCH_CAP {
        match rx.try_recv() {
            Ok(more) => batch.extend_from_slice(&more),
            Err(_) => break,
        }
    }
    batch
}
```

**3d.** Replace the reader thread block (the whole `// Reader thread: ...` section, from `let reader_app = app.clone();` through the closing of `std::thread::spawn`) with a reader → forwarder pair:

```rust
    // Reader thread: blocking read -> bounded queue. Dropping the sender on EOF
    // closes the queue, which makes the forwarder emit the exit event.
    let (chunk_tx, mut chunk_rx) = mpsc::channel::<Vec<u8>>(256);
    std::thread::spawn(move || {
        let mut reader = {
            let mut guard = reader_master.lock();
            match guard.try_clone_reader() {
                Ok(r) => r,
                Err(_) => return,
            }
        };
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if chunk_tx.blocking_send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // Forwarder: coalesce queued chunks into one raw binary IPC message.
    let forward_app = app.clone();
    let on_data = cfg.on_data.clone();
    let exit_id = cfg.id.clone();
    tokio::spawn(async move {
        while let Some(first) = chunk_rx.recv().await {
            let batch = drain_pending(&mut chunk_rx, first);
            if on_data.send(InvokeResponseBody::Raw(batch)).is_err() {
                break;
            }
        }
        let _ = forward_app.emit(&exit_channel(&exit_id), ());
    });
```

Note: `let reader_app = app.clone();` and `let id = cfg.id.clone();` from the old
reader block both disappear — the reader no longer emits anything; the forwarder
uses `exit_id` for the exit event.

**3e.** The auto-run injection block and the command loop stay unchanged.

- [ ] **Step 4: Update `pty_spawn` command**

In `src-tauri/src/pty/commands.rs`, add the channel parameter and pass it through:

```rust
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, State};

use super::actor::{spawn, SpawnConfig};
use super::registry::{PtyCommand, PtyRegistry};

#[tauri::command]
pub async fn pty_spawn(
    app: AppHandle,
    registry: State<'_, PtyRegistry>,
    id: String,
    shell: String,
    cwd: Option<String>,
    rows: u16,
    cols: u16,
    command: Option<String>,
    on_data: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    if registry.contains(&id) {
        return Ok(()); // already running; idempotent
    }
    let handle = spawn(
        app,
        SpawnConfig { id: id.clone(), shell, cwd, rows, cols, command, on_data },
    )
    .map_err(|e| e.to_string())?;
    registry.insert(id, handle);
    Ok(())
}
```

(`pty_write`, `pty_resize`, `pty_kill` are unchanged.)

- [ ] **Step 5: Build and test**

Run (from `src-tauri/`): `cargo test`
Expected: compiles; all tests pass including the three `drain_pending` tests.
If `Channel`/`InvokeResponseBody` imports fail, check the tauri crate version supports
`tauri::ipc::Channel` (Tauri 2.x does) — do not downgrade or add new crates.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/pty/actor.rs src-tauri/src/pty/commands.rs
git commit -m "perf(pty): raw binary channel transport with read coalescing"
```

Note: the frontend is now broken (it still listens for `pty://data` events) until
Task 5 lands. That's expected mid-plan; Tasks 4+5 together restore a working app.

### Task 5: Frontend PTY client over the channel

**Files:**
- Modify: `src/pty/client.ts`
- Modify: `src/pty/client.test.ts`
- Modify: `src/wall/TerminalWindow.tsx` (the spawn effect only)

- [ ] **Step 1: Write the failing test**

Replace `src/pty/client.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { exitChannel, toBytes } from "./client";

describe("pty client", () => {
  it("namespaces the exit channel by id, matching the Rust side", () => {
    expect(exitChannel("abc")).toBe("pty://exit/abc");
  });

  it("normalizes ArrayBuffer channel payloads to Uint8Array", () => {
    const buf = new Uint8Array([27, 91, 65]).buffer;
    expect(Array.from(toBytes(buf))).toEqual([27, 91, 65]);
  });

  it("normalizes number-array channel payloads to Uint8Array", () => {
    expect(Array.from(toBytes([27, 91, 65]))).toEqual([27, 91, 65]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pty/client.test.ts`
Expected: FAIL — `toBytes` is not exported (and `dataChannel` import is gone)

- [ ] **Step 3: Rewrite `client.ts`**

Replace `src/pty/client.ts` with:

```ts
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const exitChannel = (id: string) => `pty://exit/${id}`;

/** Raw channel payloads arrive as ArrayBuffer on the fast path; some platforms
    may deliver plain number arrays. Normalize to Uint8Array for xterm. */
export function toBytes(msg: ArrayBuffer | number[]): Uint8Array {
  return msg instanceof ArrayBuffer ? new Uint8Array(msg) : Uint8Array.from(msg);
}

export function spawnPty(args: {
  id: string;
  shell: string;
  cwd?: string;
  rows: number;
  cols: number;
  command?: string;
  onData: (bytes: Uint8Array) => void;
}): Promise<void> {
  const { onData, ...rest } = args;
  const ch = new Channel<ArrayBuffer | number[]>();
  ch.onmessage = (msg) => onData(toBytes(msg));
  return invoke("pty_spawn", { ...rest, onData: ch });
}

export function writePty(id: string, data: Uint8Array): Promise<void> {
  return invoke("pty_write", { id, data: Array.from(data) });
}

export function resizePty(id: string, rows: number, cols: number): Promise<void> {
  return invoke("pty_resize", { id, rows, cols });
}

export function killPty(id: string): Promise<void> {
  return invoke("pty_kill", { id });
}

export function onPtyExit(id: string, cb: () => void): Promise<UnlistenFn> {
  return listen(exitChannel(id), () => cb());
}
```

- [ ] **Step 4: Rewire the spawn effect in `TerminalWindow.tsx`**

In the first `useEffect`, update the import line to drop `onPtyData`:

```ts
import { spawnPty, writePty, resizePty, killPty, onPtyExit } from "../pty/client";
```

and replace the async IIFE (the block starting `(async () => {` containing
`onPtyData`/`onPtyExit`/`spawnPty`) with:

```ts
    (async () => {
      const uExit = await onPtyExit(id, () => { if (!disposed) remove(id); });
      if (disposed) { uExit(); return; }
      unlisteners.push(uExit);

      await spawnPty({
        id,
        shell: "powershell.exe",
        cwd: cwd || undefined,
        rows: term.rows,
        cols: term.cols,
        command: preset.command,
        onData: (bytes) => { if (!disposed) term.write(bytes); },
      });
    })();
```

- [ ] **Step 5: Verify**

Run: `npx vitest run` — all suites pass.
Run: `npx tsc --noEmit` — no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/pty/client.ts src/pty/client.test.ts src/wall/TerminalWindow.tsx
git commit -m "perf(pty): consume raw binary channel in frontend client"
```

### Task 6: World-space overlay + imperative camera

The core perf fix. Terminals render at raw world coordinates inside one
`.terminal-layer` div; pan/zoom updates only that layer's CSS transform via rAF.
The `camera` React state in `WallView` is deleted. No new unit tests (covered by
Task 3's math test + manual verification); existing suites must stay green.

**Files:**
- Modify: `src/wall/WallView.tsx`
- Modify: `src/wall/TerminalOverlay.tsx`
- Modify: `src/wall/TerminalWindow.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add the layer style in `App.css`**

After the `.terminal-overlay` rule, add:

```css
.terminal-layer { position: absolute; inset: 0; transform-origin: 0 0; will-change: transform; }
```

- [ ] **Step 2: Rewrite `TerminalOverlay.tsx`**

```tsx
import type { RefObject } from "react";
import { useTerminalStore } from "./terminalStore";
import { layerTransform, type Camera } from "./transform";
import { TerminalWindow } from "./TerminalWindow";

export function TerminalOverlay({
  layerRef,
  cameraRef,
}: {
  layerRef: RefObject<HTMLDivElement | null>;
  cameraRef: RefObject<Camera>;
}) {
  const terminals = useTerminalStore((s) => s.terminals);
  return (
    <div className="terminal-overlay">
      {/* Pan/zoom only touches this layer's transform (set imperatively via rAF
          in WallView); cameraRef is always current so re-renders stay consistent. */}
      <div
        ref={layerRef}
        className="terminal-layer"
        style={{ transform: layerTransform(cameraRef.current) }}
      >
        {terminals.map((t) => (
          <TerminalWindow key={t.id} terminal={t} cameraRef={cameraRef} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Move the wrapper div into `TerminalWindow.tsx`**

Change the signature and have the component own its world-positioned wrapper:

```tsx
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
```

```tsx
export function TerminalWindow({
  terminal,
  cameraRef,
}: {
  terminal: TerminalState;
  cameraRef: RefObject<Camera>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
```

(`Camera` comes from `./transform` — extend the existing `HEADER_H` import line:
`import { HEADER_H, type Camera } from "./transform";`)

Replace `zoom` reads in `beginDrag`/`beginResize` with a gesture-start capture
(`const z = cameraRef.current.z;` as the first line after `e.stopPropagation()`,
then use `z` in place of `zoom`). The camera cannot change mid-gesture because the
pointer is captured by the window, not the canvas.

Wrap the returned fragment in the wrapper div (the fragment's contents are unchanged):

```tsx
  return (
    <div
      ref={wrapRef}
      className="terminal-window"
      style={{
        transform: `translate(${terminal.x}px, ${terminal.y}px)`,
        width: terminal.w,
        height: terminal.h,
      }}
    >
      {/* ...existing header / body / start / resize children... */}
    </div>
  );
```

- [ ] **Step 4: Replace camera state with refs in `WallView.tsx`**

Remove `const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);` and add:

```ts
  const cameraRef = useRef<Camera>(DEFAULT_CAMERA);
  const layerRef = useRef<HTMLDivElement>(null);
  const rafPending = useRef(false);

  const applyCamera = useCallback((next: Camera) => {
    const prev = cameraRef.current;
    if (prev.x === next.x && prev.y === next.y && prev.z === next.z) return;
    cameraRef.current = next;
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const el = layerRef.current;
      if (el) el.style.transform = layerTransform(cameraRef.current);
    });
  }, []);
```

Update the import from `./transform` to include `layerTransform` (and drop
`worldRectToScreen` if it was imported here — it wasn't; only `TerminalOverlay`
imported it).

Replace the `onChange` callback body:

```ts
  const onChange = useCallback((_els: readonly unknown[], appState: AppStateLike) => {
    const tool = (appState as { activeTool?: { type?: string } }).activeTool?.type;
    if (tool) setActiveType(tool);
    applyCamera(excalidrawCamera(appState));
    scheduleSave();
  }, [applyCamera, scheduleSave]);
```

In the `excalidrawAPI` prop callback, replace `setCamera(excalidrawCamera(...))` with:

```ts
          applyCamera(excalidrawCamera(api.getAppState() as AppStateLike));
```

And render the overlay with refs instead of the camera prop:

```tsx
      <TerminalOverlay layerRef={layerRef} cameraRef={cameraRef} />
```

- [ ] **Step 5: Verify**

Run: `npx vitest run` — all pass.
Run: `npx tsc --noEmit` — clean.

- [ ] **Step 6: Manual smoke check**

Run: `npm run tauri dev` (close the app when done; one instance only — Tauri builds
are disk-heavy, build only this project).
Check: terminals appear in the right place, pan/zoom keeps them glued to the canvas,
spawn placement still centers in view.

- [ ] **Step 7: Commit**

```bash
git add src/wall/WallView.tsx src/wall/TerminalOverlay.tsx src/wall/TerminalWindow.tsx src/App.css
git commit -m "perf(wall): world-space terminal layer with imperative camera transform"
```

### Task 7: Gesture-local drag/resize + memo

Pointer-moves mutate the wrapper element's style directly; the store gets one update
on release (which also triggers exactly one autosave via the existing terminal-store
subscription). `React.memo` keeps one terminal's commit from re-rendering the rest.

**Files:**
- Modify: `src/wall/TerminalWindow.tsx`

- [ ] **Step 1: Make drag and resize imperative**

Replace `beginDrag` and `beginResize`:

```tsx
  const beginDrag = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const z = cameraRef.current.z;
    const sx = e.clientX, sy = e.clientY;
    const ox = terminal.x, oy = terminal.y;
    let nx = ox, ny = oy;
    const onMove = (ev: PointerEvent) => {
      nx = ox + (ev.clientX - sx) / z;
      ny = oy + (ev.clientY - sy) / z;
      const el = wrapRef.current;
      if (el) el.style.transform = `translate(${nx}px, ${ny}px)`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      update(id, { x: nx, y: ny }); // single store commit -> one autosave
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const beginResize = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const z = cameraRef.current.z;
    const sx = e.clientX, sy = e.clientY;
    const ow = terminal.w, oh = terminal.h;
    let nw = ow, nh = oh;
    const onMove = (ev: PointerEvent) => {
      nw = Math.max(220, ow + (ev.clientX - sx) / z);
      nh = Math.max(140, oh + (ev.clientY - sy) / z);
      const el = wrapRef.current;
      if (el) { el.style.width = `${nw}px`; el.style.height = `${nh}px`; }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      update(id, { w: nw, h: nh }); // commit refits xterm via the w/h effect
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
```

(xterm refit now happens once on release — the existing `[w, h, started, id]` effect
fires on the store commit — instead of reflowing the terminal on every frame.)

- [ ] **Step 2: Memoize the component**

```tsx
import { memo, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
```

Rename the function to `TerminalWindowInner` and export:

```tsx
export const TerminalWindow = memo(TerminalWindowInner);
```

(Default shallow compare is correct: the store's `update` replaces only the changed
terminal's object, so other windows keep referential equality and skip rendering.)

- [ ] **Step 3: Verify**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, clean.

- [ ] **Step 4: Commit**

```bash
git add src/wall/TerminalWindow.tsx
git commit -m "perf(wall): gesture-local drag/resize with single store commit; memo windows"
```

### Task 8: WebGL terminal renderer

`@xterm/addon-webgl@0.19.0` is the stable release published alongside
`@xterm/xterm@6.0.0` (same day, Dec 22 2025) — it is the matching pair. Do NOT use
the 0.20.0-beta line (it peer-depends on xterm 6.1 betas).

**Files:**
- Modify: `package.json` (via npm)
- Modify: `src/wall/TerminalWindow.tsx`

- [ ] **Step 1: Install the addon**

Run: `npm install @xterm/addon-webgl@0.19.0`

- [ ] **Step 2: Activate WebGL with DOM fallback + bound scrollback**

In `TerminalWindow.tsx` add the import:

```ts
import { WebglAddon } from "@xterm/addon-webgl";
```

In the spawn effect, add `scrollback` to the Terminal options:

```ts
    const term = new Terminal({
      fontSize: 13,
      scrollback: 5000,
      fontFamily: '"Geist Mono", ui-monospace, monospace',
      theme: {
        background: "#12110f",
        foreground: "#f3eee5",
        cursor: "#d79a3d",
        cursorAccent: "#12110f",
        selectionBackground: "rgba(215, 154, 61, .28)",
      },
    });
```

and after `term.open(bodyRef.current);` (before `fit.fit();`):

```ts
    try {
      const webgl = new WebglAddon();
      // On context loss, dispose the addon: xterm falls back to the DOM renderer.
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // WebGL unavailable - DOM renderer fallback.
    }
```

(`term.dispose()` in the effect cleanup disposes loaded addons; no extra teardown.)

- [ ] **Step 3: Verify**

Run: `npx vitest run && npx tsc --noEmit` — pass/clean.
Run: `npm run tauri dev`, start a terminal, run `Get-ChildItem -Recurse C:\Windows\System32 | Select-Object Name` for a few seconds — output should scroll smoothly without pegging the UI.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/wall/TerminalWindow.tsx
git commit -m "perf(terminal): WebGL renderer with DOM fallback, bounded scrollback"
```

### Task 9: Thumbnail throttle + exit save

Doc saves stay debounced at 800 ms (cheap JSON). The expensive `exportToBlob` PNG
thumbnail runs at most every ~20 s, plus one forced export when leaving the wall so
the start-page card is always fresh.

**Files:**
- Modify: `src/wall/WallView.tsx`

- [ ] **Step 1: Throttle the thumbnail inside `doSave`**

Add next to the other refs/constants in `WallView`:

```ts
const THUMB_INTERVAL_MS = 20_000; // module-scope, next to TERMINAL_SIZE
```

```ts
  const lastThumbAt = useRef(0);
```

Change `doSave` to take a force flag and gate the export:

```ts
  const doSave = async (opts?: { thumbnail?: boolean }) => {
    const api = apiRef.current;
    const doc = buildDoc();
    if (!api || !doc) return;
    await saveWall(wallId, doc);
    const wantThumb = opts?.thumbnail ?? Date.now() - lastThumbAt.current > THUMB_INTERVAL_MS;
    if (wantThumb) {
      lastThumbAt.current = Date.now();
      try {
        const blob = await exportToBlob({
          elements: [...api.getSceneElements()] as readonly ExcalidrawElement[],
          appState: { ...api.getAppState(), exportBackground: false },
          files: api.getFiles(),
          mimeType: "image/png",
          maxWidthOrHeight: 480,
        });
        await saveThumbnail(wallId, new Uint8Array(await blob.arrayBuffer()));
      } catch { /* thumbnail is best-effort */ }
    }
    const index = await loadIndex();
    await saveIndex(index.map((w) => (w.id === wallId ? { ...w, updatedAt: Date.now() } : w)));
  };
```

(`lastThumbAt` starts at 0, so the first save after load still produces a thumbnail.)

- [ ] **Step 2: Force a final save + thumbnail on exit**

Add an exit handler and use it for the toolbar's Back button:

```ts
  const exit = async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (savesEnabled.current) await doSave({ thumbnail: true });
    onExit();
  };
```

```tsx
      <Toolbar wallId={wallId} onBack={() => { void exit(); }} onSwitch={onSwitch} onGear={() => setGearOpen((o) => !o)} onTasks={onTasks} />
```

- [ ] **Step 3: Verify**

Run: `npx vitest run && npx tsc --noEmit` — pass/clean.

- [ ] **Step 4: Commit**

```bash
git add src/wall/WallView.tsx
git commit -m "perf(wall): throttle thumbnail export, force final save on exit"
```

### Task 10: Agent names + status chrome in cards

Wires Task 1 + Task 2 into the UI: persisted agent names, a pulsing amber status dot
while working, and a footer status line ("Working 4m 12s" / "Cooked for 13m 30s").
The footer is its own component with a 1 s interval; it also sets `data-working` on
the wrapper element so the header dot is pure CSS — the xterm subtree never re-renders
on ticks.

**Files:**
- Modify: `src/store/types.ts`
- Modify: `src/wall/terminalStore.ts`
- Modify: `src/wall/WallView.tsx`
- Modify: `src/wall/TerminalWindow.tsx`
- Create: `src/wall/StatusFooter.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add `name` to the data model**

`src/store/types.ts` — optional on the persisted shape (older docs lack it):

```ts
export type SavedTerminal = {
  id: string; x: number; y: number; w: number; h: number; presetId: string; cwd: string;
  name?: string;
};
```

`src/wall/terminalStore.ts` — required at runtime:

```ts
export type TerminalState = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  presetId: string;
  cwd: string;
  started: boolean;
};
```

- [ ] **Step 2: Assign and persist names in `WallView.tsx`**

Add the import:

```ts
import { pickAgentName } from "./agentNames";
```

In the load effect, replace the `useTerminalStore.setState({...})` call so docs saved
before this change get names assigned (uniquely, within the wall):

```ts
      const names: string[] = [];
      useTerminalStore.setState({
        terminals: (doc?.terminals ?? []).map((t) => {
          const name = t.name ?? pickAgentName(names);
          names.push(name);
          return { ...t, name, started: false };
        }),
      });
```

In `buildDoc`, persist the name (extend the destructured mapping):

```ts
      terminals: useTerminalStore.getState().terminals.map(({ id, x, y, w, h, presetId, cwd, name }) => ({
        id, x, y, w, h, presetId, cwd, name,
      })),
```

In `addTerminal`, pick a name for the new terminal:

```ts
    useTerminalStore.getState().add({
      id: crypto.randomUUID(),
      name: pickAgentName(useTerminalStore.getState().terminals.map((t) => t.name)),
      x, y, w: TERMINAL_SIZE.w, h: TERMINAL_SIZE.h, presetId, cwd, started: true,
    });
```

- [ ] **Step 3: Create `StatusFooter.tsx`**

```tsx
import { useEffect, useState, type RefObject } from "react";
import { isWorking, settle, statusLabel, type Activity } from "./agentStatus";

/**
 * Ticks once per second: renders the status line and mirrors the working state
 * onto the card wrapper as data-working (the header dot is styled purely via CSS),
 * so ticks never re-render the xterm subtree or other windows.
 */
export function StatusFooter({
  activityRef,
  wrapRef,
}: {
  activityRef: RefObject<Activity>;
  wrapRef: RefObject<HTMLDivElement | null>;
}) {
  const [label, setLabel] = useState("Idle");
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      activityRef.current = settle(activityRef.current, now);
      const a = activityRef.current;
      setLabel(statusLabel(a, now));
      wrapRef.current?.setAttribute("data-working", String(isWorking(a, now)));
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [activityRef, wrapRef]);
  return <div className="terminal-status">{label}</div>;
}
```

- [ ] **Step 4: Wire activity + chrome into `TerminalWindow.tsx`**

Imports:

```ts
import { HEADER_H, FOOTER_H, type Camera } from "./transform";
import { newActivity, recordOutput, type Activity } from "./agentStatus";
import { StatusFooter } from "./StatusFooter";
```

Add the activity ref next to the other refs:

```ts
  const activityRef = useRef<Activity>(newActivity());
```

Record output in the spawn callback (replace the `onData` line from Task 5):

```ts
        onData: (bytes) => {
          if (disposed) return;
          activityRef.current = recordOutput(activityRef.current, Date.now());
          term.write(bytes);
        },
```

Header: replace the tier dot with the status dot and show the agent name
(`presetTierColor` import becomes unused here — remove it):

```tsx
      <div className="terminal-header" style={{ height: HEADER_H }} onPointerDown={beginDrag}>
        <span className="terminal-status-dot" />
        <span className="terminal-title">{terminal.name} &middot; {preset.label}</span>
        <button className="terminal-close" title="Close" onPointerDown={close}>
          &times;
        </button>
      </div>
```

Body + footer: reserve footer space and render it only when started:

```tsx
      {started ? (
        <>
          <div ref={bodyRef} className="terminal-body" style={{ top: HEADER_H, bottom: FOOTER_H }} />
          <StatusFooter activityRef={activityRef} wrapRef={wrapRef} />
        </>
      ) : (
        <button className="terminal-start" onPointerDown={(e) => { e.stopPropagation(); start(); }}>
          &#9655; Start
        </button>
      )}
```

- [ ] **Step 5: Styles in `App.css`**

Replace the `.terminal-tier` rule with:

```css
.terminal-status-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--text-faint); transition: background .2s; }
.terminal-window[data-working="true"] .terminal-status-dot { background: var(--accent); animation: status-pulse 1.6s ease-in-out infinite; }
@keyframes status-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(215, 154, 61, .45); }
  50% { box-shadow: 0 0 0 5px rgba(215, 154, 61, 0); }
}
.terminal-status {
  position: absolute; left: 0; right: 0; bottom: 0; height: 22px;
  display: flex; align-items: center; padding: 0 10px; box-sizing: border-box;
  font: 500 10px var(--font-mono); color: var(--text-faint);
  background: var(--glass); border-top: 1px solid var(--rule);
  pointer-events: all; user-select: none;
}
.terminal-window[data-working="true"] .terminal-status { color: var(--accent); }
```

(The footer height must match `FOOTER_H = 22` from `transform.ts`.)

- [ ] **Step 6: Verify**

Run: `npx vitest run && npx tsc --noEmit` — pass/clean.
If `presetTierColor` is now unused anywhere (check with
`grep -rn presetTierColor src/`), it is still used by `LaunchMenu.tsx` — leave
`presetTier.ts` and its test alone.

- [ ] **Step 7: Commit**

```bash
git add src/store/types.ts src/wall/terminalStore.ts src/wall/WallView.tsx src/wall/TerminalWindow.tsx src/wall/StatusFooter.tsx src/App.css
git commit -m "feat(wall): agent names + working/idle status chrome on terminal cards"
```

### Task 11: Final verification

No new code — evidence that everything works together.

- [ ] **Step 1: Full frontend suite + types**

Run (from `vibe-walls/`): `npx vitest run && npx tsc --noEmit`
Expected: all suites pass (agentNames, agentStatus, transform, client, terminalStore, presets, presetTier, tools, excalidrawCamera, relativeTime, taskStore), no type errors.

- [ ] **Step 2: Rust suite**

Run (from `vibe-walls/src-tauri/`): `cargo test`
Expected: all pass, including the three `drain_pending` tests and the registry tests.

- [ ] **Step 3: Manual perf + behavior check**

Run: `npm run tauri dev`, then:

1. Open a wall, launch 4 terminals — each gets a distinct agent name in its header.
2. Run a noisy command in two of them (e.g. `Get-ChildItem -Recurse C:\Windows\System32`)
   — output scrolls smoothly; status dots pulse amber; footers show "Working Xs".
3. While output streams, pan and zoom the canvas — terminals stay glued, no stutter.
4. Drag and resize a terminal — smooth; on release the terminal text refits.
5. Stop the commands, wait ~3 s — dots dim, footers flip to "Cooked for Xm Ys".
6. Click Back, reopen the wall — names persist, terminals restore idle, the
   start-page card shows a fresh thumbnail.

- [ ] **Step 4: Wrap up**

All checks green → the branch is done. Use superpowers:finishing-a-development-branch
to decide merge/PR/cleanup.
