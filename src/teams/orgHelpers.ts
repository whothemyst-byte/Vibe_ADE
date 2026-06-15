export type OrgLike = { id: string; name: string };

/** Pragmatic email check: a single @, a dot in the domain, no spaces. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Picks which org should be active: the previously-selected one if the user is
 * still a member, else the first available, else null.
 */
export function resolveCurrentOrg(orgs: OrgLike[], savedId: string | null): OrgLike | null {
  if (orgs.length === 0) return null;
  return orgs.find((o) => o.id === savedId) ?? orgs[0];
}
