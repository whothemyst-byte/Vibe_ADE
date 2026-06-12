import { beforeEach, describe, expect, it } from "vitest";
import { useCardStore, type TerminalCard } from "./cardStore";

const mk = (id: string): TerminalCard => ({
  kind: "terminal", id, name: "Atlas", x: 0, y: 0, w: 420, h: 260, presetId: "plain", cwd: "",
});

beforeEach(() => useCardStore.setState({ cards: [], anchor: null }));

describe("cardStore", () => {
  it("adds a terminal", () => {
    useCardStore.getState().add(mk("a"));
    expect(useCardStore.getState().cards.map((c) => c.id)).toEqual(["a"]);
  });

  it("patches a card by id", () => {
    useCardStore.getState().add(mk("a"));
    useCardStore.getState().update("a", { x: 100, h: 300 });
    const c = useCardStore.getState().cards[0];
    expect(c.x).toBe(100);
    expect(c.h).toBe(300);
    expect(c.w).toBe(420); // untouched fields preserved
  });

  it("removes a card by id", () => {
    useCardStore.getState().add(mk("a"));
    useCardStore.getState().add(mk("b"));
    useCardStore.getState().remove("a");
    expect(useCardStore.getState().cards.map((c) => c.id)).toEqual(["b"]);
  });

  it("moveToIndex reorders a terminal", () => {
    useCardStore.getState().add(mk("a"));
    useCardStore.getState().add(mk("b"));
    useCardStore.getState().add(mk("c"));
    useCardStore.getState().moveToIndex("c", 0);
    expect(useCardStore.getState().cards.map((c) => c.id)).toEqual(["c", "a", "b"]);
    useCardStore.getState().moveToIndex("c", 2);
    expect(useCardStore.getState().cards.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("moveToIndex ignores unknown ids and clamps the index", () => {
    useCardStore.getState().add(mk("a"));
    useCardStore.getState().add(mk("b"));
    useCardStore.getState().moveToIndex("nope", 0);
    useCardStore.getState().moveToIndex("a", 99);
    expect(useCardStore.getState().cards.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("moveToIndex reorders a browser card mixed with terminals", () => {
    useCardStore.setState({
      cards: [
        mk("t1"),
        { kind: "browser", id: "wall-browser", url: "http://localhost:5173", x: 0, y: 0, w: 1, h: 1 },
        mk("t2"),
      ],
      anchor: null,
    });
    useCardStore.getState().moveToIndex("wall-browser", 0);
    expect(useCardStore.getState().cards.map((c) => c.id)).toEqual(["wall-browser", "t1", "t2"]);
  });

  it("stores the grid anchor", () => {
    expect(useCardStore.getState().anchor).toBeNull();
    useCardStore.setState({ anchor: { x: 5, y: 6 } });
    expect(useCardStore.getState().anchor).toEqual({ x: 5, y: 6 });
  });
});
