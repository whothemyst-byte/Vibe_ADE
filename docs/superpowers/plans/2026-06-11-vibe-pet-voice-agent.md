# Vibe Pet Voice Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A floating pet (ported from Vibe_ADE) on every vibe-walls view that wakes on the word "Vibe" (or Ctrl+Shift+V), transcribes speech via Groq Whisper, executes UI commands through an LLM tool-calling loop, and replies with Windows TTS.

**Architecture:** Everything in the webview (no Rust changes). A module-level command registry collects voice commands from mounted components; an agent loop sends transcripts + registered tools to Groq `llama-3.3-70b-versatile`; `@picovoice/porcupine-web` provides the wake word on a persistent mic stream; `speechSynthesis` speaks replies. See spec: `docs/superpowers/specs/2026-06-11-vibe-pet-voice-agent-design.md`.

**Tech Stack:** React 19 + TypeScript + Vite + vitest (existing), zustand 5 (existing), `@picovoice/porcupine-web` + `@picovoice/web-voice-processor` (new), Groq REST API (free tier), Web Speech `speechSynthesis`.

**Conventions:** Tests are colocated `*.test.ts` next to sources. Run a single test file with `npx vitest run src/vibe/<file>.test.ts`. Commit after every green task. All new code lives in `src/vibe/` except settings and mount-point edits.

**Key external facts (verify nothing, they are given):**
- Groq STT endpoint: `POST https://api.groq.com/openai/v1/audio/transcriptions` (multipart: `file`, `model=whisper-large-v3-turbo`), header `Authorization: Bearer <key>`. Response JSON: `{ "text": "..." }`.
- Groq chat endpoint: `POST https://api.groq.com/openai/v1/chat/completions` (JSON: `model=llama-3.3-70b-versatile`, `messages`, `tools`, `tool_choice:"auto"`). OpenAI-compatible response shape.
- `WebVoiceProcessor.subscribe(engine)` delivers `Int16Array` frames of 512 samples at 16 kHz to any object with an `onmessage` handler (same pipeline Porcupine uses).
- Porcupine needs two files served from `public/`: the trained keyword `public/vibe_wake.ppn` (user creates in Picovoice Console) and the model `public/porcupine_params.pv` (download from the Porcupine GitHub repo, `lib/common/porcupine_params.pv`). If `vibe_wake.ppn` fails to load, wake word is disabled and hotkey-only mode is used.

---

## Task overview

1. Command registry (`commands.ts`) — TDD
2. WAV encoder (`wav.ts`) — TDD
3. Silence detector (`silence.ts`) — TDD
4. Groq client (`groq.ts`) — TDD (mocked fetch)
5. Agent loop (`agentLoop.ts`) — TDD
6. Settings schema: `vibe` section — TDD (extend existing tests)
7. Settings UI: Vibe pane in SettingsModal
8. Pet position helpers (`vibeHelpers.ts`) — TDD
9. Pet UI (`VibePet.tsx` + `VibePet.css`)
10. TTS wrapper (`speech.ts`) + voice pipeline hook (`useVoicePipeline.ts`)
11. Orchestrator (`VibeAgent.tsx`), mount in `App.tsx`, App-level commands
12. WallView commands
13. TaskBoard commands
14. Docs + manual end-to-end verification

---

### Task 1: Command registry

The heart of "the agent can do whatever the UI can do right now": components register commands while mounted, the agent sees exactly the live set.

**Files:**
- Create: `src/vibe/commands.ts`
- Test: `src/vibe/commands.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/vibe/commands.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  registerVibeCommand,
  runVibeCommand,
  getToolDefs,
  _clearRegistryForTests,
  type VibeCommand,
} from "./commands";

const cmd = (over: Partial<VibeCommand> = {}): VibeCommand => ({
  name: "open_terminal",
  description: "Spawn a new agent terminal",
  run: () => "opened",
  ...over,
});

beforeEach(() => _clearRegistryForTests());

describe("registerVibeCommand", () => {
  it("registers and unregisters via the returned cleanup", async () => {
    const cleanup = registerVibeCommand(cmd());
    expect(await runVibeCommand("open_terminal", {})).toBe("opened");
    cleanup();
    expect(await runVibeCommand("open_terminal", {})).toMatch(/no command named/i);
  });

  it("re-registering a name replaces the old handler", async () => {
    registerVibeCommand(cmd({ run: () => "first" }));
    registerVibeCommand(cmd({ run: () => "second" }));
    expect(await runVibeCommand("open_terminal", {})).toBe("second");
  });

  it("stale cleanup does not remove a newer registration (StrictMode safety)", async () => {
    const cleanupOld = registerVibeCommand(cmd({ run: () => "old" }));
    registerVibeCommand(cmd({ run: () => "new" }));
    cleanupOld(); // must NOT delete the newer entry
    expect(await runVibeCommand("open_terminal", {})).toBe("new");
  });
});

describe("getToolDefs", () => {
  it("emits OpenAI-format tool defs with default empty parameters", () => {
    registerVibeCommand(cmd());
    expect(getToolDefs()).toEqual([
      {
        type: "function",
        function: {
          name: "open_terminal",
          description: "Spawn a new agent terminal",
          parameters: { type: "object", properties: {} },
        },
      },
    ]);
  });

  it("passes through a command's own parameters schema", () => {
    const parameters = {
      type: "object",
      properties: { preset: { type: "string", description: "Preset label" } },
    };
    registerVibeCommand(cmd({ parameters }));
    expect(getToolDefs()[0].function.parameters).toEqual(parameters);
  });
});

describe("runVibeCommand", () => {
  it("returns thrown errors as result text instead of throwing", async () => {
    registerVibeCommand(cmd({ run: () => { throw new Error("wall not loaded"); } }));
    expect(await runVibeCommand("open_terminal", {})).toBe("Error: wall not loaded");
  });

  it("awaits async handlers", async () => {
    registerVibeCommand(cmd({ run: async () => "done later" }));
    expect(await runVibeCommand("open_terminal", {})).toBe("done later");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/vibe/commands.test.ts`
Expected: FAIL — cannot resolve `./commands`.

- [ ] **Step 3: Implement the registry**

```ts
// src/vibe/commands.ts
import { useEffect, useRef } from "react";

export type VibeCommand = {
  name: string;
  /** Shown to the LLM — say what it does and when to use it. */
  description: string;
  /** JSON Schema for the arguments object. Omit for no-arg commands. */
  parameters?: Record<string, unknown>;
  /** Returns a short result string fed back to the LLM ("opened terminal Ada"). */
  run: (args: Record<string, unknown>) => string | Promise<string>;
};

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const registry = new Map<string, VibeCommand>();

/** Registers a command; returns a cleanup that removes it (only if still current). */
export function registerVibeCommand(cmd: VibeCommand): () => void {
  registry.set(cmd.name, cmd);
  return () => {
    if (registry.get(cmd.name) === cmd) registry.delete(cmd.name);
  };
}

export function getToolDefs(): ToolDef[] {
  return [...registry.values()].map((c) => ({
    type: "function",
    function: {
      name: c.name,
      description: c.description,
      parameters: c.parameters ?? { type: "object", properties: {} },
    },
  }));
}

/** Never throws — errors become result text so the LLM can explain them. */
export async function runVibeCommand(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const cmd = registry.get(name);
  if (!cmd) return `Error: no command named "${name}" is available right now.`;
  try {
    return await cmd.run(args);
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export function _clearRegistryForTests(): void {
  registry.clear();
}

/**
 * Registers a command for the lifetime of the component. The handler ref is
 * kept fresh so `run` always sees current props/state, while registration
 * itself happens once per name (StrictMode-safe via the cleanup guard).
 */
export function useVibeCommand(cmd: VibeCommand): void {
  const ref = useRef(cmd);
  ref.current = cmd;
  useEffect(() => {
    return registerVibeCommand({
      name: cmd.name,
      description: cmd.description,
      parameters: cmd.parameters,
      run: (args) => ref.current.run(args),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd.name]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/vibe/commands.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/vibe/commands.ts src/vibe/commands.test.ts
git commit -m "feat(vibe): command registry for voice agent tools"
```

