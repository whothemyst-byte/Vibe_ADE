import { beforeEach, describe, expect, it } from "vitest";
import { useTerminalStore, type TerminalState } from "./terminalStore";

const mk = (id: string): TerminalState => ({
  id, x: 0, y: 0, w: 420, h: 260, presetId: "plain", cwd: "", started: false,
});

beforeEach(() => useTerminalStore.setState({ terminals: [] }));

describe("terminalStore", () => {
  it("adds a terminal", () => {
    useTerminalStore.getState().add(mk("a"));
    expect(useTerminalStore.getState().terminals.map((t) => t.id)).toEqual(["a"]);
  });

  it("patches a terminal by id", () => {
    useTerminalStore.getState().add(mk("a"));
    useTerminalStore.getState().update("a", { x: 100, started: true });
    const t = useTerminalStore.getState().terminals[0];
    expect(t.x).toBe(100);
    expect(t.started).toBe(true);
    expect(t.w).toBe(420); // untouched fields preserved
  });

  it("removes a terminal by id", () => {
    useTerminalStore.getState().add(mk("a"));
    useTerminalStore.getState().add(mk("b"));
    useTerminalStore.getState().remove("a");
    expect(useTerminalStore.getState().terminals.map((t) => t.id)).toEqual(["b"]);
  });
});
