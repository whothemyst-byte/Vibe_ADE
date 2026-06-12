# Vibe Agent Harness Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the vibe pet voice agent: smarter brain (gpt-oss-120b), app-state context for the model, deterministic ask-back conversations, more accurate speech capture, and a live eval suite to measure it all.

**Architecture:** Five in-place upgrades to the existing webview-only harness (`src/vibe/`), per the approved spec `docs/superpowers/specs/2026-06-12-vibe-agent-harness-design.md`. No new runtime architecture: the command registry, agent loop, and voice pipeline keep their current shapes. A new context registry mirrors the command registry; the Supabase groq-proxy whitelist is updated in lockstep with the client model constant.

**Tech Stack:** React 19 + TypeScript, Vitest, Groq API (`openai/gpt-oss-120b` chat + `whisper-large-v3-turbo` STT), Supabase Edge Function proxy (Deno), vosk-browser wake word (untouched).

**Conventions:** All paths relative to the `vibe-walls/` repo root. Run tests with `npm test` (vitest run). Commit after every task. The repo's CLAUDE.md applies: surgical changes only.

---

### Task 1: Brain swap to `openai/gpt-oss-120b`

Groq's docs list `openai/gpt-oss-120b` as their strongest tool-use model. It is a reasoning model, so chat requests must pin `reasoning_effort: "low"` to keep voice latency down. The proxy whitelists exactly one chat model, so client and proxy change together.

**Files:**
- Modify: `src/vibe/groq.ts` (CHAT_MODEL constant, chat body)
- Modify: `src/vibe/groq.test.ts` (model assertions)
- Modify: `supabase/functions/groq-proxy/rules.ts:4` (CHAT_MODEL)
- Modify: `supabase/functions/groq-proxy/rules.test.ts` (old-model rejection test)
- Modify: `src/settings/SettingsModal.tsx:180` (displayed model name)

- [ ] **Step 1: Update the failing client tests**

In `src/vibe/groq.test.ts`, change both `body.model` assertions (the direct chat test and the proxy chat test) from `"llama-3.3-70b-versatile"` to `"openai/gpt-oss-120b"`, and in the direct chat test ("posts messages+tools to groq directly...") add one line after the model assertion:

```ts
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.reasoning_effort).toBe("low");
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/vibe/groq.test.ts`
Expected: 2 tests FAIL (model is still `llama-3.3-70b-versatile`, `reasoning_effort` undefined).

- [ ] **Step 3: Implement in `src/vibe/groq.ts`**

```ts
export const CHAT_MODEL = "openai/gpt-oss-120b";
```

and in `chat()` add `reasoning_effort` to the JSON body:

```ts
    body: JSON.stringify({
      model: CHAT_MODEL,
      reasoning_effort: "low", // gpt-oss is a reasoning model; low keeps voice latency down
      messages,
      ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    }),
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- src/vibe/groq.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the failing proxy test**

In `supabase/functions/groq-proxy/rules.test.ts`, add inside the existing `describe`:

```ts
  it("rejects the retired llama-3.3 chat model", () => {
    expect(checkRequest("chat", "llama-3.3-70b-versatile", "d")?.status).toBe(400);
  });
```

Run: `npm test -- supabase/functions/groq-proxy/rules.test.ts`
Expected: the new test FAILS (old model is still whitelisted).

- [ ] **Step 6: Update the proxy whitelist**

In `supabase/functions/groq-proxy/rules.ts`:

```ts
export const CHAT_MODEL = "openai/gpt-oss-120b";
```

Run: `npm test -- supabase/functions/groq-proxy/rules.test.ts`
Expected: PASS (the other tests import `CHAT_MODEL`, so they track the change automatically).

- [ ] **Step 7: Update the settings copy**

In `src/settings/SettingsModal.tsx` (~line 180), change the model sentence to:

```
runs fully offline. Models: GPT-OSS 120B (brain) + Whisper large-v3-turbo
(ears).
```

- [ ] **Step 8: Full test run + commit**

Run: `npm test`
Expected: all suites PASS.

```bash
git add src/vibe/groq.ts src/vibe/groq.test.ts supabase/functions/groq-proxy/rules.ts supabase/functions/groq-proxy/rules.test.ts src/settings/SettingsModal.tsx
git commit -m "feat(vibe): swap brain to openai/gpt-oss-120b (client + proxy whitelist)"
```

- [ ] **Step 9: Redeploy the edge function**

The proxy lives on Supabase project `cvithwrsgmtdajaddsab` (function `groq-proxy`, JWT verification off). Deploy via the Supabase MCP tool `deploy_edge_function` with name `groq-proxy` and the contents of `supabase/functions/groq-proxy/index.ts` + `rules.ts` (entrypoint `index.ts`), or via CLI:

```bash
supabase functions deploy groq-proxy --project-ref cvithwrsgmtdajaddsab --no-verify-jwt
```

Verify: the deploy output lists `groq-proxy` as deployed. (End-to-end behavior is verified by the eval harness in Task 2 / manual checks in Task 6 — proxy mode is exercised by the app itself.)

### Task 2: Live eval harness (`npm run vibe:eval`)

A vitest suite that hits the **live** Groq chat endpoint with canned utterances against a fake command registry, asserting which tool the model picks and with what arguments. Named `*.live.test.ts` so the normal `npm test` never runs it; a dedicated config runs only this file. Skips itself (with a message) when `GROQ_API_KEY` is missing. Never uses the proxy — a developer's own key only.

**Files:**
- Create: `vitest.eval.config.ts`
- Create: `src/vibe/eval.live.test.ts`
- Modify: `vitest.config.ts` (exclude `*.live.test.ts` from the default run)
- Modify: `package.json` (add `vibe:eval` script)

- [ ] **Step 1: Exclude live tests from the default run**

Replace `vitest.config.ts` with:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "supabase/functions/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/*.live.test.ts"],
  },
});
```

- [ ] **Step 2: Create the eval config**

Create `vitest.eval.config.ts`:

