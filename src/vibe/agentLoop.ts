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
