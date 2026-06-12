import { getToolDefs, runVibeCommand, type ToolDef } from "./commands";
import { getContextBlock } from "./context";
import type { AssistantMessage, ChatMessage } from "./groq";

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
) => Promise<AssistantMessage>;

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
    .find((m): m is AssistantMessage => m.role === "assistant" && !!m.content)
    ?.content;
  return { kind: "reply", text: (lastText ?? "Okay, done!").trim(), messages };
}
