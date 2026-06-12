# Vibe Pet Agent — Harness Hardening

**Date:** 2026-06-12
**Status:** Approved
**Target:** vibe-walls (Tauri)
**Builds on:** `2026-06-11-vibe-pet-voice-agent-design.md`

## Purpose

The voice agent works but suffers three pains in daily use: it mishears or
misfires (capture cuts off, empty transcripts), it sometimes acts dumb (wrong
tool, guessed arguments, no awareness of app state), and its follow-up
conversations are fragile (the `endsWith("?")` heuristic misfires, context is
lost). This spec hardens the existing harness in place — no architecture
rewrite — across five areas, all staying within Groq's free tier and the
existing Supabase proxy.

Rejected alternatives: a full agent-runtime rewrite (streaming, persistent
memory, parallel tools — heavy surgery for a feature that mostly works) and a
minimal model-swap-only fix (does nothing for mishears or conversations).

## 1. Brain upgrade — `openai/gpt-oss-120b`

Groq's docs now recommend `openai/gpt-oss-120b` as their strongest tool-use
model (llama-3.3-70b-versatile is a legacy pick). All Groq-hosted models are
on the free tier.

- `CHAT_MODEL` in `src/vibe/groq.ts` → `openai/gpt-oss-120b`.
- Chat requests send `reasoning_effort: "low"` — it is a reasoning model and
  low effort keeps voice latency acceptable.
- Proxy whitelist updated to match: `CHAT_MODEL` in
  `supabase/functions/groq-proxy/rules.ts`, tests updated, edge function
  redeployed.
- Settings → Vibe panel updates the displayed chat model string.
- STT stays `whisper-large-v3-turbo`.
- Note: gpt-oss-120b does not do parallel tool calls; the loop is sequential
  anyway.

## 2. App-state context registry (`src/vibe/context.ts`)

A mirror of the command registry for **state snapshots**: components register
a named provider while mounted; the agent loop reads all providers once per
turn.

```ts
useVibeContext(name: string, snapshot: () => string): void
// module level: registerVibeContext(name, snapshot): cleanup
```

Providers:

| Registered by | Snapshot content |
|---|---|
| `App.tsx` | current view (start / wall / task board), known wall names |
| `WallView` | wall name, active background/theme, open cards (name, kind, focused) |
| `TaskBoard` | column names and task titles |

`runAgent` appends a `Current app state:` block (one line per provider) to the
system prompt at the start of each turn. Snapshots are plain strings produced
by the component — the registry does no formatting beyond joining lines. Same
StrictMode-safe register/cleanup semantics as `useVibeCommand`.

## 3. Conversation mechanics (`agentLoop.ts`, `VibeAgent.tsx`)

- **Explicit `ask_user` tool replaces the `"?"` heuristic.** The loop itself
  injects an `ask_user(question)` tool definition every turn (never stored in
  the registry). When the model calls it, the loop returns immediately with
  `{ kind: "question", text, messages }`; a normal final reply returns
  `{ kind: "reply", ... }`. `VibeAgent` branches on `kind` instead of
  inspecting the text. The system prompt's "reply with a question ending in
  ?" instruction is rewritten to "call ask_user". `MAX_FOLLOW_UPS` stays 2;
  when the cap is reached the `ask_user` tool is simply not offered.
- **Round cap raised and made graceful.** `MAX_TOOL_ROUNDS` 3 → 5. Before the
  final round the loop appends a system note ("no more tool calls available —
  summarize what you did") so the cap produces a real summary instead of the
  hardcoded "Okay, done!". If the model still returns tool calls on the last
  round, fall back to the last assistant `content` if any, else the current
  fallback string.
- **Malformed tool JSON is fed back, not swallowed.** Instead of running the
  command with empty args, the loop pushes a tool result
  `Error: arguments were not valid JSON — call the tool again with corrected
  arguments.` so the model self-corrects within the same turn.

## 4. Voice accuracy (`groq.ts`, `silence.ts`, `useVoicePipeline.ts`)

- **Whisper vocabulary biasing.** `transcribe()` gains a `prompt` form field
  (Whisper biasing context, supported by Groq's transcription endpoint and
  passed through by the proxy untouched). The prompt is built per capture
  from live app nouns: registered command names with underscores replaced by
  spaces ("open terminal, close terminal, …"), plus wall / terminal / preset /
  theme names taken from the §2 context registry. Capped at ~200 characters (Whisper uses only the final tokens).
- **Capture tuning** in `silence.ts`, which stays a pure, unit-tested
  function:
  - require a minimum amount of above-threshold speech (~300 ms cumulative)
    before silence may end the capture — pausing to think no longer yields an
    instant "I didn't catch that";
  - hard max utterance length (15 s) so a noisy room can't record forever;
  - calibrate the RMS silence threshold from the first ~300 ms of ambient
    audio (floor + margin) instead of a single fixed constant, with the
    current constant kept as the lower bound.
- Wake-word engine (Vosk) is untouched.

## 5. Eval harness (`scripts/vibe-eval.ts`)

A measuring stick for prompt/model tweaks, deliberately small and **not in
CI**:

- `npm run vibe:eval` sends ~15 canned utterances ("open a terminal", "make a
  wall called demo in my documents", "what can you do?", a follow-up-answer
  pair, …) to the live Groq chat endpoint using a fixed fake command registry
  and the real system prompt + context block.
- Asserts which tool was picked and key arguments; prints a pass/fail table
  and exits non-zero on failures.
- Requires the developer's own `GROQ_API_KEY` env var (direct API, never the
  proxy); exits with a friendly message when missing.
- `window.__vibeSay` debug hook stays as-is.

## Error handling

Every existing failure path keeps the invariant: the pet never crashes and
always returns to idle. New paths:

| Failure | Behavior |
|---|---|
| Model calls `ask_user` after follow-up cap | Tool not offered, so cannot happen; defensive: treat as plain reply |
| Model calls tools on final round | Speak last assistant content, else fallback string |
| Calibration window all silence | Threshold falls back to current constant |
| Eval script without `GROQ_API_KEY` | Friendly exit message, non-zero status |

## Testing

Vitest, colocated per repo convention:

- `agentLoop.test.ts` — `ask_user` returns `kind: "question"`, bad-JSON
  feedback message, round-cap system note + summary, context block included.
- `context.test.ts` — register/cleanup lifecycle, snapshot joining,
  StrictMode double-mount safety.
- `silence.test.ts` — min-speech gate, max-length cutoff, ambient
  calibration boundaries on synthetic buffers.
- `rules.test.ts` (proxy) — new chat model allowed, old one rejected.
- Eval harness is itself the integration test for §1's model swap.

## Implementation order

1. Model swap (client + proxy + settings display) — verify with eval harness
   skeleton.
2. Eval harness (early, so later steps are measurable).
3. App-state context registry + providers.
4. Conversation mechanics (`ask_user`, round cap, JSON feedback).
5. Voice accuracy (Whisper prompt, silence tuning).

## Out of scope

- Streaming responses, persistent cross-utterance memory, parallel tool
  execution
- TTS changes, new user-facing commands, wake-word engine changes
- Running the eval suite in CI (it costs free-tier quota and needs a key)
