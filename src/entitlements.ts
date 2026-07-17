import { useUser } from "@clerk/clerk-react";

export type Tier = "free" | "pro" | "team";

/** Only entitlements the app actually enforces live here. Flags for future
 *  Pro features (saved views, connectors, AI task tools…) get added back
 *  alongside the features themselves — see the tiers spec. */
export type Entitlements = {
  tier: Tier;
  canUseTeams: boolean;
};

export const TIERS: Record<Tier, Entitlements> = {
  free: { tier: "free", canUseTeams: false },
  pro: { tier: "pro", canUseTeams: false },
  team: { tier: "team", canUseTeams: true },
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
