/**
 * Shaping a terminal's raw buffer text into something Vibe can answer from.
 *
 * Two audiences share one tool: a plain shell's tail is short and literal, an
 * agent's is a redrawn TUI — hundreds of near-identical frames whose only
 * useful content is the last one. Reading either aloud verbatim is wrong
 * unless the user actually asked for the exact text, so the result carries the
 * instruction along with the text.
 */

/** Lines of tail read for a normal "what did it say?" question. */
export const TAIL_LINES = 60;
/** Lines read when the user asked for the exact output. */
export const FULL_LINES = 200;

export function readLineCount(full: boolean): number {
  return full ? FULL_LINES : TAIL_LINES;
}

/**
 * An xterm buffer read is padded with blank rows and trailing spaces (every
 * line is `cols` wide). Strip that so the model sees content, not layout.
 */
export function cleanOutput(raw: string): string {
  return raw
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    // Blank rows only — a plain trim() would also eat the first line's indent.
    .replace(/^\n+|\n+$/g, "");
}

export type TerminalRead = {
  /** Agent name on the card, e.g. "Max". */
  name: string;
  /** Preset label, e.g. "Claude Code" / "Plain shell". */
  presetLabel: string;
  /** True for a preset that launches an agent (anything but a plain shell). */
  isAgent: boolean;
  /** The user explicitly asked for the exact output. */
  full: boolean;
  /** Already-cleaned buffer text. */
  text: string;
};

/**
 * The tool result string. The trailing instruction is the whole point of the
 * feature: without it the model reads an agent's TUI back line by line.
 */
export function formatTerminalRead(r: TerminalRead): string {
  if (!r.text) return `${r.name}'s terminal (${r.presetLabel}) has no output yet.`;
  const how = r.full
    ? "The user asked for the exact output — read it back as-is."
    : r.isAgent
    ? "This is an agent's terminal. Tell the user the gist in one or two spoken sentences — what it did, where it got to, anything it is waiting on. Do NOT read it line by line unless they ask for the exact output."
    : "Answer the user's question from this in one short spoken sentence.";
  return `${r.name}'s terminal (${r.presetLabel}) shows:\n${r.text}\n\n${how}`;
}
