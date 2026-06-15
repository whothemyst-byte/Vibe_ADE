import { useClaimInvites } from "./useClaimInvites";

/** Renders nothing; runs invite-claim + org load while signed in. */
export function TeamsBootstrap() {
  useClaimInvites();
  return null;
}
