# Voice → Agent Dictation (CNVS-parity package A)

**Date:** 2026-07-13
**Status:** Approved
**Depends on:** existing Vibe voice pipeline, PTY layer, agent status tracking

## Goal

Let the user command coding agents by voice: "ask Max to run the tests" gets
typed into Max's terminal and submitted, hands-free. This removes Vibe's
"controls the UI only; never types into terminals" restriction — deliberately,
behind a clear routing contract. It is the first of four CNVS-parity work
packages (A: this; B: agent canvas control; C: Cursor preset + boot recipe;
D: looks & delight).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Submit model | **Auto-submit**: type prompt + Enter immediately, CNVS-style |
| Prompt shaping | **Settings toggle**: `Verbatim` or `Cleaned up` (LLM-shaped); user picks in Settings → Vibe |
| Agent replies | **Spoken completion ping only** ("Max finished its task"), no summary read-back |
| Transcript/hints UI | **Bottom-center floating pill**: live state + transcript + idle "Try …" hints; VibePet stays as wake/mic indicator |
| Tier gating | **Free for all tiers** (Groq 300 req/day allowance is the natural cap) |
| Fan-out | One utterance may target several agents (multiple tool calls in shaped mode) |

## Out of scope (deferred)

- Barge-in (interrupting Vibe's TTS mid-sentence).
- Spoken summaries of agent output (ping only).
- Word-by-word live transcript. The Vosk recognizer runs a wake-word-restricted
  grammar (`["vibe","[unk]"]`); free-text partials would need a second
  unrestricted recognizer. The pill shows a listening animation, then the final
  Groq transcript.
- Packages B (agent→canvas control server), C (Cursor preset, boot recipe),
  D (wallpapers, chrome, minimap, music widget) — separate specs.

## Architecture

Utterance flow (both modes share delivery and pings; only prompt derivation
differs):

```
capture() → Groq STT → transcript
  │
  ├─ settings.vibe.dictation === "verbatim"
  │    routeVerbatim(transcript, agents)
  │      ├─ match  → deliverPrompt(ptyId, strippedPrompt)   [no LLM call]
  │      └─ no match → fall through to normal Vibe loop (UI command / question)
  │
  └─ settings.vibe.dictation === "shaped"  (default)
       runAgent(transcript, …) with send_to_agent registered
         → LLM rewrites speech into a clean prompt, routes by name,
           may emit several send_to_agent calls (fan-out)
```

### 1. `send_to_agent` Vibe command

Registered via `useVibeCommand` in `WallView.tsx` (where terminal cards and
PTY ids live), same pattern as existing wall commands.

- Signature: `send_to_agent(agent_name: string, prompt: string)`.
- Resolves `agent_name` against terminal card names case-insensitively
  (`terminalsOf(cards)`); on miss returns an error string listing current
  agent names so the LLM can retry or Vibe can speak it.
- Delivers via `deliverPrompt` and marks the terminal as awaiting-completion.
- Tool description tells the model: pass the user's request as a clear,
  self-contained prompt; do not invent tasks; one call per target agent.

### 2. Prompt delivery — `encodePromptBytes` + `deliverPrompt`

New module `src/wall/dictation.ts`:

- `encodePromptBytes(text: string): Uint8Array` — pure. Wraps the text in
  bracketed-paste escapes (`ESC[200~ … ESC[201~`) so multi-line prompts don't
  self-submit line-by-line inside agent CLIs, then appends `\r` to submit.
- `deliverPrompt(ptyId: string, text: string): Promise<void>` — thin wrapper
  over `writePty`.

### 3. Verbatim router — `routeVerbatim`

Same module, pure function:

- `routeVerbatim(transcript, agentNames) → { name, prompt } | null`.
- Accepts directive prefixes: `ask <name> (to)`, `tell <name> (to)`,
  `<name>, …` (leading vocative). Name match is case-insensitive against live
  agent names; the directive prefix is stripped, the remainder (verbatim) is
  the prompt.
- Returns `null` for anything else — the utterance then flows to the normal
  Vibe loop unchanged, so UI commands keep working in verbatim mode.
- In verbatim mode `send_to_agent` stays registered in the loop, so
  "ask everyone to stop" or fuzzy phrasings still route via the LLM as a
  fallback; only clean prefix matches skip the LLM.

### 4. Completion pings

- `WallView` keeps `awaitingCompletion: Map<ptyId, agentName>` (a ref, not
  state). `send_to_agent` / verbatim delivery set an entry.
- The existing per-terminal `Activity` tracking already computes
  working→idle transitions (`settle`, `IDLE_AFTER_MS`). When a terminal in
  the map transitions to idle after having worked, Vibe speaks
  "<Name> finished its task" via the existing TTS path and the entry is
  removed (dedupe: one ping per delivered prompt).
- A prompt that produces no output within 30s clears the entry silently
  (agent may have been at a menu/prompt; don't ping stale).

### 5. Hint pill — `src/vibe/HintPill.tsx`

Floating pill, bottom-center of the wall, above the status footer. States:

- **idle** — cycles hints every ~8s, built from live context: agent names on
  this wall and presets ("Try 'ask Max to run the tests'", "Try 'open a
  Claude Code terminal'"). Hidden entirely when Vibe is disabled.
- **listening** — mic-level animation + "Listening…" (no live words; see
  out-of-scope).
- **thinking** — the final transcript, styled as a quote, while the loop runs.
- **acting/done** — the routed action or Vibe's spoken reply, fades after ~4s.

Driven by the same state machine in `VibeAgent.tsx` that today drives the pet
(listening/thinking states already exist there); the pill subscribes rather
than owning logic. Hint generation is a pure function `buildHints(ctx)` for
testability.

### 6. Settings

- `Settings.vibe` gains `dictation: "verbatim" | "shaped"` (default
  `"shaped"`), sanitized in `settings.ts` like existing fields.
- `SettingsModal` → Vibe section gains a two-option toggle: "Dictation:
  Cleaned up / Verbatim" with a one-line explanation.
- System prompt in `agentLoop.ts` is updated: Vibe may now type into agent
  terminals via `send_to_agent`, and its old "never types into terminals"
  README claim is revised.

## Error handling

- **Unknown agent name** — `send_to_agent` returns "No agent called X — I can
  see: Max, Ruby." The LLM relays it; in verbatim mode Vibe speaks it directly.
- **No terminals on the wall** — spoken: "There's no agent terminal open —
  want me to open one?" (existing open-terminal command handles the follow-up).
- **PTY write failure** (terminal died between resolve and write) — spoken
  error; awaiting-completion entry is not set.
- **Empty/failed transcription** — existing pipeline behavior unchanged; pill
  returns to idle.
- **Ambiguous name in verbatim mode** (two agents share a name prefix) —
  `routeVerbatim` requires an exact (case-insensitive) name token; otherwise
  falls through to the LLM which can ask via `ask_user`.

## Testing

- **Unit (vitest):** `routeVerbatim` (prefixes, vocative, case, miss, empty),
  `encodePromptBytes` (bracketed paste, trailing `\r`, multi-line),
  completion-ping bookkeeping (set → idle → ping once; 30s silent expiry),
  `buildHints` (uses live agent names, stable cycle), settings sanitizer
  round-trip for `dictation`.
- **Live eval (`eval.live.test.ts`):** shaped-mode cases — single-agent
  routing, fan-out to two agents, unknown-name recovery, UI command still
  routed to UI tools not `send_to_agent`.
- **Manual verify (app):** dictate to a real Claude Code terminal in both
  modes; confirm auto-submit, completion ping, pill states. NOTE: Claude runs
  inside Vibe Space's own terminal — verification is user-driven, never
  restart the running app from within.

## File-by-file change list

| File | Change |
|---|---|
| `src/wall/dictation.ts` | **new** — `encodePromptBytes`, `deliverPrompt`, `routeVerbatim` |
| `src/wall/dictation.test.ts` | **new** — unit tests |
| `src/vibe/HintPill.tsx` (+ CSS) | **new** — pill component, `buildHints` |
| `src/vibe/hints.test.ts` | **new** — `buildHints` tests |
| `src/wall/WallView.tsx` | register `send_to_agent`, awaiting-completion map, ping hookup |
| `src/vibe/VibeAgent.tsx` | verbatim fast-path before `runAgent`; expose pipeline state to pill |
| `src/vibe/agentLoop.ts` | system-prompt addition for `send_to_agent` |
| `src/settings/settings.ts` | `vibe.dictation` field + sanitizer |
| `src/settings/SettingsModal.tsx` | dictation toggle UI |
| `README.md` | revise "never types into terminals" section |
