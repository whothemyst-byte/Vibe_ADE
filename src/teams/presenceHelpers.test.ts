import { describe, expect, it } from "vitest";
import { agoText, deriveSelfStatus, statusLine } from "./presenceHelpers";

const NOW = 1_000_000_000_000;

describe("deriveSelfStatus", () => {
  it("is online when visible and recently active", () => {
    expect(deriveSelfStatus(true, NOW - 1000, NOW)).toBe("online");
  });
  it("is idle when visible but inactive past the threshold", () => {
    expect(deriveSelfStatus(true, NOW - 6 * 60_000, NOW)).toBe("idle");
  });
  it("is idle when the window is hidden", () => {
    expect(deriveSelfStatus(false, NOW, NOW)).toBe("idle");
  });
});

describe("agoText", () => {
  it("formats coarse durations", () => {
    expect(agoText(NOW, NOW)).toBe("just now");
    expect(agoText(NOW - 90_000, NOW)).toBe("1m ago");
    expect(agoText(NOW - 3 * 3600_000, NOW)).toBe("3h ago");
    expect(agoText(NOW - 2 * 86_400_000, NOW)).toBe("2d ago");
  });
});

describe("statusLine", () => {
  it("online in a space", () => {
    expect(statusLine({
      online: "online", currentSpaceName: "Redesign", lastSpaceName: null,
      lastActiveAt: null, manualStatus: null, manualEmoji: null, now: NOW,
    })).toBe("Online · in Redesign");
  });
  it("online with no space falls back to last worked in", () => {
    expect(statusLine({
      online: "online", currentSpaceName: null, lastSpaceName: "Redesign",
      lastActiveAt: null, manualStatus: null, manualEmoji: null, now: NOW,
    })).toBe("Online · last worked in Redesign");
  });
  it("offline shows last seen and last space", () => {
    expect(statusLine({
      online: null, currentSpaceName: null, lastSpaceName: "Redesign",
      lastActiveAt: NOW - 2 * 3600_000, manualStatus: null, manualEmoji: null, now: NOW,
    })).toBe("Offline · last seen 2h ago · last in Redesign");
  });
  it("manual status replaces the presence word and keeps location", () => {
    expect(statusLine({
      online: "online", currentSpaceName: "Redesign", lastSpaceName: null,
      lastActiveAt: null, manualStatus: "Heads-down", manualEmoji: "🎧", now: NOW,
    })).toBe("🎧 Heads-down · in Redesign");
  });
  it("plain online with nothing else", () => {
    expect(statusLine({
      online: "online", currentSpaceName: null, lastSpaceName: null,
      lastActiveAt: null, manualStatus: null, manualEmoji: null, now: NOW,
    })).toBe("Online");
  });
});
