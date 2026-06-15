type ClerkWindow = {
  Clerk?: { session?: { getToken: () => Promise<string | null> } | null };
};

/**
 * Reads a fresh Clerk session JWT from the global Clerk instance. Returns null
 * when Clerk has not mounted yet or there is no signed-in session, so callers
 * (the Supabase client) degrade to an anonymous request instead of throwing.
 */
export async function getClerkToken(): Promise<string | null> {
  const clerk = (globalThis as unknown as ClerkWindow).Clerk;
  const session = clerk?.session;
  if (!session) return null;
  try {
    return await session.getToken();
  } catch {
    return null;
  }
}
