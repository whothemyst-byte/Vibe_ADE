import { describe, expect, it } from "vitest";
import { inviteLinkFor, JOIN_BASE } from "./inviteLink";

describe("inviteLinkFor", () => {
  it("builds a quansynd.com join URL from a code", () => {
    expect(inviteLinkFor("AB12CD")).toBe(`${JOIN_BASE}/AB12CD`);
  });
  it("url-encodes the code", () => {
    expect(inviteLinkFor("a b")).toBe(`${JOIN_BASE}/a%20b`);
  });
});
