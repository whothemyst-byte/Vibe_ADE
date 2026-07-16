import { describe, expect, it } from "vitest";
import { STATIONS, nextStation, findStation } from "./stations";

describe("STATIONS", () => {
  it("ships 3-5 verified https stations with attribution", () => {
    expect(STATIONS.length).toBeGreaterThanOrEqual(3);
    expect(STATIONS.length).toBeLessThanOrEqual(5);
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(STATIONS.length);
    for (const s of STATIONS) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.mood.length).toBeGreaterThan(0);
      expect(s.attribution.length).toBeGreaterThan(0);
    }
  });
});

describe("nextStation", () => {
  it("cycles through the list and wraps", () => {
    expect(nextStation(STATIONS[0].id).id).toBe(STATIONS[1].id);
    expect(nextStation(STATIONS[STATIONS.length - 1].id).id).toBe(STATIONS[0].id);
  });

  it("falls back to the first station for unknown ids (e.g. custom)", () => {
    expect(nextStation("custom").id).toBe(STATIONS[0].id);
  });
});

describe("findStation", () => {
  it("matches by name or mood, case-insensitively", () => {
    const s = STATIONS[0];
    expect(findStation(s.name.toLowerCase())?.id).toBe(s.id);
    expect(findStation(s.mood.toUpperCase())?.id).toBe(s.id);
    expect(findStation("no such station")).toBeUndefined();
  });
});
