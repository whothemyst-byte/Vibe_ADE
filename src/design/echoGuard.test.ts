import { describe, it, expect } from "vitest";
import { hashText, makeEchoGuard } from "./echoGuard";

describe("hashText", () => {
  it("is stable and distinguishes different text", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });
});

describe("echo guard", () => {
  it("treats the card's own write as an echo exactly once", () => {
    const g = makeEchoGuard();
    g.markWritten("FILE-A");
    expect(g.isOwnEcho("FILE-A")).toBe(true);   // the echoed reload
    expect(g.isOwnEcho("FILE-A")).toBe(false);  // any later identical event is external
  });

  it("never swallows an external (agent) change", () => {
    const g = makeEchoGuard();
    g.markWritten("FILE-A");
    expect(g.isOwnEcho("FILE-B")).toBe(false);
  });
});
