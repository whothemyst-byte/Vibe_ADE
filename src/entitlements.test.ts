import { describe, expect, it } from "vitest";
import { coerceTier, entitlementsFor } from "./entitlements";

describe("coerceTier", () => {
  it("passes through valid tiers", () => {
    expect(coerceTier("free")).toBe("free");
    expect(coerceTier("pro")).toBe("pro");
    expect(coerceTier("team")).toBe("team");
  });
  it("defaults unknown/missing values to free", () => {
    expect(coerceTier(undefined)).toBe("free");
    expect(coerceTier(null)).toBe("free");
    expect(coerceTier("enterprise")).toBe("free");
    expect(coerceTier(42)).toBe("free");
  });
});

describe("entitlementsFor", () => {
  it("reports the tier it was given", () => {
    expect(entitlementsFor("free").tier).toBe("free");
    expect(entitlementsFor("pro").tier).toBe("pro");
    expect(entitlementsFor("team").tier).toBe("team");
  });
  it("only team can use collaboration", () => {
    expect(entitlementsFor("free").canUseTeams).toBe(false);
    expect(entitlementsFor("pro").canUseTeams).toBe(false);
    expect(entitlementsFor("team").canUseTeams).toBe(true);
  });
});