```ts
import { defineConfig } from "vitest/config";

// Live model evals (cost free-tier quota; need GROQ_API_KEY). Run: npm run vibe:eval
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/vibe/eval.live.test.ts"],
    testTimeout: 30000,
  },
});
```

- [ ] **Step 3: Add the npm script**

In `package.json` scripts:

```json
    "test": "vitest run",
    "vibe:eval": "vitest run --config vitest.eval.config.ts"
```

- [ ] **Step 4: Write the eval suite**

Create `src/vibe/eval.live.test.ts`. The fake registry mirrors the app's real commands (names + schemas) but the handlers just record the call. `runAgent` is the real loop, `chat` is the real client.

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { runAgent } from "./agentLoop";
import { registerVibeCommand, _clearRegistryForTests, type ToolDef } from "./commands";
import { chat, type ChatMessage } from "./groq";

const KEY = process.env.GROQ_API_KEY;
if (!KEY) console.warn("[vibe:eval] GROQ_API_KEY not set — eval suite skipped.");

const liveChat = (messages: ChatMessage[], tools: ToolDef[]) =>
  chat(messages, tools, { kind: "direct", key: KEY! });

/** Registers the app's command surface as recording stubs; returns the recorder. */
function fakeRegistry() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const stub = (name: string, description: string, parameters?: Record<string, unknown>, result = "ok, done") =>
    registerVibeCommand({
      name, description, parameters,
      run: (args) => { calls.push({ name, args }); return result; },
    });

  stub("go_to_start_page", "Navigate to the start page (the wall picker).");
  stub("open_task_board", "Open the task board view.");
  stub("open_wall", "Open a wall (canvas workspace) by its name.", {
    type: "object",
    properties: { name: { type: "string", description: "Wall name, e.g. 'design'" } },
    required: ["name"],
  });
  stub("create_wall", "Create a NEW wall in a folder and open it. If the user did not say where, ask where to create it.", {
    type: "object",
    properties: {
      location: { type: "string", description: "Absolute folder path, or 'picker' for the native picker" },
      name: { type: "string", description: "Optional wall name" },
    },
    required: ["location"],
  });
  stub("open_terminal", "Spawn a new agent terminal on this wall. Available presets: Claude Code, Codex, Plain shell. Omit preset for a plain shell.", {
    type: "object",
    properties: { preset: { type: "string", description: "Preset name (fuzzy matched)" } },
  }, "Opened a Claude Code terminal named Ada.");
  stub("close_terminal", "Close a terminal on this wall by its agent name (e.g. 'Ada').", {
    type: "object",
    properties: { name: { type: "string", description: "Agent name shown on the terminal" } },
    required: ["name"],
  });
  stub("apply_theme", "Apply a pre-made theme to this wall. Themes: Dusk, Paper, Forest, Ocean, Mono, Ember.", {
    type: "object",
    properties: { name: { type: "string", description: "Theme name" } },
    required: ["name"],
  });
  stub("create_task", "Create a new task in the backlog column.", {
    type: "object",
    properties: { title: { type: "string", description: "Task title" } },
    required: ["title"],
  });
  stub("move_task", "Move a task to another column. Columns: backlog, in progress, in review, done.", {
    type: "object",
    properties: {
      title: { type: "string", description: "Task title (fuzzy matched)" },
      column: { type: "string", description: "Target column" },
    },
    required: ["title", "column"],
  });
  return calls;
}

let calls: ReturnType<typeof fakeRegistry>;
beforeEach(() => {
  _clearRegistryForTests();
  calls = fakeRegistry();
});

// retry: free-tier models are occasionally flaky; a single retry keeps signal honest.
describe.runIf(KEY)("vibe agent eval (live Groq)", { retry: 1 }, () => {
  it("opens a terminal", async () => {
    await runAgent("open a terminal", liveChat);
    expect(calls.map((c) => c.name)).toContain("open_terminal");
  });

  it("opens a terminal with the right preset", async () => {
    await runAgent("give me a claude terminal", liveChat);
    const c = calls.find((c) => c.name === "open_terminal");
    expect(String(c?.args.preset ?? "")).toMatch(/claude/i);
  });

  it("closes a named terminal", async () => {
    await runAgent("close ada's terminal", liveChat);
    const c = calls.find((c) => c.name === "close_terminal");
    expect(String(c?.args.name ?? "")).toMatch(/ada/i);
  });

  it("opens a wall by name", async () => {
    await runAgent("open the design wall", liveChat);
    const c = calls.find((c) => c.name === "open_wall");
    expect(String(c?.args.name ?? "")).toMatch(/design/i);
  });

  it("navigates to the task board", async () => {
    await runAgent("show me the task board", liveChat);
    expect(calls.map((c) => c.name)).toContain("open_task_board");
  });

  it("goes back to the start page", async () => {
    await runAgent("take me back to the start page", liveChat);
    expect(calls.map((c) => c.name)).toContain("go_to_start_page");
  });

  it("applies a theme", async () => {
    await runAgent("switch to the dusk theme", liveChat);
    const c = calls.find((c) => c.name === "apply_theme");
    expect(String(c?.args.name ?? "")).toMatch(/dusk/i);
  });

  it("creates a task with the spoken title", async () => {
    await runAgent("add a task called fix the login bug", liveChat);
    const c = calls.find((c) => c.name === "create_task");
    expect(String(c?.args.title ?? "")).toMatch(/login/i);
  });

  it("moves a task to done", async () => {
    await runAgent("move the login task to done", liveChat);
    const c = calls.find((c) => c.name === "move_task");
    expect(String(c?.args.column ?? "")).toMatch(/done/i);
  });

  it("creates a wall at an explicit path", async () => {
    await runAgent("create a wall called demo in C:\\Users\\admin\\Projects", liveChat);
    const c = calls.find((c) => c.name === "create_wall");
    expect(String(c?.args.location ?? "")).toMatch(/projects/i);
  });

  it("chains two commands in one utterance", async () => {
    await runAgent("open the design wall and give me a terminal", liveChat);
    const names = calls.map((c) => c.name);
    expect(names).toContain("open_wall");
    expect(names).toContain("open_terminal");
  });

  it("answers capability questions without calling tools", async () => {
    const out = await runAgent("what can you do?", liveChat);
    expect(calls).toHaveLength(0);
    expect(out.text.length).toBeGreaterThan(10);
  });

  it("does not invent tools for unrelated requests", async () => {
    const out = await runAgent("what's the weather like on mars?", liveChat);
    expect(calls).toHaveLength(0);
    expect(out.text.length).toBeGreaterThan(0);
  });
});
```

Note: at this point `runAgent` still returns `{ text, messages }` without `kind` — the eval only reads `.text`, so it works before and after Task 4. Task 4 appends an `ask_user` eval case.

- [ ] **Step 5: Verify the default suite still excludes it**

Run: `npm test`
Expected: all suites PASS and `eval.live.test.ts` does NOT appear in the run.

- [ ] **Step 6: Run the eval live (baseline for the new model)**

PowerShell: `$env:GROQ_API_KEY = "<your key>"; npm run vibe:eval`
Expected: the suite runs 13 tests; record the pass count in the commit message. 11+/13 is a healthy baseline; investigate prompt/description wording if lower. Without a key it reports "no tests" / skips cleanly.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts vitest.eval.config.ts package.json src/vibe/eval.live.test.ts
git commit -m "feat(vibe): live eval harness for the agent brain (npm run vibe:eval)"
```

