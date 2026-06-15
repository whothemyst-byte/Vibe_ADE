import { useClaimInvites } from "./useClaimInvites";
import { usePresenceLifecycle } from "./usePresenceLifecycle";
import { useDeepLinkJoin } from "./useDeepLinkJoin";

/** Renders nothing; runs invite-claim + org load + presence + deep-link joins. */
export function TeamsBootstrap() {
  useClaimInvites();
  usePresenceLifecycle();
  useDeepLinkJoin();
  return null;
}
