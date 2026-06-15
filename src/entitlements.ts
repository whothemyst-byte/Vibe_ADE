import { useUser } from "@clerk/clerk-react";

export type Tier = "free" | "pro" | "team";

export type Entitlements = {
  tier: Tier;
  canUseSubtasks: boolean;
  canUseDependencies: boolean;
  canUseSavedViews: boolean;
  canImportExternal: boolean;
  canUseAiTaskTools: boolean;
  canUseTeams: boolean;
  aiAllowance: number | "unlimited";
  maxDevices: number;
  settingsSync: boolean;
};

export const TIERS: Record<Tier, Entitlements> = {
  free: {
    tier: "free",
    canUseSubtasks: false,
    canUseDependencies: false,
    canUseSavedViews: false,
    canImportExternal: false,
    canUseAiTaskTools: false,
    canUseTeams: false,
    aiAllowance: 300,
    maxDevices: 1,
    settingsSync: false,
  },
  pro: {
    tier: "pro",
    canUseSubtasks: true,
    canUseDependencies: true,
    canUseSavedViews: true,
    canImportExternal: true,
    canUseAiTaskTools: true,
    canUseTeams: false,
    aiAllowance: "unlimited",
    maxDevices: 5,
    settingsSync: true,
  },
  team: {
    tier: "team",
    canUseSubtasks: true,
    canUseDependencies: true,
    canUseSavedViews: true,
    canImportExternal: true,
    canUseAiTaskTools: true,
    canUseTeams: true,
    aiAllowance: "unlimited",
    maxDevices: 25,
    settingsSync: true,
  },
};

export function coerceTier(value: unknown): Tier {
  return value === "pro" || value === "team" ? value : "free";
}

export function entitlementsFor(tier: Tier): Entitlements {
  return TIERS[tier];
}

/** Reads the current user's tier from the Clerk session. Defaults to free. */
export function useEntitlements(): Entitlements {
  const { user } = useUser();
  const tier = coerceTier(user?.publicMetadata?.tier);
  return entitlementsFor(tier);
}
