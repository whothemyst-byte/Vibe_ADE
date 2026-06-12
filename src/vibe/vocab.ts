import { getToolDefs } from "./commands";
import { getContextBlock } from "./context";

export const MAX_PROMPT_CHARS = 200;

/**
 * Whisper biasing text built from live app nouns: command names (underscores →
 * spaces) plus the context registry's snapshot lines. Whisper weighs the FINAL
 * tokens most, so truncation keeps the end (the live names).
 */
export function buildSttPrompt(): string {
  const phrases = getToolDefs().map((t) => t.function.name.replace(/_/g, " "));
  const ctx = getContextBlock().replace(/^- /gm, "").replace(/\n/g, "; ");
  const full = [phrases.join(", "), ctx].filter(Boolean).join(". ");
  return full.length > MAX_PROMPT_CHARS ? full.slice(-MAX_PROMPT_CHARS) : full;
}
