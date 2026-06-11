# Vibe Pet — Global Voice Agent

**Date:** 2026-06-11
**Status:** Approved
**Target:** vibe-walls (Tauri)

## Purpose

A floating pet (the ghost mascot from Vibe_ADE) that lives on every view of
vibe-walls and acts as a hands-free agent for the whole app. Saying **"Vibe"**
(or pressing a hotkey) starts listening; the user speaks a request ("open a
terminal", "switch to the dark background", "go to the task board"); the pet
executes it and replies out loud.

All voice/AI services are free: Picovoice Porcupine (wake word, free personal
tier), Groq free tier (`whisper-large-v3-turbo` STT + `llama-3.3-70b-versatile`
brain), and Windows `speechSynthesis` (TTS).

## Architecture (Approach A — webview-only)

Everything runs in the frontend. No Rust changes, no new native dependencies.

```
mic (getUserMedia, always on while app open)
  └─> Porcupine WASM detector ── "Vibe" heard ──┐
in-app hotkey (Ctrl+Shift+V) ───────────────────┤
                                                ▼
                              record until ~1.2s silence (RMS in JS)
                                                ▼
                              Groq whisper-large-v3-turbo  (STT)
                                                ▼
                              Groq llama-3.3-70b-versatile (brain)
                                + tool defs from command registry
                                                ▼
                       execute registered command(s) (max 3 per utterance)
                                                ▼
                       speechSynthesis reply + caption bubble
```

Rejected alternatives: porting Quan-Voice's Rust cpal/VAD pipeline (Approach B
— robust but heavy surgery for no in-app benefit) and local whisper-rs STT
(Approach C — large build weight on a disk-constrained machine).

## Components (all new code under `src/vibe/`)

### 1. Pet UI (`VibePet.tsx`, `VibePet.css`, `vibePosition.ts`)

- SVG ghost model + breathe/float/sway/blink/celebrate animations ported from
  `Vibe_ADE/src/renderer/src/components/Vibe.tsx` and `Vibe.css`.
- Draggable with plain pointer events (no react-rnd in this repo); position
  clamped to window and persisted (same approach as Vibe.helpers.ts).
- Mounted once in `App.tsx`, rendered on start page, wall, and task board.
- States (animation + small caption bubble):
  - **idle** — wake word armed, mic glyph dimmed
  - **listening** — orb pulses, capturing speech
  - **thinking** — transcript sent to brain, gentle sway
  - **speaking** — TTS playing, bubble shows reply text
  - **error** — brief shake, bubble explains the problem
  - The ported celebrate animation plays briefly when a command succeeds.
- Old task dialog / captions from Vibe_ADE are NOT ported.

### 2. Voice pipeline (`useVoicePipeline.ts`, `silence.ts`)

- `@picovoice/porcupine-web` runs its WASM detector on a persistent
  `getUserMedia` stream. Custom "Vibe" keyword trained once in the Picovoice
  console; the `.ppn` file ships in the repo.
- Hotkey fallback: in-app keyboard shortcut (default `Ctrl+Shift+V`, window
  focused) jumps straight to listening (works when mic-wake is denied or
  noisy). Kept in-app deliberately — a global OS hotkey would require the
  Tauri global-shortcut plugin (Rust change), and the commands only act on
  this app anyway.
- Capture stops after ~1.2 s below an RMS silence threshold (`silence.ts`,
  pure function, unit tested).
- Audio encoded as WAV and POSTed to Groq
  `/openai/v1/audio/transcriptions` (`whisper-large-v3-turbo`).

### 3. Command registry (`commands.ts`)

Module-level registry + `useVibeCommand` hook. Components register commands
while mounted; auto-unregister on unmount. The agent's tool list per turn is
exactly what is currently registered, so the model never sees invalid actions.

| Registered by | Commands |
|---|---|
| `App.tsx` | `go_to_start_page`, `open_task_board`, `open_wall(name)` |
| `WallView` | `open_terminal(preset?)`, `close_terminal(name)`, `focus_terminal(name)`, `change_background(name)`, `zoom_to_fit`, `exit_wall` |
| `TaskBoard` | `create_task(title)`, `move_task(title, column)` |

Phase 1 scope is **UI control only** — the agent never types into terminals or
runs shell commands.

### 4. Agent loop (`agentLoop.ts`)

- Builds Groq chat request: system prompt (personality: brief, friendly,
  confirms each action in one sentence) + transcript + tool definitions
  generated from the registry.
- Dispatches tool calls to registry handlers; tool errors are returned to the
  model as tool results so it can explain in speech.
- Max 3 sequential tool calls per utterance (enables "open the design wall and
  give me a terminal"), then the final text is spoken.
- No matching command → the model answers conversationally ("what can you
  do?" gets a spoken list of current commands).

### 5. Settings & keys

- Groq API key and Picovoice AccessKey entered in the existing settings UI,
  stored via `settingsStore` alongside current settings.
- Pet enable/disable toggle and hotkey binding also in settings.

## Error handling

| Failure | Behavior |
|---|---|
| Mic permission denied | One-time caption; wake word off, hotkey-only mode |
| Missing/invalid Groq key | Error state: "I need a Groq API key — check Settings." |
| Groq rate limit / offline | Spoken: "I couldn't reach my brain, try again in a moment." |
| Empty/garbled transcript | Back to idle: "I didn't catch that." |
| Command handler throws | Error fed back to model; pet apologizes and explains |

The pet must never crash or block the wall; every failure path ends in idle.

## Testing

Vitest, colocated `*.test.ts` per repo convention:

- `commands.test.ts` — register/unregister lifecycle, tool-def generation,
  duplicate-name handling.
- `agentLoop.test.ts` — mocked Groq client: tool dispatch, 3-call cap,
  error-result feedback, conversational fallback.
- `silence.test.ts` — RMS threshold boundary cases on synthetic buffers.
- Manual verification for mic/wake-word/TTS; a debug affordance accepts a
  typed transcript to exercise the full agent loop without audio.

## Out of scope (phase 1)

- Typing into terminals / running shell commands by voice
- Reading app state aloud beyond what the model is told via tool results
- Non-Windows TTS voices, Piper/neural TTS
- Continuous conversation (each utterance is a fresh exchange)