### Task 3: App-state context registry

A mirror of the command registry for state snapshots. Components register a named `() => string` provider while mounted; `runAgent` joins them into a `Current app state:` block appended to the system prompt — rebuilt every turn, including continuation turns (the system message is replaced so mid-conversation tool actions are reflected).

**Files:**
- Create: `src/vibe/context.ts`
- Create: `src/vibe/context.test.ts`
- Modify: `src/vibe/agentLoop.ts` (system prompt builder)
- Modify: `src/vibe/agentLoop.test.ts` (context block test)
- Modify: `src/App.tsx` (provider: current view + wall names)
- Modify: `src/wall/WallView.tsx` (provider: terminals, theme, presets)
- Modify: `src/tasks/TaskBoard.tsx` (provider: columns + task titles)

- [ ] **Step 1: Write the failing registry tests**

Create `src/vibe/context.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { registerVibeContext, getContextBlock, _clearContextForTests } from "./context";

beforeEach(() => _clearContextForTests());

describe("context registry", () => {
  it("returns an empty string when nothing is registered", () => {
    expect(getContextBlock()).toBe("");
  });

  it("joins providers one line each, in registration order", () => {
    registerVibeContext("app", () => "view: start page");
    registerVibeContext("tasks", () => "Backlog: fix bug");
    expect(getContextBlock()).toBe("- app: view: start page\n- tasks: Backlog: fix bug");
  });

  it("cleanup removes only the current provider for that name", () => {
    const cleanupOld = registerVibeContext("app", () => "old");
    registerVibeContext("app", () => "new");
    cleanupOld(); // stale cleanup (StrictMode double-mount) must not remove the replacement
    expect(getContextBlock()).toBe("- app: new");
  });

  it("skips empty snapshots and survives throwing ones", () => {
    registerVibeContext("empty", () => "  ");
    registerVibeContext("boom", () => { throw new Error("broken"); });
    registerVibeContext("ok", () => "fine");
    expect(getContextBlock()).toBe("- ok: fine");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/vibe/context.test.ts`
Expected: FAIL — module `./context` does not exist.

- [ ] **Step 3: Implement `src/vibe/context.ts`**

```ts
import { useEffect, useRef } from "react";

/** Live app-state snapshot, shown to the LLM each turn. Keep it one short line. */
type Snapshot = () => string;

const providers = new Map<string, Snapshot>();

/** Registers a snapshot provider; returns a cleanup that removes it (only if still current). */
export function registerVibeContext(name: string, snapshot: Snapshot): () => void {
  providers.set(name, snapshot);
  return () => {
    if (providers.get(name) === snapshot) providers.delete(name);
  };
}

/** One "- name: snapshot" line per provider; "" when none. Never throws. */
export function getContextBlock(): string {
  const lines: string[] = [];
  for (const [name, snap] of providers) {
    try {
      const text = snap().trim();
      if (text) lines.push(`- ${name}: ${text}`);
    } catch {
      /* a broken snapshot must never break the agent */
    }
  }
  return lines.join("\n");
}

export function _clearContextForTests(): void {
  providers.clear();
}

/**
 * Registers a context provider for the lifetime of the component. Same
 * fresh-ref + StrictMode-safe cleanup pattern as useVibeCommand.
 */
export function useVibeContext(name: string, snapshot: Snapshot): void {
  const ref = useRef(snapshot);
  ref.current = snapshot;
  useEffect(() => {
    return registerVibeContext(name, () => ref.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/vibe/context.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing agent-loop test**

Add to `src/vibe/agentLoop.test.ts` (import `registerVibeContext, _clearContextForTests` from `./context`; call `_clearContextForTests()` inside the existing `beforeEach` alongside `_clearRegistryForTests()`):

```ts
  it("appends the current app state to the system prompt", async () => {
    registerVibeContext("app", () => "view: wall \"design\"");
    const chat = vi.fn().mockResolvedValue(say("Hi!"));
    await runAgent("hello", chat);
    const system: ChatMessage = chat.mock.calls[0][0][0];
    expect(system.role).toBe("system");
    expect(system.content).toContain("Current app state:");
    expect(system.content).toContain('- app: view: wall "design"');
  });

  it("refreshes the app state on continuation turns", async () => {
    let view = "start page";
    registerVibeContext("app", () => `view: ${view}`);
    const first = vi.fn().mockResolvedValue(say("Which wall?"));
    const prior = (await runAgent("open a wall", first)).messages;

    view = "wall \"design\"";
    const second = vi.fn().mockResolvedValue(say("Done."));
    await runAgent("the design one", second, prior);
    const system: ChatMessage = second.mock.calls[0][0][0];
    expect(system.content).toContain('wall "design"');
  });
