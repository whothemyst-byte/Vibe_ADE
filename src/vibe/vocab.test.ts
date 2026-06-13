import { describe, it, expect, beforeEach } from "vitest";
import { buildSttPrompt, MAX_PROMPT_CHARS } from "./vocab";
import { registerVibeCommand, _clearRegistryForTests } from "./commands";
import { registerVibeContext, _clearContextForTests } from "./context";

beforeEach(() => {
  _clearRegistryForTests();
  _clearContextForTests();
});

describe("buildSttPrompt", () => {
  it("turns command names into natural phrases", () => {
    registerVibeCommand({ name: "open_terminal", description: "d", run: () => "" });
    registerVibeCommand({ name: "go_to_start_page", description: "d", run: () => "" });
    expect(buildSttPrompt()).toBe("open terminal, go to start page");
  });

  it("appends live context nouns after the command phrases", () => {
    registerVibeCommand({ name: "open_space", description: "d", run: () => "" });
    registerVibeContext("app", () => "existing spaces: design, scratchpad");
    expect(buildSttPrompt()).toBe("open space. app: existing spaces: design, scratchpad");
  });

  it("keeps the END when truncating (Whisper weighs final tokens most)", () => {
    registerVibeContext("app", () => "x".repeat(300) + " THE-END");
    const out = buildSttPrompt();
    expect(out.length).toBe(MAX_PROMPT_CHARS);
    expect(out.endsWith("THE-END")).toBe(true);
  });

  it("returns an empty string when nothing is registered", () => {
    expect(buildSttPrompt()).toBe("");
  });
});
