import { describe, expect, it } from "vitest";
import { AGENT_NAMES, pickAgentName } from "./agentNames";

describe("pickAgentName", () => {
  it("returns a name from the curated list", () => {
    expect(AGENT_NAMES).toContain(pickAgentName([], () => 0));
  });

  it("never returns a taken name while free names remain", () => {
    const taken = AGENT_NAMES.slice(0, AGENT_NAMES.length - 1);
    expect(pickAgentName(taken, () => 0.99)).toBe(AGENT_NAMES[AGENT_NAMES.length - 1]);
  });

  it("suffixes a counter when every base name is taken", () => {
    const taken = [...AGENT_NAMES];
    expect(pickAgentName(taken, () => 0)).toBe(`${AGENT_NAMES[0]} 2`);
  });

  it("skips suffixed names that are also taken", () => {
    const taken = [...AGENT_NAMES, `${AGENT_NAMES[0]} 2`];
    expect(pickAgentName(taken, () => 0)).toBe(`${AGENT_NAMES[0]} 3`);
  });
});
