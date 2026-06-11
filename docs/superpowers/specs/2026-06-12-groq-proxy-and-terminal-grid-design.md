# Bundled Groq Proxy + Managed Terminal Grid

**Date:** 2026-06-12
**Status:** Approved
**Target:** vibe-walls (Tauri)

## Purpose

Three changes, in priority order:

1. The voice agent should work out of the box — no Groq signup required. A
   Groq API key is provided "with the software", but for real security it
   never ships in the binary: it lives behind a proxy we control.
2. Terminals currently spawn adjacent to the existing cluster and pile up
   sideways. Replace freeform placement with a **managed grid** shaped by the
   screen's aspect ratio; the camera automatically zooms out so the whole
   grid always fits on screen.
3. Agent names should be easy to pronounce (they are spoken to and by the
   voice agent).

## Feature 1 — Bundled Groq access via Supabase Edge Function proxy

### Architecture

A new Supabase Edge Function **`groq-proxy`** is deployed to the existing
Supabase project (shared with FlowMate — one extra function and one table do
not interfere). The real Groq API key is stored as a function secret
(`GROQ_API_KEY`), never in git, never in the app bundle.

Endpoints (mirroring the two calls the app makes):

| Proxy route                  | Forwards to Groq               |
| ---------------------------- | ------------------------------ |
| `POST /groq-proxy/chat`      | `POST /chat/completions`       |
| `POST /groq-proxy/transcribe`| `POST /audio/transcriptions`   |

The function **whitelists models**: only `llama-3.3-70b-versatile` (chat) and
`whisper-large-v3-turbo` (STT) are forwarded; any other model in the request
body is rejected with 400. A leaked proxy URL therefore cannot be used to run
arbitrary expensive models.

### Abuse protection — per-device daily quota

- On first run the app generates a `deviceId` (`crypto.randomUUID()`),
  persisted in settings (`vibe.deviceId`).
- Every proxy request sends `x-device-id`.
- The function upserts into a `groq_usage` table
  (`device_id text, day date, count int`, PK `(device_id, day)`) and rejects
  requests once `count` exceeds **300/day** with HTTP 429. The frontend
  already maps 429 to a friendly "My brain is rate-limited" message.
- Requests without a device ID are rejected with 400.
- The table is accessed only with the service-role key inside the function;
  no RLS policies expose it to clients.

### Frontend changes (`src/vibe/groq.ts`, settings)

- `groq.ts` supports two backends:
  - **Direct** (current behavior): if the user pasted their own key in
    Settings, call `api.groq.com` with `Authorization: Bearer <key>`.
    Bypasses the proxy quota entirely.
  - **Proxy** (new default): if no user key is set, call the proxy URL with
    `x-device-id`. The Supabase project URL + anon key are compile-time
    constants (they are public by design; security lives in the function).
- Settings UI copy changes: the Groq key field becomes **optional** —
  "Works out of the box. Paste your own free Groq key for unlimited usage."
- The agent's `enabled` gate no longer requires a key to be present.

## Feature 2 — Managed terminal grid + auto-fit camera

### Layout engine — `src/wall/gridLayout.ts` (pure, unit-testable)

- Terminal order = index in the `terminalStore.terminals` array (creation
  order, mutable via drag-reorder).
- Grid shape from the **screen aspect ratio**:
  `cols = clamp(round(sqrt(n × aspect)), 1, n)`, `rows = ceil(n / cols)`.
  On 16:9 — 2 terminals sit side by side, 4 form 2×2, 6 form 3×2, etc.
- Cell size stays the existing fixed `420×260` with a **24px gutter**.
- The grid is laid out centered on a stable world-space anchor (the center of
  the first layout; persisted with the wall so reopening doesn't jump).
- Open, close, and reorder each trigger a layout pass that recomputes every
  terminal's `x/y` and writes them into the existing `terminalStore` — so
  persistence (wall doc), rendering (`TerminalWindow`), and PTY wiring stay
  untouched. `findSpawnPoint` is no longer used for terminals.

### Auto-fit camera

After each layout pass, compute the grid bounding box and set the tldraw
camera to fit it with padding, **capped at zoom 1.0**: the camera only zooms
*out* when the grid outgrows the screen, never zooms in on a lonely terminal.
Manual pan/zoom still works between layout passes; the camera re-fits only
when the grid changes (open/close/reorder).

### Drag to reorder

Dragging a terminal no longer moves it freely:

- During drag, the terminal follows the cursor (visual feedback).
- On drop, the grid cell whose center is nearest to the dropped terminal's
  center becomes its new slot; the array is reordered (splice + insert) and a
  layout pass snaps everything back into place.
- Individual corner-resize is **disabled** in the grid (mixed sizes break the
  grid). The terminal font-size setting still controls content density.

## Feature 3 — Pronounceable agent names

Replace the 36-name pool in `src/wall/agentNames.ts` with phonetically
simple, distinct names that Windows TTS and Groq STT handle reliably, e.g.:

> Max, Leo, Mia, Zoe, Ben, Sam, Ruby, Toby, Milo, Nina, Coco, Daisy, Finn,
> Lily, Oscar, Penny, Rosie, Sunny, Teddy, Bella, Charlie, Ellie, Jack,
> Lucy, Ollie, Poppy

(same `pickAgentName` logic, just a friendlier pool; final list trimmed for
distinctness — avoid pairs STT confuses). Existing walls keep their saved
names — names are persisted in the wall doc and only newly spawned terminals
draw from the new pool.

## Testing

- **Grid math** (`gridLayout.test.ts`): cols/rows for various `n × aspect`
  combos, cell positions and gutters, stable anchor, reorder slot picking,
  camera-fit bbox + zoom cap.
- **Edge function quota**: the quota decision is a pure helper
  (`count`, `limit` → allow/deny) unit-tested in the function's test file;
  model whitelist likewise.
- **`groq.test.ts`**: extended for the backend switch — user key present →
  direct URL + Bearer header; absent → proxy URL + `x-device-id` header;
  429 from proxy surfaces the existing rate-limit message.
- **Settings**: `mergeSettings` round-trips the new `vibe.deviceId` field and
  generates one when missing.

## Out of scope

- A separate Supabase project for vibe-walls (reusing FlowMate's).
- User accounts / login for quota (device ID is enough for now).
- Mixed terminal sizes or manual free placement in the grid (the old
  freeform behavior is fully replaced, not toggleable).
- Migrating old saved walls' terminal names to the new pool.