```

(Note: at this point `runAgent`'s third parameter is still the positional `prior` array — Task 4 changes it to an options object and updates these call sites.)

Run: `npm test -- src/vibe/agentLoop.test.ts`
Expected: the 2 new tests FAIL.

- [ ] **Step 6: Implement in `src/vibe/agentLoop.ts`**

Import `getContextBlock` from `./context`. Add below `SYSTEM_PROMPT`:

```ts
function systemPrompt(): string {
  const ctx = getContextBlock();
  return ctx ? `${SYSTEM_PROMPT}\n\nCurrent app state:\n${ctx}` : SYSTEM_PROMPT;
}
```

In `runAgent`, build messages with `systemPrompt()` instead of `SYSTEM_PROMPT`, and refresh the system message when continuing:

```ts
  const messages: ChatMessage[] = prior
    ? [...prior, { role: "user", content: transcript }]
    : [
        { role: "system", content: systemPrompt() },
        { role: "user", content: transcript },
      ];
  // Continuation turns refresh the state block (tools may have changed the app).
  if (prior) messages[0] = { role: "system", content: systemPrompt() };
```

Run: `npm test -- src/vibe/agentLoop.test.ts`
Expected: PASS (all, including pre-existing tests).

- [ ] **Step 7: Register the providers**

`src/App.tsx` — import `useVibeContext` from `./vibe/context` and add inside `App()` (after the `view` state; `WallMeta` and `loadIndex` are already imported, `useEffect`/`useRef` need adding to the react import):

```tsx
  const wallsRef = useRef<WallMeta[]>([]);
  useEffect(() => {
    void loadIndex().then((i) => { wallsRef.current = i; });
  }, [view]);
  useVibeContext("app", () => {
    const where =
      view.kind === "start" ? "start page"
      : view.kind === "tasks" ? "task board"
      : `wall "${wallsRef.current.find((w) => w.id === view.id)?.name ?? "unknown"}"`;
    const names = wallsRef.current.map((w) => w.name).join(", ") || "none yet";
    return `current view: ${where}; existing walls: ${names}`;
  });
```

`src/wall/WallView.tsx` — import `useVibeContext` from `../vibe/context` and add next to the existing `useVibeCommand` blocks:

```tsx
  useVibeContext("wall", () => {
    const cards = useCardStore.getState().cards;
    const terms = terminalsOf(cards).map((t) => {
      const preset = presets.find((p) => p.id === t.presetId);
      return preset ? `${t.name} (${preset.label})` : t.name;
    });
    const theme = THEMES.find(
      (t) => JSON.stringify(t.background) === JSON.stringify(backgroundRef.current)
    )?.name ?? "custom";
    const browser = cards.some((c) => c.kind === "browser") ? "; browser card open" : "";
    return `open terminals: ${terms.join(", ") || "none"}${browser}; theme: ${theme}; terminal presets: ${presets.map((p) => p.label).join(", ")}`;
  });
```

`src/tasks/TaskBoard.tsx` — import `useVibeContext` from `../vibe/context` and add next to the existing `useVibeCommand` blocks:

```tsx
  useVibeContext("tasks", () => {
    const all = useTaskStore.getState().tasks;
    return COLUMNS.map((c) => {
      const titles = all.filter((t) => t.status === c.key).map((t) => t.title || "untitled");
      return `${c.label}: ${titles.join(", ") || "(empty)"}`;
    }).join(" | ");
  });
```

- [ ] **Step 8: Verify build + tests, manual smoke, commit**

Run: `npm test` — Expected: PASS.
Run: `npm run build` — Expected: tsc clean.
Manual (optional but cheap): `npm run tauri dev`, open a wall, run `window.__vibeSay("which wall am I on?")` in the webview devtools console — the pet should answer with the wall's actual name.

```bash
git add src/vibe/context.ts src/vibe/context.test.ts src/vibe/agentLoop.ts src/vibe/agentLoop.test.ts src/App.tsx src/wall/WallView.tsx src/tasks/TaskBoard.tsx
git commit -m "feat(vibe): app-state context registry feeds the agent's system prompt"
```

### Task 4: Conversation mechanics — `ask_user` tool, graceful round cap, bad-JSON feedback

Three loop changes that share one signature change, so they land as one task:
1. An `ask_user(question)` tool the loop injects itself (never in the registry). The model calling it ends the turn with `kind: "question"`; `VibeAgent` branches on `kind` instead of `text.endsWith("?")`.
2. `MAX_TOOL_ROUNDS` 3 → 5, where the **final** round sends a "summarize" system note and **no tools**, so the cap always yields a real spoken summary.
3. Malformed tool-call JSON returns an error tool-result (model self-corrects) instead of silently running with `{}`.

`runAgent`'s third parameter becomes an options object: `runAgent(transcript, chatFn, { prior?, allowAskUser? })`.

**Files:**
- Modify: `src/vibe/agentLoop.ts` (full rewrite of the loop body)
- Modify: `src/vibe/agentLoop.test.ts` (update existing + new tests)
- Modify: `src/vibe/VibeAgent.tsx` (branch on `kind`, pass options)
- Modify: `src/vibe/eval.live.test.ts` (one ask_user case)

- [ ] **Step 1: Update and extend the tests**

In `src/vibe/agentLoop.test.ts`:

(a) Update the two call sites that pass `prior` positionally (the "continues a prior conversation" test and Task 3's "refreshes the app state" test) to `runAgent("...", chat, { prior })`.

(b) Replace the round-cap test:

```ts
  it("caps tool rounds: 4 with tools, then a final no-tools summary call", async () => {
    registerVibeCommand({ name: "noop", description: "d", run: () => "ok" });
    const chat = vi.fn().mockImplementation((_msgs: ChatMessage[], tools: ToolDef[]) =>
      Promise.resolve(tools.length > 0 ? call(toolCall("noop", {})) : say("I did a few things!"))
    );
    const out = await runAgent("loop forever", chat);
    expect(chat).toHaveBeenCalledTimes(5);
    expect(chat.mock.calls[4][1]).toEqual([]); // final round offers no tools
    const finalMessages: ChatMessage[] = chat.mock.calls[4][0];
    expect(finalMessages.at(-1)?.content).toMatch(/no more tool calls/i);
    expect(out).toMatchObject({ kind: "reply", text: "I did a few things!" });
  });
