import { describe, expect, it } from "vitest";
import { relativeTime } from "./relativeTime";

const now = 1_000_000_000_000;
const s = 1000, m = 60 * s, h = 60 * m, d = 24 * h;

describe("relativeTime", () => {
  it("shows 'just now' under a minute", () => {
    expect(relativeTime(now - 30 * s, now)).toBe("just now");
  });
  it("shows minutes", () => {
    expect(relativeTime(now - 5 * m, now)).toBe("5m ago");
  });
  it("shows hours", () => {
    expect(relativeTime(now - 3 * h, now)).toBe("3h ago");
  });
  it("shows days", () => {
    expect(relativeTime(now - 2 * d, now)).toBe("2d ago");
  });
  it("floors to the unit", () => {
    expect(relativeTime(now - (2 * h + 59 * m), now)).toBe("2h ago");
  });
});
