# Voice → Agent Dictation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dictated prompts get routed to named agent terminals ("ask Max to run the tests") and auto-submitted, with a spoken "Max finished its task" ping and a bottom-center transcript/hint pill.

**Architecture:** A new `send_to_agent` Vibe command (registered in `WallView`) delivers prompts via the existing `sendToSession` bracketed-paste path. A pure verbatim router in `src/wall/dictation.ts` bypasses the LLM when Settings → Vibe is set to Verbatim. Completion pings ride the existing per-terminal `Activity` clock. The pill subscribes to `VibeAgent`'s existing state machine.

**Tech Stack:** React 18 + TypeScript (Vite), zustand, xterm.js, Tauri PTY, Groq (STT/LLM/TTS), vitest.

**Spec:** `docs/superpowers/specs/2026-07-13-voice-agent-dictation-design.md`

## Global Constraints

- Feature is FREE for all tiers — no entitlement checks anywhere in this plan.
- `Settings.vibe.dictation` values are exactly `"shaped" | "verbatim"`, default `"shaped"`.
- Auto-submit always: delivery is `sendToSession(id, prompt, true)` — never typed-without-Enter.
- Completion ping copy is exactly: `<Name> finished its task.` No output summaries.
- Never restart the running app to verify — Claude runs inside Vibe Space's own terminal; manual verification is user-driven.
- Run unit tests with `npx vitest run <file>` from `vibe-space/`. Do NOT run `npm run vibe:eval` (live API) unless the step says so and `GROQ_API_KEY` is set.
- Match existing style: 2-space indent, doc comments on exported functions, tests colocated as `<name>.test.ts`.

---

### Task 1: `vibe.dictation` setting + Settings UI toggle

**Files:**
- Modify: `src/settings/settings.ts` (type at ~L6, defaults at ~L12, sanitizer at ~L52)
- Modify: `src/settings/SettingsModal.tsx` (`VibePane`, after the "Push-to-talk hotkey" row at ~L274)
- Test: `src/settings/settings.test.ts`

**Interfaces:**
- Produces: `Settings["vibe"]["dictation"]: "shaped" | "verbatim"` — read by Task 5 (`VibeAgent`).

- [ ] **Step 1: Write the failing sanitizer tests**

