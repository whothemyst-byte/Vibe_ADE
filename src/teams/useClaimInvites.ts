import { useEffect, useRef } from "react";
import { useUser } from "@clerk/clerk-react";
import { useEntitlements } from "../entitlements";
import { useOrgStore } from "./orgStore";

/** Once per mount, for signed-in Team-tier users: claim pending invites, then
 *  load orgs so the Teams view has data ready. */
export function useClaimInvites(): void {
  const { canUseTeams } = useEntitlements();
  const { isSignedIn } = useUser();
  const ran = useRef(false);

  useEffect(() => {
    if (!canUseTeams || !isSignedIn || ran.current) return;
    ran.current = true;
    void (async () => {
      try {
        await useOrgStore.getState().claimInvites();
      } catch {
        /* claiming is best-effort; loadMyOrgs still runs below */
      }
      await useOrgStore.getState().loadMyOrgs();
    })();
  }, [canUseTeams, isSignedIn]);
}
