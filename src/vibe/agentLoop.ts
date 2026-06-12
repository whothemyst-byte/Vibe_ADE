import { getToolDefs, runVibeCommand, type ToolDef } from "./commands";
import { getContextBlock } from "./context";
import type { AssistantMessage, ChatMessage } from "./groq";

export const MAX_TOOL_ROUNDS = 3;

const SYSTEM_PROMPT = `You are Vibe, a small friendly ghost who lives inside the
vibe-walls app and controls it for the user by voice. The user just spoke one
request. Use the provided tools to carry it out, then confirm what you did in
ONE short, casual sentence (it will be read aloud). If a command needs
information the user didn't give (like a name or location), do NOT guess —
reply with ONE short question ending in "?" and the user's spoken answer will
arrive as the next message. If no tool fits, answer conversationally and
briefly. If asked what you can do, summarize your current tools in plain
words. Never invent tools, never output code or markdown.`;

function systemPrompt(): string {
  const ctx = getContextBlock();
  return ctx ? `${SYSTEM_PROMPT}\n\nCurrent app state:\n${ctx}` : SYSTEM_PROMPT;
}

export type ChatFn = (
  messages: ChatMessage[],
  tools: ToolDef[]
) => Promise<AssistantMessage>;

export type AgentResult = {
  /** Text to speak. */
  text: string;
  /** Full message log including this turn — pass back in to continue the conversation. */
  messages: ChatMessage[];
};

/**
 * Runs one spoken utterance through the tool-calling loop. Pass the previous
 * result's `messages` as `prior` to continue a conversation (e.g. answering a
 * question the agent asked); omit it to start fresh.
 */
export async function runAgent(
  transcript: string,
  chatFn: ChatFn,
  prior?: ChatMessage[]
): Promise<AgentResult> {
  const messages: ChatMessage[] = prior
    ? [...prior, { role: "user", content: transcript }]
    : [
        { role: "system", content: systemPrompt() },
        { role: "user", content: transcript },
      ];
  // Continuation turns refresh the state block (tools may have changed the app).
  if (prior) messages[0] = { role: "system", content: systemPrompt() };
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const msg = await chatFn([...messages], getToolDefs());
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      messages.push(msg);
      return { text: msg.content?.trim() || "Done!", messages };
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
  return { text: "Okay, done!", messages };
}
