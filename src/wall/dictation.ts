import { isWorking, type Activity } from "./agentStatus";

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
