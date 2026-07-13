import { describe, it, expect } from "vitest";
import {
  resolveAgent,
  routeVerbatim,
  updatePending,
  PING_TIMEOUT_MS,
  type AgentRef,
  type PendingPing,
} from "./dictation";
import { newActivity, recordOutput, type Activity } from "./agentStatus";

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

describe("updatePending", () => {
  const pending = (over: Partial<PendingPing> = {}): PendingPing => ({
    id: "t1", name: "Max", sentAt: 1000, sawOutput: false, ...over,
  });

  it("marks sawOutput once the agent produces output after sentAt", () => {
    const a: Activity = recordOutput(newActivity(), 2000);
    const r = updatePending(pending(), a, 2100);
    expect(r).toEqual({ next: pending({ sawOutput: true }), ping: false });
  });

  it("pings once the agent goes idle after having worked", () => {
    const a: Activity = recordOutput(newActivity(), 2000); // last output at 2000
    const r = updatePending(pending({ sawOutput: true }), a, 2000 + 3000); // > IDLE_AFTER_MS
    expect(r).toEqual({ next: null, ping: true });
  });

  it("keeps waiting while the agent is still working", () => {
    const a: Activity = recordOutput(newActivity(), 5000);
    const r = updatePending(pending({ sawOutput: true }), a, 5100); // within idle window
    expect(r).toEqual({ next: pending({ sawOutput: true }), ping: false });
  });

  it("expires silently when no output ever arrives", () => {
    const a: Activity = newActivity();
    const r = updatePending(pending(), a, 1000 + PING_TIMEOUT_MS + 1);
    expect(r).toEqual({ next: null, ping: false });
  });

  it("ignores output that predates the prompt", () => {
    const a: Activity = recordOutput(newActivity(), 500); // before sentAt
    const r = updatePending(pending(), a, 1200);
    expect(r).toEqual({ next: pending(), ping: false });
  });
});
