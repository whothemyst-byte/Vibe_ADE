import { describe, it, expect, beforeEach } from "vitest";
import { registerVibeContext, getContextBlock, _clearContextForTests } from "./context";

beforeEach(() => _clearContextForTests());

describe("context registry", () => {
  it("returns an empty string when nothing is registered", () => {
    expect(getContextBlock()).toBe("");
  });

  it("joins providers one line each, in registration order", () => {
    registerVibeContext("app", () => "view: start page");
    registerVibeContext("tasks", () => "Backlog: fix bug");
    expect(getContextBlock()).toBe("- app: view: start page\n- tasks: Backlog: fix bug");
  });

  it("cleanup removes only the current provider for that name", () => {
    const cleanupOld = registerVibeContext("app", () => "old");
    registerVibeContext("app", () => "new");
    cleanupOld(); // stale cleanup (StrictMode double-mount) must not remove the replacement
    expect(getContextBlock()).toBe("- app: new");
  });

  it("skips empty snapshots and survives throwing ones", () => {
    registerVibeContext("empty", () => "  ");
    registerVibeContext("boom", () => { throw new Error("broken"); });
    registerVibeContext("ok", () => "fine");
    expect(getContextBlock()).toBe("- ok: fine");
  });
});