```

(`ToolDef` is imported from `./commands`.)

(c) Replace the malformed-arguments test:

```ts
  it("feeds bad tool JSON back as an error instead of running with empty args", async () => {
    const run = vi.fn().mockReturnValue("ok");
    registerVibeCommand({ name: "open_terminal", description: "d", run });
    const chat = vi.fn()
      .mockResolvedValueOnce(call({ id: "c1", type: "function", function: { name: "open_terminal", arguments: "{not json" } }))
      .mockResolvedValueOnce(say("Sorry, let me try again."));
    await runAgent("open", chat);
    expect(run).not.toHaveBeenCalled();
    const second: ChatMessage[] = chat.mock.calls[1][0];
    const toolMsg = second.find((m) => m.role === "tool");
    expect(toolMsg?.content).toMatch(/not valid JSON/i);
  });
```

(d) New `ask_user` tests:

```ts
  it("offers ask_user and returns kind question when the model calls it", async () => {
    const chat = vi.fn().mockResolvedValue(
      call(toolCall("ask_user", { question: "Where should I create it?" }))
    );
    const out = await runAgent("make a new wall", chat);
    expect(out.kind).toBe("question");
    expect(out.text).toBe("Where should I create it?");
    const tools: ToolDef[] = chat.mock.calls[0][1];
    expect(tools.map((t) => t.function.name)).toContain("ask_user");
    // the tool call got a result so the conversation can legally continue
    expect(out.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1" });
  });

  it("omits ask_user when allowAskUser is false", async () => {
    const chat = vi.fn().mockResolvedValue(say("Done."));
    await runAgent("hello", chat, { allowAskUser: false });
    const tools: ToolDef[] = chat.mock.calls[0][1];
    expect(tools.map((t) => t.function.name)).not.toContain("ask_user");
  });

  it("plain replies report kind reply", async () => {
    const chat = vi.fn().mockResolvedValue(say("Hi there!"));
    expect((await runAgent("hi", chat)).kind).toBe("reply");
  });
```

Run: `npm test -- src/vibe/agentLoop.test.ts`
Expected: new/updated tests FAIL (signature and behavior not implemented).

- [ ] **Step 2: Rewrite `src/vibe/agentLoop.ts`**

```ts
import { getToolDefs, runVibeCommand, type ToolDef } from "./commands";
import { getContextBlock } from "./context";
import type { ChatMessage } from "./groq";

/** 4 tool rounds + 1 forced no-tools summary round. */
export const MAX_TOOL_ROUNDS = 5;

const SYSTEM_PROMPT = `You are Vibe, a small friendly ghost who lives inside the
vibe-walls app and controls it for the user by voice. The user just spoke one
request. Use the provided tools to carry it out, then confirm what you did in
ONE short, casual sentence (it will be read aloud). If a command needs
information the user didn't give (like a name or location), do NOT guess —
call the ask_user tool with ONE short question and the user's spoken answer
will arrive as the next message. If no tool fits, answer conversationally and
briefly. If asked what you can do, summarize your current tools in plain
words. Never invent tools, never output code or markdown.`;

/** Injected by the loop itself — never lives in the command registry. */
const ASK_USER: ToolDef = {
  type: "function",
  function: {
    name: "ask_user",
    description:
      "Ask the user ONE short clarifying question out loud and wait for their spoken answer. Use only when a required detail is missing.",
    parameters: {
      type: "object",
      properties: { question: { type: "string", description: "The question to speak" } },
      required: ["question"],
    },
  },
};

function systemPrompt(): string {
  const ctx = getContextBlock();
  return ctx ? `${SYSTEM_PROMPT}\n\nCurrent app state:\n${ctx}` : SYSTEM_PROMPT;
}

export type ChatFn = (
  messages: ChatMessage[],
  tools: ToolDef[]
) => Promise<Extract<ChatMessage, { role: "assistant" }>>;

export type AgentResult = {
  /** "question" = speak `text`, then listen and continue with `messages` as prior. */
  kind: "reply" | "question";
  /** Text to speak. */
  text: string;
  /** Full message log including this turn — pass back in to continue the conversation. */
  messages: ChatMessage[];
};

export type AgentOptions = {
  /** Previous result's `messages` to continue a conversation; omit to start fresh. */
  prior?: ChatMessage[];
  /** Offer the ask_user tool (turn off once the follow-up cap is reached). Default true. */
  allowAskUser?: boolean;
};

/** Runs one spoken utterance through the tool-calling loop. */
export async function runAgent(
  transcript: string,
  chatFn: ChatFn,
  opts: AgentOptions = {}
): Promise<AgentResult> {
  const messages: ChatMessage[] = opts.prior
    ? [...opts.prior, { role: "user", content: transcript }]
    : [
        { role: "system", content: systemPrompt() },
        { role: "user", content: transcript },
      ];
  // Continuation turns refresh the state block (tools may have changed the app).
  if (opts.prior) messages[0] = { role: "system", content: systemPrompt() };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS - 1;
    if (lastRound) {
      messages.push({
        role: "system",
        content:
          "No more tool calls are available — reply with one short spoken sentence summarizing what you did.",
      });
    }
    const tools = lastRound
      ? []
      : [...getToolDefs(), ...(opts.allowAskUser === false ? [] : [ASK_USER])];
    const msg = await chatFn([...messages], tools);
    messages.push(msg);
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { kind: "reply", text: msg.content?.trim() || "Done!", messages };
    }

    let question: string | null = null;
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> | null = null;
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        args = null;
      }
      let result: string;
      if (args === null) {
        result = "Error: arguments were not valid JSON — call the tool again with corrected arguments.";
      } else if (tc.function.name === "ask_user") {
        question = String(args.question ?? "").trim() || null;
        result = "Asking the user now.";
      } else {
        result = await runVibeCommand(tc.function.name, args);
      }
      messages.push({ role: "tool", content: result, tool_call_id: tc.id });
    }
    if (question) return { kind: "question", text: question, messages };
  }
  // Defensive: the last round offers no tools, so this is near-unreachable;
  // salvage the most recent spoken content if the model misbehaves anyway.
  const lastText = [...messages]
    .reverse()
    .find((m): m is Extract<ChatMessage, { role: "assistant" }> => m.role === "assistant" && !!m.content)
    ?.content;
  return { kind: "reply", text: (lastText ?? "Okay, done!").trim(), messages };
}
```

(The `AssistantMessage` import is replaced by the inline `Extract<...>` usage above — keep `import type { ChatMessage } from "./groq";` and drop `AssistantMessage` if no longer referenced. If `groq.ts` still exports `AssistantMessage`, using it for `ChatFn`'s return type is equally fine: `Promise<AssistantMessage>`.)

Run: `npm test -- src/vibe/agentLoop.test.ts`
Expected: PASS.

- [ ] **Step 3: Update `src/vibe/VibeAgent.tsx`**

In `runUtterance`, replace the `runAgent` call and the question heuristic:

```tsx
      const { kind, text, messages } = await runAgent(
        transcript,
        (msgs: ChatMessage[], tools: ToolDef[]) => chat(msgs, tools, auth),
        {
          prior: conversation.current ?? undefined,
          allowAskUser: followUps.current < MAX_FOLLOW_UPS,
        }
      );

      if (sleepRequested.current) {
        showCaption(text);
        await speak(text, vibe.voice);
        fallAsleep();
        return;
      }

      const isQuestion = kind === "question";
      setState("speaking");
      if (!isQuestion) {
        setCelebrating(true);
        window.setTimeout(() => setCelebrating(false), 1200);
      }
      showCaption(text, isQuestion ? 20000 : CAPTION_MS);
      await speak(text, vibe.voice);

      if (isQuestion) {
        // Vibe asked something — keep the conversation and listen for the answer.
        conversation.current = messages;
        followUps.current += 1;
        await listenForAnswer();
      } else {
        conversation.current = null;
        followUps.current = 0;
        setState("idle");
      }
