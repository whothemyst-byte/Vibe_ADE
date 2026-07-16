import { describe, expect, it } from "vitest";
import { fuzzyScore, rankActions, scoreCandidate } from "./fuzzy";

describe("fuzzyScore", () => {
  it("matches subsequences and rejects non-matches", () => {
    expect(fuzzyScore("bro", "Browser")).not.toBeNull();
    expect(fuzzyScore("xyz", "Browser")).toBeNull();
  });

  it("empty query matches everything with zero score", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("CLAUDE", "claude code")).not.toBeNull();
  });

  it("scores word starts above mid-word hits", () => {
    // "Settings" starts with s; in "Tasks" the s is mid-word.
    expect(fuzzyScore("s", "Settings")!).toBeGreaterThan(fuzzyScore("s", "Tasks")!);
  });

  it("scores consecutive runs above scattered hits", () => {
    // "br" in "Browser": word start (3) + consecutive (2) = 5.
    // "br" in "Bar chart": word start (3) + scattered (1) = 4.
    expect(fuzzyScore("br", "Browser")!).toBeGreaterThan(fuzzyScore("br", "Bar chart")!);
  });
});

describe("scoreCandidate", () => {
  it("falls back to keywords when the label misses", () => {
    expect(scoreCandidate("terminal", "Plain shell", ["terminal"])).not.toBeNull();
  });

  it("ranks a label hit above an equal keyword hit", () => {
    const viaLabel = scoreCandidate("terminal", "terminal", [])!;
    const viaKeyword = scoreCandidate("terminal", "Plain shell", ["terminal"])!;
    expect(viaLabel).toBeGreaterThan(viaKeyword);
  });
});

describe("rankActions", () => {
  const A = (label: string, keywords: string[] = []) => ({ label, keywords });

  it("returns everything in registry order for an empty query", () => {
    const list = [A("Tasks"), A("Teams")];
    expect(rankActions("", list)).toEqual(list);
  });

  it("sorts matches by score, ties by registry order", () => {
    const label = A("Terminal");
    const keyword = A("Plain shell", ["terminal"]);
    expect(rankActions("terminal", [keyword, label])[0]).toBe(label);
  });

  it("drops non-matching actions", () => {
    expect(rankActions("zz", [A("Tasks")])).toEqual([]);
  });
});
