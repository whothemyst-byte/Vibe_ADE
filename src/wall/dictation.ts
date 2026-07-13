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
