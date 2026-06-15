import { afterEach, describe, expect, it, vi } from "vitest";
import { getClerkToken } from "./clerkToken";

type W = { Clerk?: { session?: { getToken: () => Promise<string | null> } | null } };
const w = globalThis as unknown as W;

afterEach(() => { delete w.Clerk; });

describe("getClerkToken", () => {
  it("returns null when Clerk is not on window yet", async () => {
    expect(await getClerkToken()).toBeNull();
  });

  it("returns null when there is no active session", async () => {
    w.Clerk = { session: null };
    expect(await getClerkToken()).toBeNull();
  });

  it("returns the session token when signed in", async () => {
    w.Clerk = { session: { getToken: vi.fn().mockResolvedValue("jwt-123") } };
    expect(await getClerkToken()).toBe("jwt-123");
  });

  it("returns null and swallows errors if getToken throws", async () => {
    w.Clerk = { session: { getToken: vi.fn().mockRejectedValue(new Error("boom")) } };
    expect(await getClerkToken()).toBeNull();
  });
});