### Task 2: WAV encoder

Groq's transcription endpoint needs a real audio file; we record raw 16 kHz Int16 frames and wrap them in a WAV header.

**Files:**
- Create: `src/vibe/wav.ts`
- Test: `src/vibe/wav.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/vibe/wav.test.ts
import { describe, it, expect } from "vitest";
import { encodeWav } from "./wav";

const SAMPLE_RATE = 16000;

async function bytes(frames: Int16Array[]): Promise<DataView> {
  return new DataView(await encodeWav(frames, SAMPLE_RATE).arrayBuffer());
}

describe("encodeWav", () => {
  it("writes a valid 44-byte PCM header", async () => {
    const v = await bytes([new Int16Array([0, 1000, -1000])]);
    const tag = (off: number) =>
      String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(tag(12)).toBe("fmt ");
    expect(v.getUint16(20, true)).toBe(1);           // PCM
    expect(v.getUint16(22, true)).toBe(1);           // mono
    expect(v.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(v.getUint16(34, true)).toBe(16);          // bits per sample
    expect(tag(36)).toBe("data");
    expect(v.getUint32(40, true)).toBe(6);           // 3 samples * 2 bytes
  });

  it("concatenates multiple frames in order, little-endian", async () => {
    const v = await bytes([new Int16Array([100]), new Int16Array([-200, 300])]);
    expect(v.getInt16(44, true)).toBe(100);
    expect(v.getInt16(46, true)).toBe(-200);
    expect(v.getInt16(48, true)).toBe(300);
    expect(v.getUint32(4, true)).toBe(36 + 6);       // RIFF chunk size
  });

  it("handles empty input", async () => {
    const v = await bytes([]);
    expect(v.getUint32(40, true)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/vibe/wav.test.ts`
Expected: FAIL — cannot resolve `./wav`.

- [ ] **Step 3: Implement the encoder**

```ts
// src/vibe/wav.ts
/** Mono 16-bit PCM WAV from raw Int16 frames (as delivered by WebVoiceProcessor). */
export function encodeWav(frames: Int16Array[], sampleRate: number): Blob {
  const sampleCount = frames.reduce((n, f) => n + f.length, 0);
  const dataBytes = sampleCount * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const tag = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  tag(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);            // fmt chunk size
  v.setUint16(20, 1, true);             // PCM
  v.setUint16(22, 1, true);             // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true);             // block align
  v.setUint16(34, 16, true);            // bits per sample
  tag(36, "data");
  v.setUint32(40, dataBytes, true);
  let off = 44;
  for (const f of frames) {
    for (let i = 0; i < f.length; i++, off += 2) v.setInt16(off, f[i], true);
  }
  return new Blob([buf], { type: "audio/wav" });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/vibe/wav.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/vibe/wav.ts src/vibe/wav.test.ts
git commit -m "feat(vibe): wav encoder for mic frames"
```

### Task 3: Silence detector

Decides when the user has finished speaking: stop after ~1.2 s of quiet, but only once some speech was actually heard.

**Files:**
- Create: `src/vibe/silence.ts`
- Test: `src/vibe/silence.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/vibe/silence.test.ts
import { describe, it, expect } from "vitest";
import { createSilenceDetector, FRAME_MS } from "./silence";

// 512 samples @ 16kHz = 32ms per frame (WebVoiceProcessor's frame size).
const FRAME_LEN = 512;
const loud = () => new Int16Array(FRAME_LEN).fill(8000);   // RMS ≈ 0.24
const quiet = () => new Int16Array(FRAME_LEN).fill(50);    // RMS ≈ 0.0015

function feed(d: ReturnType<typeof createSilenceDetector>, frame: () => Int16Array, ms: number) {
  let last: "speaking" | "waiting" | "stop" = "waiting";
  for (let t = 0; t < ms; t += FRAME_MS) last = d.push(frame());
  return last;
}

describe("createSilenceDetector", () => {
  it("does not stop during initial silence (still waiting for speech)", () => {
    const d = createSilenceDetector();
    expect(feed(d, quiet, 5000)).toBe("waiting");
  });

  it("stops after 1.2s of silence following speech", () => {
    const d = createSilenceDetector();
    feed(d, loud, 500);
    expect(feed(d, quiet, 1100)).toBe("speaking"); // not yet
    expect(feed(d, quiet, 200)).toBe("stop");      // crosses 1200ms
  });

  it("speech resets the silence timer", () => {
    const d = createSilenceDetector();
    feed(d, loud, 500);
    feed(d, quiet, 1000);
    feed(d, loud, 100);                            // resumes speaking
    expect(feed(d, quiet, 1100)).toBe("speaking"); // timer restarted
  });

  it("respects a custom threshold", () => {
    const d = createSilenceDetector({ thresholdRms: 0.5 }); // loud() is below this
    expect(feed(d, loud, 3000)).toBe("waiting");            // never counts as speech
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/vibe/silence.test.ts`
Expected: FAIL — cannot resolve `./silence`.

- [ ] **Step 3: Implement the detector**

```ts
// src/vibe/silence.ts
/** WebVoiceProcessor delivers 512-sample frames at 16kHz = 32ms. */
export const FRAME_MS = 32;

export type SilenceDetectorOptions = {
  /** Normalized RMS (0..1) above which a frame counts as speech. */
  thresholdRms?: number;
  /** Silence duration after speech that ends the utterance. */
  silenceMs?: number;
};

export type SilenceState = "waiting" | "speaking" | "stop";

/**
 * Stateful endpoint detector. Feed every mic frame; returns:
 *  - "waiting":  no speech heard yet (initial silence never ends capture)
 *  - "speaking": speech heard, utterance ongoing
 *  - "stop":     >= silenceMs of quiet after speech — stop recording
 */
export function createSilenceDetector(opts: SilenceDetectorOptions = {}) {
  const threshold = opts.thresholdRms ?? 0.01;
  const silenceMs = opts.silenceMs ?? 1200;
  let heardSpeech = false;
  let quietMs = 0;

  return {
    push(frame: Int16Array): SilenceState {
      let sum = 0;
      for (let i = 0; i < frame.length; i++) {
        const s = frame[i] / 32768;
        sum += s * s;
      }
      const rms = Math.sqrt(sum / frame.length);
      if (rms >= threshold) {
        heardSpeech = true;
        quietMs = 0;
        return "speaking";
      }
      if (!heardSpeech) return "waiting";
      quietMs += FRAME_MS;
      return quietMs >= silenceMs ? "stop" : "speaking";
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/vibe/silence.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/vibe/silence.ts src/vibe/silence.test.ts
git commit -m "feat(vibe): rms silence detector for utterance endpointing"
```

### Task 4: Groq client

Thin fetch wrappers for STT and chat. Errors are normalized to user-meaningful messages the pet can speak.

