import type { Project } from "./orgStore";

/** Resolve which shared project (if any) a member's current/last space maps to. */
export function openableSpaceFor(
  m: { liveOrgSpaceId: string | null; lastSpaceId: string | null; userId: string },
  projects: Project[],
): Project | null {
  if (m.liveOrgSpaceId) {
    const live = projects.find((p) => p.id === m.liveOrgSpaceId);
    if (live) return live;
  }
  if (m.lastSpaceId) {
    const last = projects.find((p) => p.local_origin_id === m.lastSpaceId && p.owner_user_id === m.userId);
    if (last) return last;
  }
  return null;
}
