import { describe, expect, it } from "vitest";
import { recipeEntries, runRecipe, summarizeRun } from "./recipe";
import type { Card } from "./cardStore";

const term = (id: string, name: string, run?: string): Card => ({
  kind: "terminal", id, name, x: 0, y: 0, w: 100, h: 100, presetId: "plain", cwd: "C:\\w", run,
});

describe("recipeEntries", () => {
  it("keeps only terminals with a non-empty trimmed run command, in order", () => {
    const cards: Card[] = [
      term("a", "Ada", "npm run dev"),
      term("b", "Bo"),
      term("c", "Cy", "   "),
      { kind: "browser", id: "br", url: "http://x", x: 0, y: 0, w: 1, h: 1 },
      term("d", "Dee", " cargo watch "),
    ];
    expect(recipeEntries(cards)).toEqual([
      { id: "a", name: "Ada", cmd: "npm run dev" },
      { id: "d", name: "Dee", cmd: "cargo watch" },
    ]);
  });
});

describe("runRecipe", () => {
  const entries = [
    { id: "a", name: "Ada", cmd: "npm run dev" },
    { id: "b", name: "Bo", cmd: "cargo watch" },
  ];

  it("routes every entry through send and splits ran/failed", () => {
    const sent: string[] = [];
    const r = runRecipe(entries, (id, cmd) => { sent.push(`${id}:${cmd}`); return id === "a"; });
    expect(sent).toEqual(["a:npm run dev", "b:cargo watch"]);
    expect(r.ran.map((e) => e.id)).toEqual(["a"]);
    expect(r.failed.map((e) => e.id)).toEqual(["b"]);
  });
});

describe("summarizeRun", () => {
  it("reports an empty recipe", () => {
    expect(summarizeRun({ ran: [], failed: [] })).toBe("This space has no boot recipe.");
  });

  it("names each command and its terminal", () => {
    const s = summarizeRun({ ran: [{ id: "a", name: "Ada", cmd: "npm run dev" }], failed: [] });
    expect(s).toBe("Ran 1 command: npm run dev in Ada.");
  });

  it("pluralizes and appends failures", () => {
    const s = summarizeRun({
      ran: [
        { id: "a", name: "Ada", cmd: "npm run dev" },
        { id: "d", name: "Dee", cmd: "cargo watch" },
      ],
      failed: [{ id: "b", name: "Bo", cmd: "x" }],
    });
    expect(s).toBe("Ran 2 commands: npm run dev in Ada, cargo watch in Dee. Could not reach Bo (no live session).");
  });
});