**Files:**
- Create: `src/vibe/groq.ts`
- Test: `src/vibe/groq.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/vibe/groq.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { transcribe, chat, GroqError } from "./groq";

const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const fail = (status: number) =>
  Promise.resolve(new Response("{}", { status }));

afterEach(() => vi.unstubAllGlobals());

describe("transcribe", () => {
  it("posts multipart wav and returns the text", async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ text: "open a terminal" }));
    vi.stubGlobal("fetch", fetchMock);
    const text = await transcribe(new Blob(["x"], { type: "audio/wav" }), "gsk_key");
    expect(text).toBe("open a terminal");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(init.headers.Authorization).toBe("Bearer gsk_key");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("model")).toBe("whisper-large-v3-turbo");
  });

  it("maps 401 to a missing-key message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(401)));
    await expect(transcribe(new Blob(), "bad")).rejects.toThrow(/groq api key/i);
  });

  it("maps 429 to a rate-limit message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(429)));
    await expect(transcribe(new Blob(), "k")).rejects.toThrow(/try again in a moment/i);
  });

  it("maps network failure to an offline message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(transcribe(new Blob(), "k")).rejects.toThrow(/couldn't reach/i);
  });
});

describe("chat", () => {
  it("posts messages+tools and returns the assistant message", async () => {
    const message = { role: "assistant", content: "Done!", tool_calls: undefined };
    const fetchMock = vi.fn().mockReturnValue(ok({ choices: [{ message }] }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await chat([{ role: "user", content: "hi" }], [], "gsk_key");
    expect(out).toEqual(message);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("llama-3.3-70b-versatile");
    expect(body.tool_choice).toBe("auto");
  });

  it("throws GroqError with status on http errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fail(500)));
    await expect(chat([], [], "k")).rejects.toBeInstanceOf(GroqError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/vibe/groq.test.ts`
Expected: FAIL — cannot resolve `./groq`.

- [ ] **Step 3: Implement the client**

```ts
// src/vibe/groq.ts
import type { ToolDef } from "./commands";

const BASE = "https://api.groq.com/openai/v1";
export const STT_MODEL = "whisper-large-v3-turbo";
export const CHAT_MODEL = "llama-3.3-70b-versatile";

export class GroqError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type AssistantMessage = Extract<ChatMessage, { role: "assistant" }>;

function describeHttp(status: number): GroqError {
  if (status === 401) return new GroqError("I need a valid Groq API key — check Settings.", status);
  if (status === 429) return new GroqError("My brain is rate-limited — try again in a moment.", status);
  return new GroqError(`Groq request failed (HTTP ${status}).`, status);
}

async function post(path: string, key: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
    });
  } catch {
    throw new GroqError("I couldn't reach my brain — are you online?");
  }
  if (!res.ok) throw describeHttp(res.status);
  return res.json();
}

export async function transcribe(wav: Blob, key: string): Promise<string> {
  const form = new FormData();
  form.append("file", wav, "utterance.wav");
  form.append("model", STT_MODEL);
  const json = (await post("/audio/transcriptions", key, { method: "POST", body: form })) as {
    text?: string;
  };
  return (json.text ?? "").trim();
}

export async function chat(
  messages: ChatMessage[],
  tools: ToolDef[],
  key: string
): Promise<AssistantMessage> {
  const json = (await post("/chat/completions", key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    }),
  })) as { choices?: { message?: AssistantMessage }[] };
  const msg = json.choices?.[0]?.message;
  if (!msg) throw new GroqError("Groq returned an empty response.");
  return msg;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/vibe/groq.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/vibe/groq.ts src/vibe/groq.test.ts
git commit -m "feat(vibe): groq stt + chat client with friendly error mapping"
```

### Task 5: Agent loop

Takes a transcript, lets the LLM call registered commands (max 3 rounds), returns the final text to speak. The chat function is injected so tests never hit the network.

**Files:**
- Create: `src/vibe/agentLoop.ts`
- Test: `src/vibe/agentLoop.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/vibe/agentLoop.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAgent } from "./agentLoop";
import { registerVibeCommand, _clearRegistryForTests } from "./commands";
import type { AssistantMessage, ChatMessage } from "./groq";

const toolCall = (name: string, args: object, id = "c1") => ({
  id, type: "function" as const, function: { name, arguments: JSON.stringify(args) },
});
const say = (content: string): AssistantMessage => ({ role: "assistant", content });
const call = (...tcs: ReturnType<typeof toolCall>[]): AssistantMessage => ({
  role: "assistant", content: null, tool_calls: tcs,
});

beforeEach(() => _clearRegistryForTests());

describe("runAgent", () => {
  it("returns plain text when the model calls no tools", async () => {
    const chat = vi.fn().mockResolvedValue(say("I can open terminals and more."));
    expect(await runAgent("what can you do", chat)).toBe("I can open terminals and more.");
    const messages: ChatMessage[] = chat.mock.calls[0][0];
    expect(messages[0].role).toBe("system");
    expect(messages[1]).toEqual({ role: "user", content: "what can you do" });
  });

  it("executes a tool call and feeds the result back", async () => {
    const run = vi.fn().mockReturnValue("terminal Ada opened");
    registerVibeCommand({ name: "open_terminal", description: "d", run });
    const chat = vi.fn()
      .mockResolvedValueOnce(call(toolCall("open_terminal", { preset: "claude" })))
      .mockResolvedValueOnce(say("Opened a Claude terminal for you!"));
    expect(await runAgent("open a claude terminal", chat)).toBe("Opened a Claude terminal for you!");
    expect(run).toHaveBeenCalledWith({ preset: "claude" });
    const secondMessages: ChatMessage[] = chat.mock.calls[1][0];
    const toolMsg = secondMessages.find((m) => m.role === "tool");
    expect(toolMsg).toMatchObject({ content: "terminal Ada opened", tool_call_id: "c1" });
  });

  it("stops after 3 tool rounds even if the model keeps calling", async () => {
    registerVibeCommand({ name: "noop", description: "d", run: () => "ok" });
    const chat = vi.fn().mockResolvedValue(call(toolCall("noop", {})));
    const out = await runAgent("loop forever", chat);
    expect(chat).toHaveBeenCalledTimes(3);
    expect(out).toMatch(/./); // still returns something speakable
  });

  it("feeds unknown-command errors back to the model instead of crashing", async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(call(toolCall("does_not_exist", {})))
      .mockResolvedValueOnce(say("Sorry, I can't do that here."));
    expect(await runAgent("do magic", chat)).toBe("Sorry, I can't do that here.");
    const secondMessages: ChatMessage[] = chat.mock.calls[1][0];
    const toolMsg = secondMessages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toMatch(/no command named/i);
  });

  it("handles malformed tool arguments gracefully", async () => {
    const run = vi.fn().mockReturnValue("ok");
    registerVibeCommand({ name: "open_terminal", description: "d", run });
    const chat = vi.fn()
      .mockResolvedValueOnce(call({ id: "c1", type: "function", function: { name: "open_terminal", arguments: "{not json" } }))
      .mockResolvedValueOnce(say("Done."));
    await runAgent("open", chat);
    expect(run).toHaveBeenCalledWith({}); // bad JSON degrades to empty args
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/vibe/agentLoop.test.ts`
Expected: FAIL — cannot resolve `./agentLoop`.

- [ ] **Step 3: Implement the loop**

```ts
// src/vibe/agentLoop.ts
import { getToolDefs, runVibeCommand, type ToolDef } from "./commands";
import type { AssistantMessage, ChatMessage } from "./groq";

export const MAX_TOOL_ROUNDS = 3;

const SYSTEM_PROMPT = `You are Vibe, a small friendly ghost who lives inside the
vibe-walls app and controls it for the user by voice. The user just spoke one
request. Use the provided tools to carry it out, then confirm what you did in
ONE short, casual sentence (it will be read aloud). If no tool fits, answer
conversationally and briefly. If asked what you can do, summarize your current
tools in plain words. Never invent tools, never output code or markdown.`;

export type ChatFn = (
  messages: ChatMessage[],
  tools: ToolDef[]
) => Promise<AssistantMessage>;

/** Runs one utterance through the tool-calling loop. Returns text to speak. */
export async function runAgent(transcript: string, chatFn: ChatFn): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: transcript },
  ];
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const msg = await chatFn(messages, getToolDefs());
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return msg.content?.trim() || "Done!";
    }
    messages.push(msg);
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        /* model produced bad JSON — run with empty args */
      }
      const result = await runVibeCommand(tc.function.name, args);
      messages.push({ role: "tool", content: result, tool_call_id: tc.id });
    }
  }
  return "Okay, done!";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/vibe/agentLoop.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/vibe/agentLoop.ts src/vibe/agentLoop.test.ts
git commit -m "feat(vibe): llm agent loop with 3-round tool calling"
```

