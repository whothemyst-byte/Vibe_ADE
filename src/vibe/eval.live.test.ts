import { describe, it, expect, beforeEach } from "vitest";
import { runAgent } from "./agentLoop";
import { registerVibeCommand, _clearRegistryForTests, type ToolDef } from "./commands";
import { chat, type ChatMessage } from "./groq";

// This file runs under Node (vitest), but the project tsconfig is webview/DOM-only.
declare const process: { env: Record<string, string | undefined> };

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

  stub("go_to_start_page", "Navigate to the start page (the space picker).");
  stub("open_task_board", "Open the task board view.");
  stub("open_space", "Open a space (canvas workspace) by its name.", {
    type: "object",
    properties: { name: { type: "string", description: "Space name, e.g. 'design'" } },
    required: ["name"],
  });
  stub("create_space", "Create a NEW space in a folder and open it. If the user did not say where, ask where to create it.", {
    type: "object",
    properties: {
      location: { type: "string", description: "Absolute folder path, or 'picker' for the native picker" },
      name: { type: "string", description: "Optional space name" },
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

  it("opens a space by name", async () => {
    await runAgent("open the design space", liveChat);
    const c = calls.find((c) => c.name === "open_space");
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

  it("creates a space at an explicit path", async () => {
    await runAgent("create a space called demo in C:\\Users\\admin\\Projects", liveChat);
    const c = calls.find((c) => c.name === "create_space");
    expect(String(c?.args.location ?? "")).toMatch(/projects/i);
  });

  it("chains two commands in one utterance", async () => {
    await runAgent("open the design space and give me a terminal", liveChat);
    const names = calls.map((c) => c.name);
    expect(names).toContain("open_space");
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

  it("asks instead of guessing when a required detail is missing", async () => {
    const out = await runAgent("make me a new space", liveChat);
    expect(out.kind).toBe("question");
    expect(calls.find((c) => c.name === "create_space")).toBeUndefined();
  });
});