Append to `src/settings/settings.test.ts` (follow the file's existing describe style):

```ts
describe("vibe.dictation", () => {
  it("defaults to shaped when missing", () => {
    expect(sanitizeSettings({}).vibe.dictation).toBe("shaped");
  });
  it("keeps verbatim", () => {
    expect(sanitizeSettings({ vibe: { dictation: "verbatim" } }).vibe.dictation).toBe("verbatim");
  });
  it("coerces junk to shaped", () => {
    expect(sanitizeSettings({ vibe: { dictation: "yolo" } }).vibe.dictation).toBe("shaped");
  });
});
```

(If the file imports a differently-named sanitize function, use that name — check its top imports first.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/settings/settings.test.ts`
Expected: FAIL — `dictation` does not exist on the vibe settings type.

- [ ] **Step 3: Implement the field**

In `src/settings/settings.ts`:

```ts
// type (line ~6): add to the vibe object
vibe: { enabled: boolean; groqApiKey: string; hotkey: string; voice: string; deviceId: string; dictation: "shaped" | "verbatim" };

// defaults (line ~12): add
dictation: "shaped",

// sanitizer (vibe block, ~L52): add
dictation: vibe.dictation === "verbatim" ? "verbatim" : "shaped",
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/settings/settings.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Add the Settings UI toggle**

In `src/settings/SettingsModal.tsx`, inside `VibePane`, insert after the hotkey `set-row` (~L274):

```tsx
<div className="set-row">
  <span className="set-label">Dictation to agents</span>
  <select
    className="set-input"
    value={v.dictation}
    onChange={(e) => setVibe({ dictation: e.target.value as "shaped" | "verbatim" })}
  >
    <option value="shaped">Cleaned up (Vibe rewrites your speech)</option>
    <option value="verbatim">Verbatim (your exact words)</option>
  </select>
</div>
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

```bash
git add src/settings/settings.ts src/settings/settings.test.ts src/settings/SettingsModal.tsx
git commit -m "feat(vibe): dictation mode setting (shaped/verbatim)"
```


### Task 2: Pure routing helpers — `routeVerbatim` + `resolveAgent`

**Files:**
- Create: `src/wall/dictation.ts`
- Test: `src/wall/dictation.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `type AgentRef = { id: string; name: string }`
  - `resolveAgent(agents: AgentRef[], name: string): AgentRef | null` — case-insensitive exact name match.
  - `routeVerbatim(transcript: string, agents: AgentRef[]): { agent: AgentRef; prompt: string } | null`
  - Used by Task 4 (`send_to_agent`) and Task 5 (verbatim fast-path).

- [ ] **Step 1: Write the failing tests**

Create `src/wall/dictation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveAgent, routeVerbatim, type AgentRef } from "./dictation";

const agents: AgentRef[] = [
  { id: "t1", name: "Max" },
  { id: "t2", name: "Ruby" },
];

describe("resolveAgent", () => {
  it("matches case-insensitively", () => {
    expect(resolveAgent(agents, "max")?.id).toBe("t1");
  });
  it("returns null on miss", () => {
    expect(resolveAgent(agents, "Chase")).toBeNull();
  });
});

describe("routeVerbatim", () => {
  it("routes 'ask <name> to …' stripping the directive", () => {
    const r = routeVerbatim("ask Max to run the tests", agents);
    expect(r).toEqual({ agent: agents[0], prompt: "run the tests" });
  });
  it("routes 'tell <name> …' without 'to'", () => {
    const r = routeVerbatim("tell ruby fix the build", agents);
    expect(r).toEqual({ agent: agents[1], prompt: "fix the build" });
  });
  it("routes leading vocative '<name>, …'", () => {
    const r = routeVerbatim("Max, deploy the site", agents);
    expect(r).toEqual({ agent: agents[0], prompt: "deploy the site" });
  });
  it("returns null for unknown names (falls through to LLM)", () => {
    expect(routeVerbatim("ask Chase to run tests", agents)).toBeNull();
  });
  it("returns null for plain UI commands", () => {
    expect(routeVerbatim("open the task board", agents)).toBeNull();
  });
  it("returns null when the remaining prompt is empty", () => {
    expect(routeVerbatim("ask Max", agents)).toBeNull();
  });
  it("ignores punctuation after the name", () => {
    const r = routeVerbatim("ask Max, to run the tests", agents);
    expect(r).toEqual({ agent: agents[0], prompt: "run the tests" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/wall/dictation.test.ts`
Expected: FAIL — module `./dictation` not found.

- [ ] **Step 3: Implement**

Create `src/wall/dictation.ts`:

```ts
export type AgentRef = { id: string; name: string };

/** Case-insensitive exact-name lookup ("max" → Max's terminal). */
export function resolveAgent(agents: AgentRef[], name: string): AgentRef | null {
  const n = name.trim().toLowerCase();
  return agents.find((a) => a.name.toLowerCase() === n) ?? null;
}

/**
 * Verbatim dictation router. Recognizes only unambiguous directive prefixes —
 * "ask <name> (to)", "tell <name> (to)", or a leading vocative "<name>, …" —
 * against the LIVE agent names on this wall. Anything else returns null and
 * flows to the normal Vibe LLM loop, so UI commands keep working.
 */
export function routeVerbatim(
  transcript: string,
  agents: AgentRef[]
): { agent: AgentRef; prompt: string } | null {
  const text = transcript.trim();
  for (const agent of agents) {
    const name = agent.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`^(?:ask|tell)\\s+${name}[,.!?]?(?:\\s+to)?\\s+(.+)$`, "i"),
      new RegExp(`^${name}[,:]\\s*(.+)$`, "i"),
    ];
    for (const re of patterns) {
      const m = text.match(re);
      const prompt = m?.[1]?.trim();
      if (prompt) return { agent, prompt };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/wall/dictation.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/wall/dictation.ts src/wall/dictation.test.ts
git commit -m "feat(vibe): verbatim dictation router (pure)"
```


### Task 3: Completion-ping bookkeeping — `updatePending`

**Files:**
- Modify: `src/wall/dictation.ts` (append)
- Test: `src/wall/dictation.test.ts` (append)

**Interfaces:**
- Consumes: `Activity` + `isWorking` from `src/wall/agentStatus.ts` (existing).
- Produces:
  - `type PendingPing = { id: string; name: string; sentAt: number; sawOutput: boolean }`
  - `PING_TIMEOUT_MS = 30_000`
  - `updatePending(p: PendingPing, a: Activity, now: number): { next: PendingPing | null; ping: boolean }` — used by Task 4's interval.

- [ ] **Step 1: Write the failing tests**

Append to `src/wall/dictation.test.ts`:

```ts
import { updatePending, PING_TIMEOUT_MS, type PendingPing } from "./dictation";
import { newActivity, recordOutput, type Activity } from "./agentStatus";

describe("updatePending", () => {
  const pending = (over: Partial<PendingPing> = {}): PendingPing => ({
    id: "t1", name: "Max", sentAt: 1000, sawOutput: false, ...over,
  });

  it("marks sawOutput once the agent produces output after sentAt", () => {
    const a: Activity = recordOutput(newActivity(), 2000);
    const r = updatePending(pending(), a, 2100);
    expect(r).toEqual({ next: pending({ sawOutput: true }), ping: false });
  });

  it("pings once the agent goes idle after having worked", () => {
    const a: Activity = recordOutput(newActivity(), 2000); // last output at 2000
    const r = updatePending(pending({ sawOutput: true }), a, 2000 + 3000); // > IDLE_AFTER_MS
    expect(r).toEqual({ next: null, ping: true });
  });

  it("keeps waiting while the agent is still working", () => {
    const a: Activity = recordOutput(newActivity(), 5000);
    const r = updatePending(pending({ sawOutput: true }), a, 5100); // within idle window
    expect(r).toEqual({ next: pending({ sawOutput: true }), ping: false });
  });

  it("expires silently when no output ever arrives", () => {
    const a: Activity = newActivity();
    const r = updatePending(pending(), a, 1000 + PING_TIMEOUT_MS + 1);
    expect(r).toEqual({ next: null, ping: false });
  });

  it("ignores output that predates the prompt", () => {
    const a: Activity = recordOutput(newActivity(), 500); // before sentAt
    const r = updatePending(pending(), a, 1200);
    expect(r).toEqual({ next: pending(), ping: false });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/wall/dictation.test.ts`
Expected: FAIL — `updatePending` is not exported.

- [ ] **Step 3: Implement**

Append to `src/wall/dictation.ts`:

```ts
import { isWorking, type Activity } from "./agentStatus";

/** A dictated prompt whose completion the user should be told about. */
export type PendingPing = { id: string; name: string; sentAt: number; sawOutput: boolean };

/** A prompt that never produces output is dropped silently after this long. */
export const PING_TIMEOUT_MS = 30_000;

/**
 * One tick of completion tracking for one pending prompt. Pure:
 *   no output yet + timeout      → drop silently (agent was at a menu, etc.)
 *   first output after sentAt    → remember we saw it
 *   saw output + now idle        → ping ("<name> finished its task")
 */
export function updatePending(
  p: PendingPing,
  a: Activity,
  now: number
): { next: PendingPing | null; ping: boolean } {
  if (!p.sawOutput) {
    if (a.lastOutputAt > p.sentAt) return { next: { ...p, sawOutput: true }, ping: false };
    if (now - p.sentAt > PING_TIMEOUT_MS) return { next: null, ping: false };
    return { next: p, ping: false };
  }
  if (!isWorking(a, now)) return { next: null, ping: true };
  return { next: p, ping: false };
}
```

Note: `import` lines belong at the top of the file with the existing imports.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/wall/dictation.test.ts`
Expected: PASS (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/wall/dictation.ts src/wall/dictation.test.ts
git commit -m "feat(vibe): completion-ping state transition (pure)"
```


### Task 4: `send_to_agent` command + completion-ping loop in WallView

**Files:**
- Modify: `src/wall/WallView.tsx` (add after the `close_terminal` command, ~L542)

**Interfaces:**
- Consumes: `resolveAgent`, `updatePending`, `PendingPing` (Tasks 2–3); existing `sendToSession`, `focusSession` from `./sessions`; `getActivityRef` from `./sessions`; `terminalsOf`, `useCardStore` from `./cardStore`; `speak` from `../vibe/speech`; `useSettingsStore` for the TTS voice.
- Produces: registered Vibe command `send_to_agent(agent_name: string, prompt: string)` returning `"Sent to <Name>."` or an error string. Task 5's verbatim path calls it via `runVibeCommand("send_to_agent", { agent_name, prompt })`.

- [ ] **Step 1: Add imports**

In `src/wall/WallView.tsx`, extend the existing import lines (all these modules are already imported — add only the missing names):

```ts
import { resolveAgent, updatePending, type PendingPing } from "./dictation";
import { speak } from "../vibe/speech";
// from "./sessions": add sendToSession and getActivityRef to the existing import
```

- [ ] **Step 2: Register the command + ping loop**

Insert after the `close_terminal` registration (~L542), inside the component:

```tsx
  // Prompts dictated to agents whose completion should be announced.
  const pendingPings = useRef<PendingPing[]>([]);

  useVibeCommand({
    name: "send_to_agent",
    description:
      "Type a prompt into an agent's terminal and submit it (press Enter). Use when the user wants an agent to DO something ('ask Max to run the tests'). Pass the user's request as one clear, self-contained prompt. One call per target agent; never invent tasks the user didn't ask for.",
    parameters: {
      type: "object",
      properties: {
        agent_name: { type: "string", description: "Agent name shown on the terminal (e.g. 'Max')" },
        prompt: { type: "string", description: "The prompt to type and submit" },
      },
      required: ["agent_name", "prompt"],
    },
    run: (args) => {
      const terminals = terminalsOf(useCardStore.getState().cards);
      const agent = resolveAgent(terminals, String(args.agent_name ?? ""));
      if (!agent) {
        const names = terminals.map((t) => t.name).join(", ") || "none";
        return `Error: no agent called "${args.agent_name}". Open terminals: ${names}.`;
      }
      const prompt = String(args.prompt ?? "").trim();
      if (!prompt) return "Error: prompt is empty.";
      if (!sendToSession(agent.id, prompt, true)) {
        return `Error: ${agent.name}'s terminal is not running anymore.`;
      }
      focusSession(agent.id);
      pendingPings.current = [
        ...pendingPings.current.filter((p) => p.id !== agent.id),
        { id: agent.id, name: agent.name, sentAt: Date.now(), sawOutput: false },
      ];
      return `Sent to ${agent.name}.`;
    },
  });

  // Completion pings: poll each pending prompt against its terminal's
  // activity clock; speak once when the agent settles back to idle.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (pendingPings.current.length === 0) return;
      const now = Date.now();
      const voice = useSettingsStore.getState().settings.vibe.voice;
      const kept: PendingPing[] = [];
      for (const p of pendingPings.current) {
        const { next, ping } = updatePending(p, getActivityRef(p.id).current, now);
        if (ping) void speak(`${p.name} finished its task.`, voice);
        if (next) kept.push(next);
      }
      pendingPings.current = kept;
    }, 1000);
    return () => window.clearInterval(t);
  }, []);
