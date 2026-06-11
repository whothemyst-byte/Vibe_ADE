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