```

(Only the destructuring, the `runAgent` arguments, and `const isQuestion = kind === "question";` change — the surrounding flow is already as shown.)

Run: `npm run build`
Expected: tsc clean.

- [ ] **Step 4: Add the ask_user eval case**

Append inside the `describe` block of `src/vibe/eval.live.test.ts`:

```ts
  it("asks instead of guessing when a required detail is missing", async () => {
    const out = await runAgent("make me a new wall", liveChat);
    expect(out.kind).toBe("question");
    expect(calls.find((c) => c.name === "create_wall")).toBeUndefined();
  });
```

- [ ] **Step 5: Full verification + commit**

Run: `npm test` — Expected: PASS.
Run: `npm run vibe:eval` (with `GROQ_API_KEY` set) — Expected: ≥ the Task 2 baseline, and the new ask_user case passes.
Manual: `window.__vibeSay("make me a new wall")` in the running app — pet should ask where, then accept a spoken/typed answer.

```bash
git add src/vibe/agentLoop.ts src/vibe/agentLoop.test.ts src/vibe/VibeAgent.tsx src/vibe/eval.live.test.ts
git commit -m "feat(vibe): explicit ask_user tool, graceful 5-round cap, bad-JSON feedback"
```

### Task 5: Voice accuracy — Whisper vocabulary biasing + capture tuning

Two independent levers: (a) a `prompt` biasing field on the transcription request built from live app nouns, and (b) a smarter silence detector (min-speech gate, hard max length, ambient calibration). The proxy already forwards multipart fields untouched (it only inspects `model`), so no proxy change.

**Files:**
- Create: `src/vibe/vocab.ts`
- Create: `src/vibe/vocab.test.ts`
- Modify: `src/vibe/groq.ts` (`transcribe` prompt param)
- Modify: `src/vibe/groq.test.ts` (prompt field test)
- Modify: `src/vibe/silence.ts` (full rewrite, stays a pure function)
- Modify: `src/vibe/silence.test.ts` (full rewrite)
- Modify: `src/vibe/VibeAgent.tsx` (pass the prompt to `transcribe`)

- [ ] **Step 1: Failing test — transcribe forwards a prompt**

Add to the `transcribe (direct)` describe in `src/vibe/groq.test.ts`:

```ts
  it("forwards a biasing prompt when given one", async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ text: "hi" }));
    vi.stubGlobal("fetch", fetchMock);
    await transcribe(new Blob(["x"]), direct, "open terminal, design wall");
    expect((fetchMock.mock.calls[0][1].body as FormData).get("prompt")).toBe("open terminal, design wall");
  });

  it("omits the prompt field when not given one", async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ text: "hi" }));
    vi.stubGlobal("fetch", fetchMock);
    await transcribe(new Blob(["x"]), direct);
    expect((fetchMock.mock.calls[0][1].body as FormData).get("prompt")).toBeNull();
  });
```

Run: `npm test -- src/vibe/groq.test.ts` — Expected: first new test FAILS.

- [ ] **Step 2: Implement in `src/vibe/groq.ts`**

```ts
export async function transcribe(wav: Blob, auth: GroqAuth, prompt?: string): Promise<string> {
  const form = new FormData();
  form.append("file", wav, "utterance.wav");
  form.append("model", STT_MODEL);
  if (prompt) form.append("prompt", prompt); // Whisper vocabulary biasing
  const json = (await post("/audio/transcriptions", "/transcribe", auth, {
    method: "POST",
    body: form,
  })) as { text?: string };
  return (json.text ?? "").trim();
}
```

Run: `npm test -- src/vibe/groq.test.ts` — Expected: PASS.

- [ ] **Step 3: Failing tests — the vocabulary builder**

Create `src/vibe/vocab.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { buildSttPrompt, MAX_PROMPT_CHARS } from "./vocab";
import { registerVibeCommand, _clearRegistryForTests } from "./commands";
import { registerVibeContext, _clearContextForTests } from "./context";

