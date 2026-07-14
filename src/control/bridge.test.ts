import { describe, expect, it, vi } from "vitest";
import { handleControlRequest, type ControlDeps, type StatePayload } from "./bridge";

const SNAPSHOT: StatePayload = {
  wall: "open terminals: Ada (Claude Code); theme: Night",
  terminals: [{ id: "t1", name: "Ada", preset: "Claude Code" }],
  browser: null,
};

function deps(over: Partial<ControlDeps> = {}): ControlDeps {
  return {
    wallOpen: () => true,
    stateSnapshot: () => SNAPSHOT,
    openBrowser: vi.fn(async (url: string) => `Opened the browser at ${url}.`),
    openTerminal: vi.fn(async () => "Opened a Plain shell terminal named Rex."),
    ...over,
  };
}

describe("handleControlRequest", () => {
  it("state returns the snapshot", async () => {
    expect(await handleControlRequest("state", {}, deps())).toEqual({ ok: true, body: SNAPSHOT });
  });

  it("browser rejects non-http(s) and missing urls without side effects", async () => {
    const d = deps();
    for (const args of [{ url: "file:///C:/x" }, { url: "javascript:alert(1)" }, {}]) {
      const r = await handleControlRequest("browser", args, d);
      expect(r).toEqual({ ok: true, body: { error: "only http(s) urls" } });
    }
    expect(d.openBrowser).not.toHaveBeenCalled();
  });

  it("browser opens valid urls", async () => {
    const d = deps();
    const r = await handleControlRequest("browser", { url: "http://localhost:8000" }, d);
    expect(d.openBrowser).toHaveBeenCalledWith("http://localhost:8000");
    expect(r).toEqual({ ok: true, body: { result: "Opened the browser at http://localhost:8000." } });
  });

  it("terminal passes preset and run through", async () => {
    const d = deps();
    await handleControlRequest("terminal", { preset: "claude", run: "npm run dev" }, d);
    expect(d.openTerminal).toHaveBeenCalledWith("claude", "npm run dev");
    await handleControlRequest("terminal", {}, d);
    expect(d.openTerminal).toHaveBeenCalledWith(undefined, undefined);
  });

  it("browser/terminal error without a wall; state still answers", async () => {
    const empty: StatePayload = { wall: null, terminals: [], browser: null };
    const d = deps({ wallOpen: () => false, stateSnapshot: () => empty });
    expect((await handleControlRequest("browser", { url: "http://x" }, d)).body)
      .toEqual({ error: "no space is open" });
    expect((await handleControlRequest("terminal", {}, d)).body)
      .toEqual({ error: "no space is open" });
    expect((await handleControlRequest("state", {}, d)).body).toEqual(empty);
  });

  it("unknown verbs are not ok", async () => {
    const r = await handleControlRequest("draw", {}, deps());
    expect(r.ok).toBe(false);
    expect(r.body).toEqual({ error: 'unknown verb "draw"' });
  });
});
