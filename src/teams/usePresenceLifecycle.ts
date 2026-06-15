import { useEffect } from "react";
import { useEntitlements } from "../entitlements";
import { useOrgStore } from "./orgStore";
import { joinOrgPresence, leavePresence } from "./presence";

/** Keeps the Realtime presence channel joined for the current org, across views. */
export function usePresenceLifecycle(): void {
  const { canUseTeams } = useEntitlements();
  const currentOrgId = useOrgStore((s) => s.currentOrgId);

  useEffect(() => {
    if (!canUseTeams || !currentOrgId) return;
    void joinOrgPresence(currentOrgId);
    return () => { void leavePresence(); };
  }, [canUseTeams, currentOrgId]);
}