```

`resolveAgent` takes `AgentRef[]`; `TerminalCard` has `id` and `name`, so terminals are structurally compatible — pass them directly.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (If `useRef`/`useEffect` are not yet imported in WallView, they are — verify at line 1.)

- [ ] **Step 4: Existing tests still green**

Run: `npx vitest run src/wall`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wall/WallView.tsx
git commit -m "feat(vibe): send_to_agent command + spoken completion pings"
```


### Task 5: Verbatim fast-path in VibeAgent + system-prompt update

**Files:**
- Modify: `src/vibe/VibeAgent.tsx` (`runUtterance`, ~L83)
- Modify: `src/vibe/agentLoop.ts` (`SYSTEM_PROMPT`, ~L8)

**Interfaces:**
- Consumes: `routeVerbatim` (Task 2), `runVibeCommand` from `./commands`, `terminalsOf`/`useCardStore` from `../wall/cardStore`, `settings.vibe.dictation` (Task 1).
- Produces: dictation behavior switch; no new exports.

- [ ] **Step 1: Add the fast-path**

In `src/vibe/VibeAgent.tsx`, add imports:

```ts
import { runVibeCommand } from "./commands";  // extend the existing "./commands" import
import { routeVerbatim } from "../wall/dictation";
import { terminalsOf, useCardStore } from "../wall/cardStore";
```