### Task 6: Settings schema — `vibe` section

**Files:**
- Modify: `src/settings/settings.ts`
- Test: `src/settings/settings.test.ts` (add cases to the existing file — do not rewrite existing tests)

- [ ] **Step 1: Add failing test cases to the existing `settings.test.ts`**

Append this describe block (imports of `mergeSettings` / `DEFAULT_SETTINGS` already exist in the file):

```ts
describe("vibe settings", () => {
  it("defaults: disabled with empty keys", () => {
    expect(DEFAULT_SETTINGS.vibe).toEqual({
      enabled: false,
      groqApiKey: "",
      picovoiceAccessKey: "",
      hotkey: "Ctrl+Shift+V",
    });
  });

  it("merges a valid vibe section", () => {
    const merged = mergeSettings({
      vibe: { enabled: true, groqApiKey: "gsk_x", picovoiceAccessKey: "pv_y", hotkey: "Ctrl+Alt+V" },
    });
    expect(merged.vibe).toEqual({
      enabled: true, groqApiKey: "gsk_x", picovoiceAccessKey: "pv_y", hotkey: "Ctrl+Alt+V",
    });
  });

  it("falls back field-by-field on wrong types and missing section", () => {
    expect(mergeSettings({}).vibe).toEqual(DEFAULT_SETTINGS.vibe);
    expect(mergeSettings({ vibe: { enabled: "yes", groqApiKey: 42 } }).vibe).toEqual(DEFAULT_SETTINGS.vibe);
  });
});
```

- [ ] **Step 2: Run tests to verify the new cases fail**

Run: `npx vitest run src/settings/settings.test.ts`
Expected: FAIL — `vibe` does not exist on `Settings`. (Pre-existing tests must still pass.)

- [ ] **Step 3: Extend the schema in `src/settings/settings.ts`**

Add to the `Settings` type and defaults:

```ts
export type Settings = {
  terminal: { fontSize: number; scrollback: number; shell: string };
  canvas: { defaultBackground: Background };
  vibe: { enabled: boolean; groqApiKey: string; picovoiceAccessKey: string; hotkey: string };
};

export const DEFAULT_SETTINGS: Settings = {
  terminal: { fontSize: 13, scrollback: 5000, shell: "powershell.exe" },
  canvas: { defaultBackground: DEFAULT_BACKGROUND },
  vibe: { enabled: false, groqApiKey: "", picovoiceAccessKey: "", hotkey: "Ctrl+Shift+V" },
};
```

In `mergeSettings`, mirror the existing field-by-field pattern. Note the existing `str()` helper rejects empty strings — that's correct here too (empty key falls back to default empty, and a non-string falls back as well), but `enabled` needs a boolean helper:

```ts
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
```

```ts
  const vibe = isRecord(r.vibe) ? r.vibe : {};
  // inside the returned object:
    vibe: {
      enabled: bool(vibe.enabled, d.vibe.enabled),
      groqApiKey: typeof vibe.groqApiKey === "string" ? vibe.groqApiKey : d.vibe.groqApiKey,
      picovoiceAccessKey:
        typeof vibe.picovoiceAccessKey === "string" ? vibe.picovoiceAccessKey : d.vibe.picovoiceAccessKey,
      hotkey: str(vibe.hotkey, d.vibe.hotkey),
    },
```

- [ ] **Step 4: Run the full settings tests**

Run: `npx vitest run src/settings/settings.test.ts`
Expected: PASS, including all pre-existing cases.

- [ ] **Step 5: Commit**

```bash
git add src/settings/settings.ts src/settings/settings.test.ts
git commit -m "feat(vibe): vibe section in settings schema"
```

### Task 7: Settings UI — Vibe pane

No unit tests (pure markup mirroring existing untested panes); verified by typecheck + manual check in Task 14.

**Files:**
- Modify: `src/settings/SettingsModal.tsx`

- [ ] **Step 1: Add the section entry**

In `SettingsModal.tsx`, extend the `Section` union and `SECTIONS` array (around lines 11–19). Reuse an existing imported icon (e.g. `EllipseIcon`) — do not create new icon art:

```ts
type Section = "agents" | "terminal" | "themes" | "canvas" | "vibe" | "about";

// in SECTIONS, before the "about" entry:
  { key: "vibe", label: "Vibe", icon: EllipseIcon },
```

- [ ] **Step 2: Add the pane component**

Add next to `TerminalPane`, mirroring its exact store pattern and CSS classes:

```tsx
function VibePane() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const v = settings.vibe;
  const setVibe = (patch: Partial<typeof v>) =>
    save({ ...settings, vibe: { ...v, ...patch } });

  return (
    <>
      <h2 className="set-title">Vibe</h2>
      <p className="set-sub">
        Voice companion. Needs a free Groq API key (console.groq.com) for speech
        recognition and the brain, and a free Picovoice AccessKey (console.picovoice.ai)
        for the "Vibe" wake word. Without the Picovoice key, the hotkey still works.
      </p>
      <div className="set-row">
        <span className="set-label">Enable Vibe</span>
        <input
          type="checkbox"
          checked={v.enabled}
          onChange={(e) => setVibe({ enabled: e.target.checked })}
        />
      </div>
      <div className="set-row">
        <span className="set-label">Groq API key</span>
        <input
          className="set-input set-mono"
          type="password"
          value={v.groqApiKey}
          onChange={(e) => setVibe({ groqApiKey: e.target.value.trim() })}
        />
      </div>
      <div className="set-row">
        <span className="set-label">Picovoice AccessKey</span>
        <input
          className="set-input set-mono"
          type="password"
          value={v.picovoiceAccessKey}
          onChange={(e) => setVibe({ picovoiceAccessKey: e.target.value.trim() })}
        />
      </div>
      <div className="set-row">
        <span className="set-label">Push-to-talk hotkey</span>
        <input
          className="set-input set-mono"
          value={v.hotkey}
          onChange={(e) => setVibe({ hotkey: e.target.value || "Ctrl+Shift+V" })}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 3: Render the pane**

In the modal body where the other panes render (around line 263):

```tsx
{section === "vibe" && <VibePane />}
```

- [ ] **Step 4: Typecheck and existing tests**

Run: `npx tsc --noEmit` then `npx vitest run`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/settings/SettingsModal.tsx
git commit -m "feat(vibe): vibe settings pane (keys, enable, hotkey)"
```

### Task 8: Pet position helpers

Ported from `Vibe_ADE/src/renderer/src/components/Vibe.helpers.ts`, keeping only what the pet needs (no dialog math — the caption bubble is CSS-positioned relative to the pet).

