type ClerkUser = {
  id?: string | null;
  fullName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress?: string } | null;
  imageUrl?: string | null;
};
type ClerkWindow = { Clerk?: { user?: ClerkUser | null } };

/** The signed-in Clerk user id, or null. Used to mark "you" and resolve role. */
export function currentUserId(): string | null {
  return (globalThis as unknown as ClerkWindow).Clerk?.user?.id ?? null;
}

/** Cosmetic profile snapshot passed into membership RPCs. Identity (the user id)
 *  is derived server-side from the JWT, never from this. */
export function currentProfile(): { displayName: string | null; avatarUrl: string | null } {
  const u = (globalThis as unknown as ClerkWindow).Clerk?.user;
  const displayName =
    u?.fullName || u?.username || u?.primaryEmailAddress?.emailAddress || null;
  return { displayName, avatarUrl: u?.imageUrl ?? null };
}
