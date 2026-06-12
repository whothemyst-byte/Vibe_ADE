import type { ToolDef } from "./commands";

const BASE = "https://api.groq.com/openai/v1";
/** Public Supabase project URL (not a secret; auth lives server-side in the function). */
const PROXY_BASE = "https://cvithwrsgmtdajaddsab.supabase.co/functions/v1/groq-proxy";
export const STT_MODEL = "whisper-large-v3-turbo";
export const CHAT_MODEL = "llama-3.3-70b-versatile";

/** Direct = user's own Groq key. Proxy = bundled access via our edge function. */
export type GroqAuth =
  | { kind: "direct"; key: string }
  | { kind: "proxy"; deviceId: string };

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

function describeHttp(status: number, auth: GroqAuth): GroqError {
  if (status === 401) return new GroqError("I need a valid Groq API key — check Settings.", status);
  if (status === 429) {
    return auth.kind === "proxy"
      ? new GroqError(
          "I've used up today's free allowance — add your own free Groq key in Settings for unlimited use.",
          status
        )
      : new GroqError("My brain is rate-limited — try again in a moment.", status);
  }
  return new GroqError(`Groq request failed (HTTP ${status}).`, status);
}

async function post(
  directPath: string,
  proxyPath: string,
  auth: GroqAuth,
  init: RequestInit
): Promise<unknown> {
  const url = auth.kind === "direct" ? `${BASE}${directPath}` : `${PROXY_BASE}${proxyPath}`;
  const authHeaders: Record<string, string> =
    auth.kind === "direct"
      ? { Authorization: `Bearer ${auth.key}` }
      : { "x-device-id": auth.deviceId };
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...authHeaders, ...(init.headers ?? {}) } });
  } catch {
    throw new GroqError("I couldn't reach my brain — are you online?");
  }
  if (!res.ok) throw describeHttp(res.status, auth);
  return res.json();
}

export async function transcribe(wav: Blob, auth: GroqAuth): Promise<string> {
  const form = new FormData();
  form.append("file", wav, "utterance.wav");
  form.append("model", STT_MODEL);
  const json = (await post("/audio/transcriptions", "/transcribe", auth, {
    method: "POST",
    body: form,
  })) as { text?: string };
  return (json.text ?? "").trim();
}

export async function chat(
  messages: ChatMessage[],
  tools: ToolDef[],
  auth: GroqAuth
): Promise<AssistantMessage> {
  const json = (await post("/chat/completions", "/chat", auth, {
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
