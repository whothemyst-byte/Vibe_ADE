/** Public landing page that deep-links into the app (see the invite-link plan). */
export const JOIN_BASE = "https://quansynd.com/join";

/** Shareable invite link carrying an org's reusable join code. */
export function inviteLinkFor(joinCode: string): string {
  return `${JOIN_BASE}/${encodeURIComponent(joinCode)}`;
}