Then at the TOP of `runUtterance` (before `setState("thinking")`), insert:

```tsx
    // Verbatim mode: a clean "ask <name> …" prefix skips the LLM entirely —
    // the user's exact words go to the agent. Anything else falls through.
    if (vibe.dictation === "verbatim" && !conversation.current) {
      const terminals = terminalsOf(useCardStore.getState().cards);
      const routed = routeVerbatim(transcript, terminals);
      if (routed) {
        setState("thinking");
        showCaption(`"${transcript}"`);
        const result = await runVibeCommand("send_to_agent", {
          agent_name: routed.agent.name,
          prompt: routed.prompt,
        });
        const ok = result.startsWith("Sent to");
        const text = ok ? `Sent to ${routed.agent.name}.` : result;
        setState("speaking");
        showCaption(text);
        await speak(text, vibe.voice);
        setState("idle");
        return;
      }
    }
```

(`!conversation.current` keeps mid-conversation answers to Vibe's own
questions out of the fast-path.)

- [ ] **Step 2: Update the loop's system prompt**

In `src/vibe/agentLoop.ts`, extend `SYSTEM_PROMPT` — after the sentence ending
"…the user's spoken answer will arrive as the next message.", add:

```
When the user asks a coding agent to do something ("ask Max to run the
tests"), use send_to_agent with the request rewritten as one clear,
self-contained prompt — keep the user's intent, drop the filler. Address
several agents with one send_to_agent call each.
```

