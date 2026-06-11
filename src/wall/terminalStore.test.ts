import { beforeEach, describe, expect, it } from "vitest";
import { useTerminalStore, type TerminalState } from "./terminalStore";

const mk = (id: string): TerminalState => ({
  id, name: "Atlas", x: 0, y: 0, w: 420, h: 260, presetId: "plain", cwd: "",
});

beforeEach(() => useTerminalStore.setState({ terminals: [], anchor: null }));

describe("terminalStore", () => {
  it("adds a terminal", () => {
    useTerminalStore.getState().add(mk("a"));
    expect(useTerminalStore.getState().terminals.map((t) => t.id)).toEqual(["a"]);
  });

  it("patches a terminal by id", () => {
    useTerminalStore.getState().add(mk("a"));
    useTerminalStore.getState().update("a", { x: 100, h: 300 });
    const t = useTerminalStore.getState().terminals[0];
    expect(t.x).toBe(100);
    expect(t.h).toBe(300);
    expect(t.w).toBe(420); // untouched fields preserved
  });

  it("removes a terminal by id", () => {
    useTerminalStore.getState().add(mk("a"));
    useTerminalStore.getState().add(mk("b"));
    useTerminalStore.getState().remove("a");
    expect(useTerminalStore.getState().terminals.map((t) => t.id)).toEqual(["b"]);
  });

  it("moveToIndex reorders a terminal", () => {
    useTerminalStore.getState().add(mk("a"));
    useTerminalStore.getState().add(mk("b"));
    useTerminalStore.getState().add(mk("c"));
    useTerminalStore.getState().moveToIndex("c", 0);
    expect(useTerminalStore.getState().terminals.map((t) => t.id)).toEqual(["c", "a", "b"]);
    useTerminalStore.getState().moveToIndex("c", 2);
    expect(useTerminalStore.getState().terminals.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("moveToIndex ignores unknown ids and clamps the index", () => {
    useTerminalStore.getState().add(mk("a"));
    useTerminalStore.getState().add(mk("b"));
    useTerminalStore.getState().moveToIndex("nope", 0);
    useTerminalStore.getState().moveToIndex("a", 99);
    expect(useTerminalStore.getState().terminals.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("stores the grid anchor", () => {
    expect(useTerminalStore.getState().anchor).toBeNull();
    useTerminalStore.setState({ anchor: { x: 5, y: 6 } });
    expect(useTerminalStore.getState().anchor).toEqual({ x: 5, y: 6 });
  });
});
