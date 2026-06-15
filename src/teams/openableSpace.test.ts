import { describe, expect, it } from "vitest";
import { openableSpaceFor } from "./openableSpace";
import type { Project } from "./orgStore";

const proj = (over: Partial<Project>): Project => ({
  id: "s1", org_id: "o1", local_origin_id: null, name: "Redesign",
  owner_user_id: "u1", thumb_url: null, content_path: "", background: null,
  version: 1, updated_at: "", updated_by: "u1", ...over,
} as Project);

describe("openableSpaceFor", () => {
  it("matches the live orgSpaceId to a project", () => {
    const p = proj({ id: "s1" });
    const got = openableSpaceFor({ liveOrgSpaceId: "s1", lastSpaceId: null, userId: "u1" }, [p]);
    expect(got).toBe(p);
  });
  it("falls back to a published last space by local_origin_id + owner", () => {
    const p = proj({ id: "s2", local_origin_id: "L9", owner_user_id: "u1" });
    const got = openableSpaceFor({ liveOrgSpaceId: null, lastSpaceId: "L9", userId: "u1" }, [p]);
    expect(got).toBe(p);
  });
  it("returns null when nothing matches", () => {
    expect(openableSpaceFor({ liveOrgSpaceId: null, lastSpaceId: "x", userId: "u1" }, [])).toBeNull();
  });
});