beforeEach(() => {
  _clearRegistryForTests();
  _clearContextForTests();
});

describe("buildSttPrompt", () => {
  it("turns command names into natural phrases", () => {
    registerVibeCommand({ name: "open_terminal", description: "d", run: () => "" });
    registerVibeCommand({ name: "go_to_start_page", description: "d", run: () => "" });
    expect(buildSttPrompt()).toBe("open terminal, go to start page");
  });

  it("appends live context nouns after the command phrases", () => {
    registerVibeCommand({ name: "open_wall", description: "d", run: () => "" });
    registerVibeContext("app", () => "existing walls: design, scratchpad");
    expect(buildSttPrompt()).toBe("open wall. app: existing walls: design, scratchpad");
  });

  it("keeps the END when truncating (Whisper weighs final tokens most)", () => {
    registerVibeContext("app", () => "x".repeat(300) + " THE-END");
    const out = buildSttPrompt();
    expect(out.length).toBe(MAX_PROMPT_CHARS);
    expect(out.endsWith("THE-END")).toBe(true);
  });

  it("returns an empty string when nothing is registered", () => {
    expect(buildSttPrompt()).toBe("");
  });
});
```

Run: `npm test -- src/vibe/vocab.test.ts` — Expected: FAIL, module missing.

- [ ] **Step 4: Implement `src/vibe/vocab.ts`**

```ts
import { getToolDefs } from "./commands";
import { getContextBlock } from "./context";

export const MAX_PROMPT_CHARS = 200;

/**
 * Whisper biasing text built from live app nouns: command names (underscores →
 * spaces) plus the context registry's snapshot lines. Whisper weighs the FINAL
 * tokens most, so truncation keeps the end (the live names).
 */
export function buildSttPrompt(): string {
  const phrases = getToolDefs().map((t) => t.function.name.replace(/_/g, " "));
  const ctx = getContextBlock().replace(/^- /gm, "").replace(/\n/g, "; ");
  const full = [phrases.join(", "), ctx].filter(Boolean).join(". ");
  return full.length > MAX_PROMPT_CHARS ? full.slice(-MAX_PROMPT_CHARS) : full;
}
```

Run: `npm test -- src/vibe/vocab.test.ts` — Expected: PASS.

- [ ] **Step 5: Wire it into `src/vibe/VibeAgent.tsx`**

Import `buildSttPrompt` from `./vocab` and change one line in `captureTranscript`:

```tsx
    const transcript = await transcribe(wav, auth, buildSttPrompt());
```

- [ ] **Step 6: Rewrite the silence detector tests**

Replace `src/vibe/silence.test.ts` entirely. Existing behaviors are re-asserted with `calibrationMs: 0` (so they test endpointing in isolation); new behaviors get their own cases.

```ts
import { describe, it, expect } from "vitest";
import { createSilenceDetector, FRAME_MS } from "./silence";

// 512 samples @ 16kHz = 32ms per frame (WebVoiceProcessor's frame size).
const FRAME_LEN = 512;
const frame = (fill: number) => new Int16Array(FRAME_LEN).fill(fill);
const loud = () => frame(8000);   // RMS ≈ 0.24
const noise = () => frame(1638);  // RMS ≈ 0.05
const quiet = () => frame(50);    // RMS ≈ 0.0015

function feed(d: ReturnType<typeof createSilenceDetector>, f: () => Int16Array, ms: number) {
  let last: "speaking" | "waiting" | "stop" = "waiting";
  for (let t = 0; t < ms; t += FRAME_MS) last = d.push(f());
  return last;
}

// calibrationMs: 0 disables ambient calibration so endpointing is tested alone.
const plain = (opts = {}) => createSilenceDetector({ calibrationMs: 0, ...opts });

describe("endpointing", () => {
  it("does not stop during initial silence (still waiting for speech)", () => {
    expect(feed(plain(), quiet, 5000)).toBe("waiting");
  });

  it("stops after 1.2s of silence following real speech", () => {
    const d = plain();
    feed(d, loud, 500);
    expect(feed(d, quiet, 1100)).toBe("speaking"); // not yet
    expect(feed(d, quiet, 200)).toBe("stop");      // crosses 1200ms
  });

  it("speech resets the silence timer", () => {
    const d = plain();
    feed(d, loud, 500);
    feed(d, quiet, 1000);
    feed(d, loud, 100);                            // resumes speaking
    expect(feed(d, quiet, 1100)).toBe("speaking"); // timer restarted
  });

  it("respects a custom threshold floor", () => {
    const d = plain({ thresholdRms: 0.5 });        // loud() is below this
    expect(feed(d, loud, 3000)).toBe("waiting");   // never counts as speech
  });
});

describe("min-speech gate", () => {
  it("a sub-300ms blip does not arm the endpoint", () => {
    const d = plain();
    feed(d, loud, 100);                            // cough / click
    expect(feed(d, quiet, 3000)).toBe("waiting");  // silence cannot stop capture yet
  });

  it("cumulative speech across pauses arms the endpoint", () => {
    const d = plain();
    feed(d, loud, 200);
    feed(d, quiet, 500);
    feed(d, loud, 200);                            // total speech 400ms ≥ 300ms
    expect(feed(d, quiet, 1300)).toBe("stop");
  });
});

describe("max utterance length", () => {
  it("stops at the hard cap even with continuous speech", () => {
    const d = plain();
    expect(feed(d, loud, 15100)).toBe("stop");
  });

  it("stops at the hard cap even if the user never spoke", () => {
    const d = plain();
    expect(feed(d, quiet, 15100)).toBe("stop");
  });
});