- [ ] **Step 3: Typecheck + unit tests**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run src/vibe`
Expected: no type errors; existing vibe tests PASS (agentLoop tests don't pin the prompt text).

- [ ] **Step 4: Manual smoke via dev console (no mic needed)**

With the app already running (user-driven — do NOT restart it), in devtools:
`window.__vibeSay("ask <existing agent name> to say hello")`
Expected: prompt appears typed + submitted in that terminal; Vibe says "Sent to <Name>."; ~after the agent settles, "…finished its task." is spoken.

- [ ] **Step 5: Commit**

```bash
git add src/vibe/VibeAgent.tsx src/vibe/agentLoop.ts
git commit -m "feat(vibe): verbatim dictation fast-path + send_to_agent prompt guidance"
```


### Task 6: Hint pill — `buildHints` + `HintPill` component

**Files:**
- Create: `src/vibe/hints.ts`
- Create: `src/vibe/hints.test.ts`
- Create: `src/vibe/HintPill.tsx`
- Create: `src/vibe/HintPill.css`
- Modify: `src/vibe/VibeAgent.tsx` (render alongside `VibePet`)

**Interfaces:**
- Consumes: `VibeState` from `./VibePet`; agent names via `terminalsOf(useCardStore.getState().cards)`; preset labels via `presetStore` (see `src/wall/presetStore.ts` for its hook/getter — use whatever `WallView` uses).
- Produces: `buildHints(agentNames: string[], presetLabels: string[]): string[]`; `<HintPill state={VibeState} caption={string|null} />`.

- [ ] **Step 1: Write the failing `buildHints` tests**

Create `src/vibe/hints.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildHints } from "./hints";

