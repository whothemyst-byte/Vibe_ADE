import { describe, it, expect, beforeEach } from "vitest";
import { useCardStore } from "../wall/cardStore";
import { openDesign, closeDesign, designCard, DESIGN_ID } from "./designCard";

beforeEach(() => useCardStore.setState({ cards: [], anchor: null }));

describe("design card actions", () => {
  it("openDesign adds a single design card", () => {
    openDesign("/proj/designs/login.design.json", "login");
    const c = designCard();
    expect(c?.kind).toBe("design");
    expect(c?.id).toBe(DESIGN_ID);
    expect(c?.path).toBe("/proj/designs/login.design.json");
    expect(c?.name).toBe("login");
  });

  it("openDesign re-points the existing card instead of adding a second", () => {
    openDesign("/a/x.design.json", "x");
    openDesign("/a/y.design.json", "y");
    expect(useCardStore.getState().cards.filter((c) => c.kind === "design")).toHaveLength(1);
    expect(designCard()?.name).toBe("y");
  });

  it("closeDesign runs without throwing", () => {
    openDesign("/a/x.design.json", "x");
    expect(() => closeDesign()).not.toThrow();
  });
});
