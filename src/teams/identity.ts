type ClerkUser = {
  fullName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress?: string } | null;
  imageUrl?: string | null;
};
type ClerkWindow = { Clerk?: { user?: ClerkUser | null } };

/** Cosmetic profile snapshot passed into membership RPCs. Identity (the user id)
 *  is derived server-side from the JWT, never from this. */
export function currentProfile(): { displayName: string | null; avatarUrl: string | null } {
  const u = (globalThis as unknown as ClerkWindow).Clerk?.user;
  const displayName =
    u?.fullName || u?.username || u?.primaryEmailAddress?.emailAddress || null;
  return { displayName, avatarUrl: u?.imageUrl ?? null };
}
