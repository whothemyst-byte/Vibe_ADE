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
  it("free is the most limited", () => {
    const e = entitlementsFor("free");
    expect(e.tier).toBe("free");
    expect(e.canUseSubtasks).toBe(false);
    expect(e.canUseDependencies).toBe(false);
    expect(e.canUseSavedViews).toBe(false);
    expect(e.canImportExternal).toBe(false);
    expect(e.canUseAiTaskTools).toBe(false);
    expect(e.aiAllowance).toBe(300);
    expect(e.maxDevices).toBe(1);
    expect(e.settingsSync).toBe(false);
  });
  it("pro unlocks power features and hosted AI", () => {
    const e = entitlementsFor("pro");
    expect(e.canUseSubtasks).toBe(true);
    expect(e.canUseDependencies).toBe(true);
    expect(e.canUseSavedViews).toBe(true);
    expect(e.canImportExternal).toBe(true);
    expect(e.canUseAiTaskTools).toBe(true);
    expect(e.aiAllowance).toBe("unlimited");
    expect(e.settingsSync).toBe(true);
    expect(e.maxDevices).toBeGreaterThan(1);
  });
  it("team is a superset of pro", () => {
    const e = entitlementsFor("team");
    expect(e.canImportExternal).toBe(true);
    expect(e.canUseAiTaskTools).toBe(true);
    expect(e.aiAllowance).toBe("unlimited");
  });
  it("only team can use collaboration", () => {
    expect(entitlementsFor("free").canUseTeams).toBe(false);
    expect(entitlementsFor("pro").canUseTeams).toBe(false);
    expect(entitlementsFor("team").canUseTeams).toBe(true);
  });
});