**Files:**
- Create: `src/vibe/vibeHelpers.ts`
- Test: `src/vibe/vibeHelpers.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/vibe/vibeHelpers.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  clampPosition, defaultVibePosition, loadVibePosition, saveVibePosition,
  VIBE_SIZE, VIBE_MARGIN, VIBE_POSITION_STORAGE_KEY,
} from "./vibeHelpers";

describe("clampPosition", () => {
  it("keeps an in-bounds position", () => {
    expect(clampPosition({ x: 100, y: 100 }, 1280, 800)).toEqual({ x: 100, y: 100 });
  });
  it("clamps to margins on all edges", () => {
    expect(clampPosition({ x: -50, y: -50 }, 1280, 800)).toEqual({ x: VIBE_MARGIN, y: VIBE_MARGIN });
    expect(clampPosition({ x: 9999, y: 9999 }, 1280, 800)).toEqual({
      x: 1280 - VIBE_SIZE - VIBE_MARGIN,
      y: 800 - VIBE_SIZE - VIBE_MARGIN,
    });
  });
});

describe("defaultVibePosition", () => {
  it("sits in the bottom-right gutter", () => {
    const p = defaultVibePosition(1280, 800);
    expect(p.x).toBeLessThan(1280 - VIBE_SIZE);
    expect(p.y).toBeLessThan(800 - VIBE_SIZE);
  });
});

describe("load/save", () => {
  beforeEach(() => window.localStorage.clear());
  it("round-trips a position", () => {
    saveVibePosition({ x: 42, y: 7 });
    expect(loadVibePosition()).toEqual({ x: 42, y: 7 });
  });
  it("returns null on missing or corrupt data", () => {
    expect(loadVibePosition()).toBeNull();
    window.localStorage.setItem(VIBE_POSITION_STORAGE_KEY, "{nope");
    expect(loadVibePosition()).toBeNull();
    window.localStorage.setItem(VIBE_POSITION_STORAGE_KEY, JSON.stringify({ x: "a" }));
    expect(loadVibePosition()).toBeNull();
  });
});
```

Note: these tests touch `window.localStorage` — vitest runs in node by default in this repo. Add a jsdom pragma at the top of this one test file:

```ts
// @vitest-environment jsdom
```

