import { useClaimInvites } from "./useClaimInvites";
import { usePresenceLifecycle } from "./usePresenceLifecycle";

/** Renders nothing; runs invite-claim + org load + presence while signed in. */
export function TeamsBootstrap() {
  useClaimInvites();
  usePresenceLifecycle();
  return null;
}
