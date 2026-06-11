import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAgent } from "./agentLoop";
import { registerVibeCommand, _clearRegistryForTests } from "./commands";
import type { AssistantMessage, ChatMessage, ToolCall } from "./groq";

const toolCall = (name: string, args: object, id = "c1"): ToolCall => ({
  id, type: "function", function: { name, arguments: JSON.stringify(args) },
});
const say = (content: string): AssistantMessage => ({ role: "assistant", content });
const call = (...tcs: ToolCall[]): AssistantMessage => ({
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