(Requires `jsdom`: `npm i -D jsdom`. If `npx vitest run` then complains in OTHER suites, nothing changed for them — the pragma is per-file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/vibe/vibeHelpers.test.ts`
Expected: FAIL — cannot resolve `./vibeHelpers`.

- [ ] **Step 3: Implement (port from Vibe_ADE)**

Copy from `C:\Users\admin\Desktop\Quansynd\Vibe_ADE\src\renderer\src\components\Vibe.helpers.ts` ONLY these exports, verbatim except the storage key:
`VibePosition`, `VIBE_SIZE`, `VIBE_MARGIN`, `VIBE_DEFAULT_GUTTER`, `clampPosition`, `defaultVibePosition`, `loadVibePosition`, `saveVibePosition`.

Change the storage key for this app:

```ts
export const VIBE_POSITION_STORAGE_KEY = "vibe-walls:vibe-position";
```

Do NOT port: `computeDialogAnchor`, `computeDialogStyle`, `isClick`, or any `VIBE_DIALOG_*` constants.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/vibe/vibeHelpers.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/vibe/vibeHelpers.ts src/vibe/vibeHelpers.test.ts package.json package-lock.json
git commit -m "feat(vibe): pet position helpers ported from vibe-ade"
```

### Task 9: Pet UI

Visual port of the Vibe_ADE mascot. Pure presentation: receives state + caption, reports drag/click. No unit tests (SVG/CSS/pointer events) — verified manually in Task 14.

**Files:**
- Create: `src/vibe/VibePet.tsx`
- Create: `src/vibe/VibePet.css`

- [ ] **Step 1: Port the CSS**

Copy `C:\Users\admin\Desktop\Quansynd\Vibe_ADE\src\renderer\src\components\Vibe.css` to `src/vibe/VibePet.css`, then:
1. Delete every rule whose selector contains `vibe-dialog` (the old task dialog).
2. Append the new state/caption rules:

```css
/* ---- vibe-walls additions: agent states + caption bubble ---- */

.vibe-wrapper { position: fixed; z-index: 4000; }

.vibe-state--listening .vibe-orb { animation: vibe-orb-pulse 0.9s ease-in-out infinite; }
.vibe-state--thinking .vibe-sway { animation-duration: 1.2s; }
.vibe-state--speaking .vibe-float { animation-duration: 1.6s; }
.vibe-state--error .vibe-grip { animation: vibe-shake 0.4s ease-in-out 2; }

@keyframes vibe-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

.vibe-caption {
  position: absolute;
  bottom: calc(100% + 10px);
  right: 0;
  max-width: 260px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(24, 22, 19, 0.94);
  border: 1px solid rgba(215, 154, 61, 0.35);
  color: #e8e2d6;
  font: 12px/1.45 "Geist", sans-serif;
  white-space: pre-wrap;
  pointer-events: none;
}
.vibe-caption--error { border-color: rgba(220, 90, 70, 0.55); }
```

If `vibe-orb-pulse` does not exist as a keyframe in the copied file (it is applied conditionally as a class in Vibe_ADE), add:

```css
@keyframes vibe-orb-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(1.35); }
}
```

- [ ] **Step 2: Implement the component**

The SVG block is copied VERBATIM from `Vibe_ADE/src/renderer/src/components/Vibe.tsx` lines 220–275 (the `<svg viewBox="0 0 80 80">…</svg>` element with the ghost body, eyes, antenna orb, and sparkle group). Wrap it in this component:

```tsx
// src/vibe/VibePet.tsx
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampPosition, defaultVibePosition, loadVibePosition, saveVibePosition,
  VIBE_SIZE, type VibePosition,
} from "./vibeHelpers";
import "./VibePet.css";

export type VibeState = "idle" | "listening" | "thinking" | "speaking" | "error";

const CLICK_THRESHOLD_PX = 4;

function readInitialPosition(): VibePosition {
  const w = window.innerWidth || 1280;
  const h = window.innerHeight || 800;
  const stored = loadVibePosition();
  return stored ? clampPosition(stored, w, h) : defaultVibePosition(w, h);
}

export function VibePet({ state, caption, celebrating, onActivate }: {
  state: VibeState;
  caption: string | null;
  celebrating: boolean;
  onActivate: () => void;
}) {
  const [position, setPosition] = useState<VibePosition>(readInitialPosition);
  const drag = useRef<{ startX: number; startY: number; origin: VibePosition } | null>(null);
  const moved = useRef(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, origin: position };
    moved.current = false;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) + Math.abs(dy) >= CLICK_THRESHOLD_PX) moved.current = true;
    setPosition(clampPosition(
      { x: drag.current.origin.x + dx, y: drag.current.origin.y + dy },
      window.innerWidth, window.innerHeight,
    ));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (moved.current) saveVibePosition(position);
    else onActivate(); // a click (not a drag) = push-to-talk
  };

  const celebrateClass = celebrating ? "vibe-celebrate--active" : undefined;
  const hasOrbPulse = state === "listening";

  return (
    <div
      className={`vibe-wrapper vibe-state--${state}`}
      style={{ left: position.x, top: position.y, width: VIBE_SIZE, height: VIBE_SIZE }}
    >
      {caption && (
        <div className={`vibe-caption${state === "error" ? " vibe-caption--error" : ""}`}>
          {caption}
        </div>
      )}
      <div
        className="vibe-grip"
        role="img"
        aria-label="Vibe — your voice companion (click to talk, drag to move)"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* SVG copied verbatim from Vibe_ADE Vibe.tsx lines 220-275, with two
            adjustments: the lean class group becomes plain "vibe-lean" (no
            dialog side variants), and the orb pulse class is driven by
            hasOrbPulse instead of in-progress task count. */}
        <svg viewBox="0 0 80 80" aria-hidden="true">
          <g className="vibe-lean">
            <g className={celebrateClass} key={celebrating ? "celebrate" : "idle"}>
              <g className="vibe-breathe">
                {/* ... ghost body, shadow, antenna, eyes — copy from Vibe_ADE ... */}
                {/* On the antenna orb group use:
                    className={hasOrbPulse ? "vibe-orb vibe-orb-pulse" : "vibe-orb"} */}
                {/* Render the three .vibe-sparkle <text> nodes when `celebrating` */}
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
```

The `{/* ... */}` comments above mark where the verbatim Vibe_ADE SVG goes — copy the real paths/ellipses from the source file; do not redraw them. Also add a `resize` listener effect identical to Vibe_ADE's (re-clamp position on window resize, lines 79–87 of the source).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/vibe/VibePet.tsx src/vibe/VibePet.css
git commit -m "feat(vibe): pet mascot ported from vibe-ade with agent states"
```

### Task 10: TTS wrapper + voice pipeline hook

Browser/WASM-bound code: no unit tests; the pure logic it consumes (silence, wav) is already tested. Verified manually in Task 14.

**Files:**
- Create: `src/vibe/speech.ts`
- Create: `src/vibe/useVoicePipeline.ts`

- [ ] **Step 1: Install Picovoice packages**

```bash
npm i @picovoice/porcupine-web @picovoice/web-voice-processor
```

- [ ] **Step 2: TTS wrapper**

```ts
// src/vibe/speech.ts
/** Speak via Windows voices. Resolves when done (or immediately if unavailable). */
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !text) return resolve();
    window.speechSynthesis.cancel(); // never queue behind a previous reply
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function cancelSpeech(): void {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
```

- [ ] **Step 3: Voice pipeline hook**

IMPORTANT for the implementer: the exact engine-subscription shapes below follow the
`@picovoice/porcupine-web` and `@picovoice/web-voice-processor` v3 READMEs. After
installing, open `node_modules/@picovoice/porcupine-web/README.md` and confirm the
`PorcupineWorker.create` signature and the `WebVoiceProcessor.subscribe` engine
contract match; adjust mechanically if the installed minor version differs.

```ts
// src/vibe/useVoicePipeline.ts
import { useEffect, useRef } from "react";
import { PorcupineWorker } from "@picovoice/porcupine-web";
import { WebVoiceProcessor } from "@picovoice/web-voice-processor";
import { createSilenceDetector } from "./silence";
import { encodeWav } from "./wav";

const SAMPLE_RATE = 16000; // WebVoiceProcessor's fixed output rate
const MAX_UTTERANCE_MS = 15000;

export type VoicePipeline = {
  /** Records until silence (or 15s cap); resolves to a WAV blob, or null if nothing was said. */
  capture: () => Promise<Blob | null>;
  /** True once the wake word engine is live (false = hotkey-only mode). */
  wakeWordActive: boolean;
};

/**
 * Owns the mic. While `enabled`, Porcupine listens for "Vibe" and fires
 * `onWake`. `capture()` can be invoked at any time (wake or hotkey path).
 */
export function useVoicePipeline(opts: {
  enabled: boolean;
  picovoiceAccessKey: string;
  onWake: () => void;
}): VoicePipeline {
  const porcupineRef = useRef<PorcupineWorker | null>(null);
  const wakeActiveRef = useRef(false);
  const onWakeRef = useRef(opts.onWake);
  onWakeRef.current = opts.onWake;

  useEffect(() => {
    if (!opts.enabled || !opts.picovoiceAccessKey) return;
    let cancelled = false;
    (async () => {
      try {
        const worker = await PorcupineWorker.create(
          opts.picovoiceAccessKey,
          [{ publicPath: "/vibe_wake.ppn", label: "vibe" }],
          () => onWakeRef.current(),
          { publicPath: "/porcupine_params.pv" },
        );
        if (cancelled) { void worker.terminate(); return; }
        porcupineRef.current = worker;
        await WebVoiceProcessor.subscribe(worker);
        wakeActiveRef.current = true;
      } catch (e) {
        // Missing .ppn / bad AccessKey / mic denied → hotkey-only mode.
        console.warn("[vibe] wake word unavailable:", e);
        wakeActiveRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
      const w = porcupineRef.current;
      porcupineRef.current = null;
      wakeActiveRef.current = false;
      if (w) {
        void WebVoiceProcessor.unsubscribe(w);
        void w.terminate();
      }
    };
  }, [opts.enabled, opts.picovoiceAccessKey]);

  const capture = async (): Promise<Blob | null> => {
    const frames: Int16Array[] = [];
    const detector = createSilenceDetector();
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => { resolveDone = r; });
    let finished = false;
    const finish = () => { if (!finished) { finished = true; resolveDone(); } };

    // Engine contract per web-voice-processor v3: subscribed objects receive
    // frames via onmessage({ data: { command: "process", inputFrame } }).
    const recorder = {
      onmessage: (e: MessageEvent<{ command: string; inputFrame: Int16Array }>) => {
        if (e.data.command !== "process") return;
        frames.push(new Int16Array(e.data.inputFrame));
        if (detector.push(e.data.inputFrame) === "stop") finish();
      },
    };
    await WebVoiceProcessor.subscribe(recorder);
    const cap = window.setTimeout(finish, MAX_UTTERANCE_MS);
    await done;
    window.clearTimeout(cap);
    await WebVoiceProcessor.unsubscribe(recorder);

    // "waiting" the whole time = user never spoke.
    const heardAnything = frames.some((f) => f.some((s) => Math.abs(s) > 327)); // > ~0.01
    return heardAnything ? encodeWav(frames, SAMPLE_RATE) : null;
  };

  return { capture, wakeWordActive: wakeActiveRef.current };
}
```

- [ ] **Step 4: Typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean / all pass.

- [ ] **Step 5: Commit**

```bash
git add src/vibe/speech.ts src/vibe/useVoicePipeline.ts package.json package-lock.json
git commit -m "feat(vibe): tts wrapper and porcupine voice pipeline"
```

### Task 11: Orchestrator, App mount, App-level commands

Glues everything: wake/hotkey → capture → transcribe → agent loop → speak, driving the pet's visual state. Mounted once in `App.tsx` so the pet exists on every view.

**Files:**
- Create: `src/vibe/VibeAgent.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement the orchestrator**

```tsx
// src/vibe/VibeAgent.tsx
import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../settings/settingsStore";
import { VibePet, type VibeState } from "./VibePet";
import { useVoicePipeline } from "./useVoicePipeline";
import { runAgent } from "./agentLoop";
import { transcribe, chat, type ChatMessage } from "./groq";
import type { ToolDef } from "./commands";
import { speak, cancelSpeech } from "./speech";

const CAPTION_MS = 5000;

/** "Ctrl+Shift+V" → matcher for keydown events. */
function matchesHotkey(e: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey.toLowerCase().split("+").map((p) => p.trim());
  const key = parts.filter((p) => !["ctrl", "shift", "alt", "meta"].includes(p))[0] ?? "";
  return (
    e.key.toLowerCase() === key &&
    e.ctrlKey === parts.includes("ctrl") &&
    e.shiftKey === parts.includes("shift") &&
    e.altKey === parts.includes("alt") &&
    e.metaKey === parts.includes("meta")
  );
}

export function VibeAgent() {
  const vibe = useSettingsStore((s) => s.settings.vibe);
  const [state, setState] = useState<VibeState>("idle");
  const [caption, setCaption] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const busy = useRef(false);
  const captionTimer = useRef<number | null>(null);

  const showCaption = (text: string, ms = CAPTION_MS) => {
    setCaption(text);
    if (captionTimer.current) window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => setCaption(null), ms);
  };

  const fail = (message: string) => {
    setState("error");
    showCaption(message);
    void speak(message).then(() => setState("idle"));
  };

  const runUtterance = async (transcript: string) => {
    if (!vibe.groqApiKey) { fail("I need a Groq API key — check Settings."); return; }
    setState("thinking");
    showCaption(`"${transcript}"`);
    try {
      const reply = await runAgent(transcript, (messages: ChatMessage[], tools: ToolDef[]) =>
        chat(messages, tools, vibe.groqApiKey)
      );
      setState("speaking");
      setCelebrating(true);
      window.setTimeout(() => setCelebrating(false), 1200);
      showCaption(reply);
      await speak(reply);
      setState("idle");
    } catch (e) {
      fail(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  // busy lives ONLY here: set on entry, cleared in finally on every path,
  // so a failed turn can never leave the pet stuck.
  const listen = async () => {
    if (busy.current) return;
    busy.current = true;
    cancelSpeech();
    setState("listening");
    showCaption("Listening…", 20000);
    try {
      const wav = await pipeline.capture();
      if (!wav) { setState("idle"); showCaption("I didn't catch that."); return; }
      if (!vibe.groqApiKey) { fail("I need a Groq API key — check Settings."); return; }
      setState("thinking");
      const transcript = await transcribe(wav, vibe.groqApiKey);
      if (!transcript) { setState("idle"); showCaption("I didn't catch that."); return; }
      await runUtterance(transcript);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      busy.current = false;
    }
  };

  const pipeline = useVoicePipeline({
    enabled: vibe.enabled,
    picovoiceAccessKey: vibe.picovoiceAccessKey,
    onWake: () => { void listen(); },
  });

  // In-app push-to-talk hotkey.
  useEffect(() => {
    if (!vibe.enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (matchesHotkey(e, vibe.hotkey)) { e.preventDefault(); void listen(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vibe.enabled, vibe.hotkey, vibe.groqApiKey]);

  // Dev escape hatch: drive the full agent loop from the console without a mic:
  //   window.__vibeSay("open a terminal")
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__vibeSay = (t: string) => void runUtterance(t);
    return () => { delete (window as unknown as Record<string, unknown>).__vibeSay; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vibe.groqApiKey]);

  if (!vibe.enabled) return null;

  return (
    <VibePet
      state={state}
      caption={caption}
      celebrating={celebrating}
      onActivate={() => void listen()}
    />
  );
}
```

- [ ] **Step 2: Mount in App and register navigation commands**

Replace `src/App.tsx` content with:

```tsx
import { useState, type ReactElement } from "react";
import "./App.css";
import { StartPage } from "./start/StartPage";
import { WallView } from "./wall/WallView";
import { TaskBoard } from "./tasks/TaskBoard";
import { VibeAgent } from "./vibe/VibeAgent";
import { useVibeCommand } from "./vibe/commands";
import { loadIndex } from "./store/persistence";

type View = { kind: "start" } | { kind: "wall"; id: string } | { kind: "tasks"; from: View };

export default function App() {
  const [view, setView] = useState<View>({ kind: "start" });

  useVibeCommand({
    name: "go_to_start_page",
    description: "Navigate to the start page (the wall picker).",
    run: () => { setView({ kind: "start" }); return "Now on the start page."; },
  });
  useVibeCommand({
    name: "open_task_board",
    description: "Open the task board view.",
    run: () => {
      setView((v) => (v.kind === "tasks" ? v : { kind: "tasks", from: v }));
      return "Task board is open.";
    },
  });
  useVibeCommand({
    name: "open_wall",
    description: "Open a wall (canvas workspace) by its name.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Wall name, e.g. 'design'" } },
      required: ["name"],
    },
    run: async (args) => {
      const wanted = String(args.name ?? "").toLowerCase();
      const index = await loadIndex();
      const wall = index.find((w) => w.name.toLowerCase().includes(wanted));
      if (!wall) {
        const names = index.map((w) => w.name).join(", ") || "none";
        return `Error: no wall matches "${args.name}". Existing walls: ${names}.`;
      }
      setView({ kind: "wall", id: wall.id });
      return `Opened the wall "${wall.name}".`;
    },
  });

  let page: ReactElement;
  if (view.kind === "start") {
    page = (
      <StartPage
        onOpen={(id) => setView({ kind: "wall", id })}
        onTasks={() => setView({ kind: "tasks", from: { kind: "start" } })}
      />
    );
  } else if (view.kind === "tasks") {
    page = (
      <TaskBoard
        onBack={() => setView(view.from)}
        onOpenWall={(id) => setView({ kind: "wall", id })}
      />
    );
  } else {
    page = (
      <WallView
        wallId={view.id}
        onExit={() => setView({ kind: "start" })}
        onSwitch={(id) => setView({ kind: "wall", id })}
        onTasks={() => setView({ kind: "tasks", from: view })}
      />
    );
  }
  return (
    <>
      {page}
      <VibeAgent />
    </>
  );
}
```

(The only behavioral change to existing code: the page element is assigned to a variable so `<VibeAgent />` renders as a sibling on every view.)

- [ ] **Step 3: Typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean / all pass.

- [ ] **Step 4: Manual smoke (no keys needed)**

Run: `npm run tauri dev`. In Settings → Vibe, toggle "Enable Vibe". The pet appears bottom-right, floats/breathes, drags, persists position across restart. In devtools: `window.__vibeSay("hello")` shows the "Groq API key" error caption — proving the loop wiring end-to-end.

- [ ] **Step 5: Commit**

```bash
git add src/vibe/VibeAgent.tsx src/App.tsx
git commit -m "feat(vibe): orchestrator wired into app with navigation commands"
```

### Task 12: WallView commands

**Files:**
- Modify: `src/wall/WallView.tsx`

- [ ] **Step 1: Register wall commands**

In `WallView.tsx`, import the hook and preset resolver at the top:

```ts
import { useVibeCommand } from "../vibe/commands";
```

Inside the `WallView` component body (after `addTerminal` / `changeBg` / `exit` are defined), register:

```ts
  useVibeCommand({
    name: "open_terminal",
    description:
      "Spawn a new agent terminal on this wall. Optional preset label, e.g. 'Claude Code', 'Codex', or 'Plain shell'.",
    parameters: {
      type: "object",
      properties: { preset: { type: "string", description: "Preset label (fuzzy matched)" } },
    },
    run: async (args) => {
      const wanted = String(args.preset ?? "").toLowerCase();
      const preset =
        presets.find((p) => p.label.toLowerCase().includes(wanted)) ?? presets[0];
      await addTerminal(preset.id);
      const name = useTerminalStore.getState().terminals.at(-1)?.name;
      return `Opened a ${preset.label} terminal named ${name}.`;
    },
  });

  useVibeCommand({
    name: "close_terminal",
    description: "Close a terminal on this wall by its agent name (e.g. 'Ada').",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Agent name shown on the terminal" } },
      required: ["name"],
    },
    run: (args) => {
      const wanted = String(args.name ?? "").toLowerCase();
      const { terminals, remove } = useTerminalStore.getState();
      const t = terminals.find((t) => t.name.toLowerCase().includes(wanted));
      if (!t) {
        const names = terminals.map((t) => t.name).join(", ") || "none";
        return `Error: no terminal matches "${args.name}". Open terminals: ${names}.`;
      }
      remove(t.id);
      return `Closed terminal ${t.name}.`;
    },
  });

  useVibeCommand({
    name: "focus_terminal",
    description: "Bring a terminal to the front by its agent name.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Agent name shown on the terminal" } },
      required: ["name"],
    },
    run: (args) => {
      const wanted = String(args.name ?? "").toLowerCase();
      const { terminals } = useTerminalStore.getState();
      const t = terminals.find((t) => t.name.toLowerCase().includes(wanted));
      if (!t) {
        const names = terminals.map((t) => t.name).join(", ") || "none";
        return `Error: no terminal matches "${args.name}". Open terminals: ${names}.`;
      }
      // Terminals render in array order; last = on top.
      useTerminalStore.setState({
        terminals: [...terminals.filter((x) => x.id !== t.id), t],
      });
      return `Terminal ${t.name} is now in front.`;
    },
  });

  useVibeCommand({
    name: "change_background",
    description:
      "Set this wall's background to a solid color. Accepts a CSS color like 'dark green', '#12110f', 'black'.",
    parameters: {
      type: "object",
      properties: { color: { type: "string", description: "CSS color value" } },
      required: ["color"],
    },
    run: (args) => {
      const color = String(args.color ?? "").trim();
      const probe = new Option().style;
      probe.color = color;
      if (!probe.color) return `Error: "${color}" is not a CSS color I understand.`;
      changeBg({ kind: "color", color });
      return `Background changed to ${color}.`;
    },
  });

  useVibeCommand({
    name: "zoom_to_fit",
    description: "Zoom and scroll the canvas so all drawn content is visible.",
    run: () => {
      apiRef.current?.scrollToContent(undefined, { fitToContent: true });
      return "Zoomed to fit the canvas content.";
    },
  });

  useVibeCommand({
    name: "exit_wall",
    description: "Leave this wall and return to the start page (saves first).",
    run: async () => { await exit(); return "Left the wall."; },
  });
```

Note for the implementer: `scrollToContent`'s option name is `fitToContent` in current Excalidraw; if `npx tsc --noEmit` flags it, check the installed `ExcalidrawImperativeAPI["scrollToContent"]` signature and use the matching fit option (the API also accepts `fitToViewport`).

- [ ] **Step 2: Typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean / all pass.

- [ ] **Step 3: Manual smoke**

`npm run tauri dev`, open a wall, then in devtools `window.__vibeSay("open a claude terminal")` (with a Groq key configured) — a terminal spawns and the pet replies.

- [ ] **Step 4: Commit**

```bash
git add src/wall/WallView.tsx
git commit -m "feat(vibe): wall voice commands (terminals, background, zoom, exit)"
```

### Task 13: TaskBoard commands

**Files:**
- Modify: `src/tasks/TaskBoard.tsx`

- [ ] **Step 1: Register task commands**

In `TaskBoard.tsx`, import:

```ts
import { useVibeCommand } from "../vibe/commands";
import { useTaskStore, type TaskStatus } from "./taskStore";
```

(`useTaskStore` is already imported — keep the existing import and only add what's missing.)

Inside the component body:

```ts
  const COLUMN_ALIASES: Record<string, TaskStatus> = {
    "backlog": "backlog", "todo": "backlog",
    "in progress": "in-progress", "in-progress": "in-progress", "doing": "in-progress",
    "in review": "in-review", "in-review": "in-review", "review": "in-review",
    "done": "done", "finished": "done", "complete": "done",
  };

  useVibeCommand({
    name: "create_task",
    description: "Create a new task in the backlog column.",
    parameters: {
      type: "object",
      properties: { title: { type: "string", description: "Task title" } },
      required: ["title"],
    },
    run: (args) => {
      const title = String(args.title ?? "").trim();
      if (!title) return "Error: the task needs a title.";
      useTaskStore.getState().add(title);
      return `Created task "${title}" in the backlog.`;
    },
  });

  useVibeCommand({
    name: "move_task",
    description:
      "Move a task to another column. Columns: backlog, in progress, in review, done.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title (fuzzy matched)" },
        column: { type: "string", description: "Target column" },
      },
      required: ["title", "column"],
    },
    run: (args) => {
      const status = COLUMN_ALIASES[String(args.column ?? "").toLowerCase().trim()];
      if (!status) return `Error: "${args.column}" is not a column. Use backlog, in progress, in review, or done.`;
      const wanted = String(args.title ?? "").toLowerCase();
      const { tasks, update } = useTaskStore.getState();
      const task = tasks.find((t) => t.title.toLowerCase().includes(wanted));
      if (!task) return `Error: no task matches "${args.title}".`;
      update(task.id, { status });
      return `Moved "${task.title}" to ${status.replace("-", " ")}.`;
    },
  });
```

If the existing TaskBoard persists tasks on change (check how it calls `saveTasks`/persistence), make sure store mutations from these commands flow through the same path — they do if persistence subscribes to the store; if persistence happens in event handlers instead, call the same save function the handlers use after `add`/`update`.

- [ ] **Step 2: Typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean / all pass.

- [ ] **Step 3: Commit**

```bash
git add src/tasks/TaskBoard.tsx
git commit -m "feat(vibe): task board voice commands (create, move)"
```

### Task 14: Assets, docs, and end-to-end verification

**Files:**
- Modify: `README.md` (add a "Vibe voice companion" setup section)
- Add (user-supplied, see Step 1): `public/vibe_wake.ppn`, `public/porcupine_params.pv`

- [ ] **Step 1: One-time user setup (cannot be automated — coordinate with the user)**

1. **Groq key:** create at https://console.groq.com/keys → paste into Settings → Vibe.
2. **Picovoice:** create a free account at https://console.picovoice.ai, copy the AccessKey into Settings → Vibe. In the console, train a custom wake word **"Vibe"** for platform **Web (WASM)**, download the `.ppn`, and save it as `public/vibe_wake.ppn`.
3. **Porcupine model:** download `porcupine_params.pv` from https://github.com/Picovoice/porcupine/tree/master/lib/common and save as `public/porcupine_params.pv`.

- [ ] **Step 2: Add the README section**

```markdown
## Vibe — voice companion

Vibe is the floating ghost that controls the app by voice. Enable it in
Settings → Vibe. It needs:

- A free Groq API key (https://console.groq.com/keys) — speech-to-text + brain.
- A free Picovoice AccessKey (https://console.picovoice.ai) — the "Vibe" wake word.
- Two files in `public/` (see docs/superpowers/specs/2026-06-11-vibe-pet-voice-agent-design.md):
  `vibe_wake.ppn` (train "Vibe" for Web/WASM in the Picovoice console) and
  `porcupine_params.pv` (from the Porcupine repo, lib/common).

Say **"Vibe"**, wait for the orb to pulse, then speak — or press **Ctrl+Shift+V**.
Without the Picovoice files the hotkey still works. Phase 1 controls the UI only;
it never types into terminals.
```

- [ ] **Step 3: Full end-to-end manual verification (with keys + mic)**

Run `npm run tauri dev`, enable Vibe, grant mic permission, then verify each:

| Say | Expect |
|---|---|
| "Vibe … open a terminal" | terminal spawns, spoken confirmation, celebrate animation |
| "Vibe … make the background dark green" | background changes |
| "Vibe … zoom to fit" | camera fits content |
| "Vibe … go to the task board" | task board opens |
| "Vibe … create a task called test voice flow" | card appears in backlog |
| "Vibe … move test voice flow to done" | card moves |
| "Vibe … what can you do?" | spoken capability summary, no tool calls |
| Ctrl+Shift+V instead of wake word | identical listening flow |
| (mic denied / no .ppn) | pet still works via hotkey; no crash |
| (wrong Groq key) | spoken "I need a valid Groq API key" |

- [ ] **Step 4: Run everything one last time**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add README.md public/vibe_wake.ppn public/porcupine_params.pv
git commit -m "docs(vibe): voice companion setup + wake word assets"
```

---

## Out of scope (matches the spec)

Typing into terminals, reading app state aloud beyond tool results, Piper/neural TTS, continuous multi-turn conversation.
