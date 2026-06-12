import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAgent } from "./agentLoop";
import type { ToolDef } from "./commands";
import { registerVibeCommand, _clearRegistryForTests } from "./commands";
import { registerVibeContext, _clearContextForTests } from "./context";
import type { AssistantMessage, ChatMessage, ToolCall } from "./groq";

const toolCall = (name: string, args: object, id = "c1"): ToolCall => ({
  id, type: "function", function: { name, arguments: JSON.stringify(args) },
});
const say = (content: string): AssistantMessage => ({ role: "assistant", content });
const call = (...tcs: ToolCall[]): AssistantMessage => ({
  role: "assistant", content: null, tool_calls: tcs,
});

beforeEach(() => {
  _clearRegistryForTests();
  _clearContextForTests();
});

describe("runAgent", () => {
  it("returns plain text when the model calls no tools", async () => {
    const chat = vi.fn().mockResolvedValue(say("I can open terminals and more."));
    expect((await runAgent("what can you do", chat)).text).toBe("I can open terminals and more.");
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
    expect((await runAgent("open a claude terminal", chat)).text).toBe("Opened a Claude terminal for you!");
    expect(run).toHaveBeenCalledWith({ preset: "claude" });
    const secondMessages: ChatMessage[] = chat.mock.calls[1][0];
    const toolMsg = secondMessages.find((m) => m.role === "tool");
    expect(toolMsg).toMatchObject({ content: "terminal Ada opened", tool_call_id: "c1" });
  });

  it("caps tool rounds: 4 with tools, then a final no-tools summary call", async () => {
    registerVibeCommand({ name: "noop", description: "d", run: () => "ok" });
    const chat = vi.fn().mockImplementation((_msgs: ChatMessage[], tools: ToolDef[]) =>
      Promise.resolve(tools.length > 0 ? call(toolCall("noop", {})) : say("I did a few things!"))
    );
    const out = await runAgent("loop forever", chat);
    expect(chat).toHaveBeenCalledTimes(5);
    expect(chat.mock.calls[4][1]).toEqual([]); // final round offers no tools
    const finalMessages: ChatMessage[] = chat.mock.calls[4][0];
    expect(finalMessages[finalMessages.length - 1]?.content).toMatch(/no more tool calls/i);
    expect(out).toMatchObject({ kind: "reply", text: "I did a few things!" });
  });

  it("feeds unknown-command errors back to the model instead of crashing", async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(call(toolCall("does_not_exist", {})))
      .mockResolvedValueOnce(say("Sorry, I can't do that here."));
    expect((await runAgent("do magic", chat)).text).toBe("Sorry, I can't do that here.");
    const secondMessages: ChatMessage[] = chat.mock.calls[1][0];
    const toolMsg = secondMessages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toMatch(/no command named/i);
  });

  it("returns the running message log so a conversation can continue", async () => {
    const chat = vi.fn().mockResolvedValue(say("Where should I open the wall?"));
    const out = await runAgent("open a new wall", chat);
    expect(out.text).toBe("Where should I open the wall?");
    // log = system + user + assistant
    expect(out.messages.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
  });

  it("continues a prior conversation when given previous messages", async () => {
    const first = vi.fn().mockResolvedValue(say("Where should I open the wall?"));
    const prior = (await runAgent("open a new wall", first)).messages;

    const second = vi.fn().mockResolvedValue(say("Opening it in D:/projects."));
    const out = await runAgent("in my projects folder on d drive", second, { prior });
    expect(out.text).toBe("Opening it in D:/projects.");
    const sent: ChatMessage[] = second.mock.calls[0][0];
    // full history: system, user, assistant question, follow-up user answer
    expect(sent.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(sent[3]).toEqual({ role: "user", content: "in my projects folder on d drive" });
  });

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
    await runAgent("the design one", second, { prior });
    const system: ChatMessage = second.mock.calls[0][0][0];
    expect(system.content).toContain('wall "design"');
  });

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
    expect(out.messages[out.messages.length - 1]).toMatchObject({ role: "tool", tool_call_id: "c1" });
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
});
