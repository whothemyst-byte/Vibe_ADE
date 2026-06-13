const KNOWN: Record<string, string> = {
  google: "Google",
  github: "GitHub",
};

/**
 * Human label for a Clerk provider string. Accepts both the verification-strategy
 * form ("oauth_google") and the external-account form ("google").
 */
export function providerLabel(provider: string): string {
  const key = provider.replace(/^oauth_/, "").toLowerCase();
  if (KNOWN[key]) return KNOWN[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Labels for a user's connected OAuth accounts. */
export function connectedProviders(
  accounts: { provider: string }[] | undefined | null,
): string[] {
  return (accounts ?? []).map((a) => providerLabel(a.provider));
}

/** "June 2026"-style label for an account creation date. */
export function memberSince(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