describe("ambient calibration", () => {
  it("raises the threshold above steady background noise", () => {
    const d = createSilenceDetector();             // calibration on (300ms)
    feed(d, noise, 300);                           // ambient ≈ 0.05 → threshold 0.1 (clamped)
    expect(feed(d, noise, 3000)).toBe("waiting");  // noise alone is not speech
    feed(d, loud, 400);                            // real speech clears the raised bar
    expect(feed(d, quiet, 1300)).toBe("stop");
  });

  it("keeps the floor in a quiet room", () => {
    const d = createSilenceDetector();
    feed(d, quiet, 300);                           // ambient ≈ 0 → threshold stays at floor
    feed(d, loud, 400);
    expect(feed(d, quiet, 1300)).toBe("stop");
  });
});
```

Run: `npm test -- src/vibe/silence.test.ts` — Expected: new cases FAIL.

- [ ] **Step 7: Rewrite `src/vibe/silence.ts`**

```ts
/** WebVoiceProcessor delivers 512-sample frames at 16kHz = 32ms. */
export const FRAME_MS = 32;

export type SilenceDetectorOptions = {
  /** Normalized RMS (0..1) floor above which a frame counts as speech. Calibration can only raise it. */
  thresholdRms?: number;
  /** Silence duration after speech that ends the utterance. */
  silenceMs?: number;
  /** Cumulative speech required before silence may end the capture (a cough can't arm the endpoint). */
  minSpeechMs?: number;
  /** Hard cap on total capture length. */
  maxUtteranceMs?: number;
  /** Opening window sampled as ambient noise to calibrate the threshold; 0 disables. */
  calibrationMs?: number;
};

export type SilenceState = "waiting" | "speaking" | "stop";

/**
 * Stateful endpoint detector. Feed every mic frame; returns:
 *  - "waiting":  no (or not enough) speech heard yet — silence never ends capture
 *  - "speaking": speech heard, utterance ongoing
 *  - "stop":     >= silenceMs of quiet after real speech, or the hard time cap
 */
export function createSilenceDetector(opts: SilenceDetectorOptions = {}) {
  const floor = opts.thresholdRms ?? 0.01;
  const silenceMs = opts.silenceMs ?? 1200;
  const minSpeechMs = opts.minSpeechMs ?? 300;
  const maxUtteranceMs = opts.maxUtteranceMs ?? 15000;
  const calibrationMs = opts.calibrationMs ?? 300;

  let threshold = floor;
  let calibratedMs = 0;
  let ambientSum = 0;
  let speechMs = 0;
  let quietMs = 0;
  let totalMs = 0;

  return {
    push(frame: Int16Array): SilenceState {
      let sum = 0;
      for (let i = 0; i < frame.length; i++) {
        const s = frame[i] / 32768;
        sum += s * s;
      }
      const rms = Math.sqrt(sum / frame.length);

      totalMs += FRAME_MS;
      if (totalMs >= maxUtteranceMs) return "stop";

      // Calibration: the opening window is ambient noise; raise the threshold
      // above it (clamped so loud ambience can't make speech undetectable, and
      // never below the configured floor).
      if (calibratedMs < calibrationMs) {
        calibratedMs += FRAME_MS;
        ambientSum += rms;
        if (calibratedMs >= calibrationMs) {
          const ambient = ambientSum / (calibrationMs / FRAME_MS);
          threshold = Math.max(floor, Math.min(ambient * 2.5, 0.1));
        }
        return "waiting";
      }

      if (rms >= threshold) {
        speechMs += FRAME_MS;
        quietMs = 0;
        return "speaking";
      }
      if (speechMs < minSpeechMs) return "waiting"; // blips don't arm the endpoint
      quietMs += FRAME_MS;
      return quietMs >= silenceMs ? "stop" : "speaking";
    },
  };
}
```

`src/vibe/useVoicePipeline.ts` needs **no change**: `createSilenceDetector()` with defaults now includes the cap and calibration, and the pipeline's own `MAX_UTTERANCE_MS` timeout remains a harmless backstop (it also covers the case where frames stop arriving entirely).

Run: `npm test -- src/vibe/silence.test.ts` — Expected: PASS.

- [ ] **Step 8: Full verification + commit**

Run: `npm test` — Expected: all PASS.
Run: `npm run build` — Expected: tsc clean.
Manual: in the running app, say "Vibe" then pause two seconds before speaking — the pet should keep listening instead of replying "I didn't catch that."

```bash
git add src/vibe/vocab.ts src/vibe/vocab.test.ts src/vibe/groq.ts src/vibe/groq.test.ts src/vibe/silence.ts src/vibe/silence.test.ts src/vibe/VibeAgent.tsx
git commit -m "feat(vibe): whisper vocabulary biasing + smarter capture endpointing"
```

### Task 6: Full verification

**Files:** none created — verification only.

- [ ] **Step 1: Unit suite + typecheck**

Run: `npm test` and `npm run build`
Expected: all suites PASS, tsc clean.

- [ ] **Step 2: Live eval**

PowerShell: `$env:GROQ_API_KEY = "<your key>"; npm run vibe:eval`
Expected: ≥ the Task 2 baseline; the ask_user case passes. If a case regressed, fix tool descriptions / system prompt wording, not the eval.

- [ ] **Step 3: Manual end-to-end pass (`npm run tauri dev`)**

Using the mic (or `window.__vibeSay(...)` where noted):

1. Say "Vibe", pause ~2s, then "open a terminal" → pet keeps listening through the pause, opens a terminal, confirms aloud.
2. On a wall: "which wall am I on?" → answer names the actual wall (context registry).
3. "make me a new wall" → pet ASKS where (ask_user); answer "use the picker" → native picker opens.
4. `window.__vibeSay("open the design wall and give me a claude terminal")` → both actions happen, single spoken confirmation.
5. Without your own Groq key in Settings (proxy mode): any command works → proves the redeployed proxy accepts `openai/gpt-oss-120b`.
6. "go to sleep" → pet sleeps; hotkey wakes it.

Expected: every step behaves as described; any failure goes through superpowers:systematic-debugging before patching.

- [ ] **Step 4: Final commit (if any fixups were needed)**

```bash
git add -A && git commit -m "fix(vibe): harness hardening fixups from end-to-end verification"
```
