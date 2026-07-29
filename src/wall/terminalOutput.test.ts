import { describe, expect, it } from "vitest";
import {
  FULL_LINES, TAIL_LINES, cleanOutput, formatTerminalRead, readLineCount,
} from "./terminalOutput";

describe("cleanOutput", () => {
  it("drops the padding an xterm buffer read carries", () => {
    const raw = "npm test    \n   \n\n\n  ok (12)   \n\n\n";
    expect(cleanOutput(raw)).toBe("npm test\n\n  ok (12)");
  });

  it("keeps a single blank line as a paragraph break", () => {
    expect(cleanOutput("a\n\nb")).toBe("a\n\nb");
  });

  it("is empty for a buffer that only holds blank rows", () => {
    expect(cleanOutput("   \n\n     \n")).toBe("");
  });

  it("leaves interior indentation alone", () => {
    expect(cleanOutput("  indented  ")).toBe("  indented");
  });
});

describe("readLineCount", () => {
  it("reads a short tail normally and a long one when asked for the exact output", () => {
    expect(readLineCount(false)).toBe(TAIL_LINES);
    expect(readLineCount(true)).toBe(FULL_LINES);
    expect(FULL_LINES).toBeGreaterThan(TAIL_LINES);
  });
});

describe("formatTerminalRead", () => {
  const base = { name: "Max", presetLabel: "Claude Code", isAgent: true, full: false, text: "done" };

  it("tells the model to summarize an agent's terminal", () => {
    const out = formatTerminalRead(base);
    expect(out).toContain("Max's terminal (Claude Code) shows:\ndone");
    expect(out).toMatch(/gist in one or two spoken sentences/);
    expect(out).toMatch(/Do NOT read it line by line/);
  });

  it("reads back verbatim when the user asked for the exact output", () => {
    const out = formatTerminalRead({ ...base, full: true });
    expect(out).toMatch(/read it back as-is/);
    expect(out).not.toMatch(/Do NOT read it line by line/);
  });

  it("does not ask for a summary of a plain shell's tail", () => {
    const out = formatTerminalRead({ ...base, presetLabel: "Plain shell", isAgent: false });
    expect(out).toMatch(/one short spoken sentence/);
    expect(out).not.toMatch(/gist/);
  });

  it("reports an empty buffer instead of an empty quote", () => {
    expect(formatTerminalRead({ ...base, text: "" })).toBe(
      "Max's terminal (Claude Code) has no output yet."
    );
  });
});
