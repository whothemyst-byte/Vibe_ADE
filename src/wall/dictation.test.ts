import { describe, it, expect } from "vitest";
import { resolveAgent, routeVerbatim, type AgentRef } from "./dictation";

const agents: AgentRef[] = [
  { id: "t1", name: "Max" },
  { id: "t2", name: "Ruby" },
];

describe("resolveAgent", () => {
  it("matches case-insensitively", () => {
    expect(resolveAgent(agents, "max")?.id).toBe("t1");
  });
  it("returns null on miss", () => {
    expect(resolveAgent(agents, "Chase")).toBeNull();
  });
});

describe("routeVerbatim", () => {
  it("routes 'ask <name> to …' stripping the directive", () => {
    const r = routeVerbatim("ask Max to run the tests", agents);
    expect(r).toEqual({ agent: agents[0], prompt: "run the tests" });
  });
  it("routes 'tell <name> …' without 'to'", () => {
    const r = routeVerbatim("tell ruby fix the build", agents);
    expect(r).toEqual({ agent: agents[1], prompt: "fix the build" });
  });
  it("routes leading vocative '<name>, …'", () => {
    const r = routeVerbatim("Max, deploy the site", agents);
    expect(r).toEqual({ agent: agents[0], prompt: "deploy the site" });
  });
  it("returns null for unknown names (falls through to LLM)", () => {
    expect(routeVerbatim("ask Chase to run tests", agents)).toBeNull();
  });
  it("returns null for plain UI commands", () => {
    expect(routeVerbatim("open the task board", agents)).toBeNull();
  });
  it("returns null when the remaining prompt is empty", () => {
    expect(routeVerbatim("ask Max", agents)).toBeNull();
  });
  it("ignores punctuation after the name", () => {
    const r = routeVerbatim("ask Max, to run the tests", agents);
    expect(r).toEqual({ agent: agents[0], prompt: "run the tests" });
  });
});