describe("buildHints", () => {
  it("uses a live agent name in agent hints", () => {
    const hints = buildHints(["Max"], ["Claude Code"]);
    expect(hints.some((h) => h.includes("Max"))).toBe(true);
  });
  it("falls back to open-terminal hints when no agents exist", () => {
    const hints = buildHints([], ["Claude Code", "Codex"]);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some((h) => h.toLowerCase().includes("claude code"))).toBe(true);
    expect(hints.every((h) => !h.includes("undefined"))).toBe(true);
  });
  it("is deterministic for the same inputs", () => {
    expect(buildHints(["Max"], ["Codex"])).toEqual(buildHints(["Max"], ["Codex"]));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/vibe/hints.test.ts`
Expected: FAIL — module `./hints` not found.

- [ ] **Step 3: Implement `buildHints`**

Create `src/vibe/hints.ts`:

```ts
/** Rotating "Try …" suggestions for the hint pill, from live wall context. */
export function buildHints(agentNames: string[], presetLabels: string[]): string[] {
  const hints: string[] = [];
  const a = agentNames[0];
  if (a) {
    hints.push(
      `Try "ask ${a} to run the tests"`,
      `Try "tell ${a} to fix the failing build"`,
      `Try "ask ${a} what changed in this repo today"`
    );
  }
  for (const p of presetLabels.slice(0, 2)) {
    hints.push(`Try "open a ${p} terminal"`);
  }
  hints.push(`Try "apply the Ember theme"`, `Try "open the task board"`);
  return hints;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/vibe/hints.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the pill component**

Create `src/vibe/HintPill.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { VibeState } from "./VibePet";
import { terminalsOf, useCardStore } from "../wall/cardStore";
import { DEFAULT_PRESETS } from "../wall/presets";
import { buildHints } from "./hints";
import "./HintPill.css";

const ROTATE_MS = 8000;

/**
 * Bottom-center voice pill. Idle: cycles "Try …" hints. Listening: mic
 * animation. Otherwise: the current caption (transcript / reply) from
 * VibeAgent's state machine — the pill renders state, it owns none.
 */
export function HintPill({ state, caption }: { state: VibeState; caption: string | null }) {
  const cards = useCardStore((s) => s.cards);
  const [i, setI] = useState(0);

  const hints = buildHints(
    terminalsOf(cards).map((t) => t.name),
    DEFAULT_PRESETS.map((p) => p.label)
  );

  useEffect(() => {
    const t = window.setInterval(() => setI((n) => n + 1), ROTATE_MS);
    return () => window.clearInterval(t);
  }, []);

  if (state === "sleeping") return null;

  const listening = state === "listening";
  const text = listening
    ? "Listening…"
    : caption ?? hints[i % Math.max(hints.length, 1)] ?? "";
  if (!text) return null;

  return (
    <div className={`hint-pill ${listening ? "hint-pill--listening" : ""} ${caption ? "hint-pill--active" : ""}`}>
      <span className="hint-pill-dot" aria-hidden />
      <span className="hint-pill-text">{text}</span>
    </div>
  );
}
```

Create `src/vibe/HintPill.css` (match the app's warm-amber glass styling — see `excalidraw-skin.css` / `theme.css` for the exact tokens in use):

```css
.hint-pill {
  position: fixed;
  bottom: 44px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(560px, 70vw);
  padding: 8px 16px;
  border-radius: 999px;
  background: rgba(18, 17, 15, 0.72);
  border: 1px solid rgba(215, 154, 61, 0.25);
  backdrop-filter: blur(10px);
  color: #f3eee5;
  font-size: 13px;
  font-style: italic;
  z-index: 40;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
.hint-pill-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hint-pill-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(215, 154, 61, 0.5);
  flex: none;
}
.hint-pill--listening .hint-pill-dot {
  background: #d79a3d;
  animation: hint-pulse 1s ease-in-out infinite;
}
.hint-pill--active { font-style: normal; }
@keyframes hint-pulse {
  50% { transform: scale(1.8); opacity: 0.6; }
}
```

- [ ] **Step 6: Render it from VibeAgent**

In `src/vibe/VibeAgent.tsx`, replace the return with:

```tsx
  return (
    <>
      <HintPill state={state} caption={caption} />
      <VibePet
        state={state}
        caption={caption}
        celebrating={celebrating}
        onActivate={() => void listen()}
      />
    </>
  );
```

and add `import { HintPill } from "./HintPill";`.

- [ ] **Step 7: Typecheck + full vibe tests**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run src/vibe`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/vibe/hints.ts src/vibe/hints.test.ts src/vibe/HintPill.tsx src/vibe/HintPill.css src/vibe/VibeAgent.tsx
git commit -m "feat(vibe): bottom-center hint pill with live transcript and Try-hints"
```


### Task 7: Live-eval routing cases, README, final verification

**Files:**
- Modify: `src/vibe/eval.live.test.ts` (`fakeRegistry`, ~L16, + new cases at the end)
- Modify: `README.md` ("Vibe — voice companion" section)

**Interfaces:**
- Consumes: everything above; the eval harness's `fakeRegistry()` recorder pattern.

- [ ] **Step 1: Add `send_to_agent` to the eval stub registry**

In `src/vibe/eval.live.test.ts`, inside `fakeRegistry()` after the `close_terminal` stub:

```ts
  stub("send_to_agent", "Type a prompt into an agent's terminal and submit it. Use when the user wants an agent to DO something. Pass one clear, self-contained prompt. One call per target agent.", {
    type: "object",
    properties: {
      agent_name: { type: "string", description: "Agent name shown on the terminal (e.g. 'Max')" },
      prompt: { type: "string", description: "The prompt to type and submit" },
    },
    required: ["agent_name", "prompt"],
  }, "Sent to Max.");
```

- [ ] **Step 2: Add routing eval cases**

Append alongside the existing `it` cases (same style/skip guard as the rest of the file):

```ts
  it("routes a task request to send_to_agent", async () => {
    await runAgent("ask Max to run the test suite", liveChat);
    const call = calls.find((c) => c.name === "send_to_agent");
    expect(call?.args.agent_name).toMatch(/max/i);
    expect(String(call?.args.prompt)).toMatch(/test/i);
  });

  it("fans out one utterance to two agents", async () => {
    await runAgent("ask Max to run the tests and tell Ruby to check the build", liveChat);
    const targets = calls.filter((c) => c.name === "send_to_agent").map((c) => String(c.args.agent_name).toLowerCase());
    expect(targets).toContain("max");
    expect(targets).toContain("ruby");
  });

  it("keeps UI commands away from send_to_agent", async () => {
    await runAgent("open the task board", liveChat);
    expect(calls.some((c) => c.name === "send_to_agent")).toBe(false);
    expect(calls.some((c) => c.name === "open_task_board")).toBe(true);
  });
```

Note: the wall context block normally lists open terminals; the eval harness has none, so if the model refuses to route without a known agent, add `Open terminals: Max (Claude Code), Ruby (Codex)` context the same way existing cases seed state — copy the pattern already used in this file, if any case does so.

- [ ] **Step 3: Run the live evals (only if GROQ_API_KEY is set)**

Run: `npm run vibe:eval`
Expected: new cases PASS. If no key is available, skip — the suite self-skips and the cases run in CI/user-driven later.

- [ ] **Step 4: Update README**

In `README.md`, replace the sentence "Vibe controls the UI only; it never types into terminals." with:

```
Vibe can also dictate INTO agent terminals: "ask Max to run the tests" types
the prompt into Max's terminal and submits it, and Vibe pings you ("Max
finished its task") when the agent settles. Settings → Vibe picks whether
your words arrive verbatim or cleaned up by the model.
```

And in the "It can:" list, add "dictate prompts to agent terminals by name" before "open Claude Code / Codex / plain terminals".

- [ ] **Step 5: Full test run + typecheck**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: all green.

- [ ] **Step 6: Manual end-to-end verify (user-driven — never restart the app yourself)**

Ask the user to try, in a running Vibe Space with one agent terminal open:
1. Shaped mode (default): "Vibe … ask <name> to list the files here" → cleaned prompt lands + submits; completion ping speaks.
2. Settings → Vibe → Dictation: Verbatim: same phrase → exact words land.
3. "open the task board" still works in both modes; unknown name gets a spoken error listing agents.
4. Pill: idle hints rotate; "Listening…" pulses during capture; transcript shows while thinking.

- [ ] **Step 7: Commit**

```bash
git add src/vibe/eval.live.test.ts README.md
git commit -m "test(vibe): dictation routing evals + README dictation docs"
```

