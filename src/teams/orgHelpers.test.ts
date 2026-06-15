import { describe, expect, it } from "vitest";
import { isValidEmail, resolveCurrentOrg, type OrgLike } from "./orgHelpers";

const orgs: OrgLike[] = [
  { id: "a", name: "Acme" },
  { id: "b", name: "Globex" },
];

describe("isValidEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("jane@example.com")).toBe(true);
  });
  it("rejects junk", () => {
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("  ")).toBe(false);
  });
  it("trims surrounding whitespace", () => {
    expect(isValidEmail("  jane@example.com  ")).toBe(true);
  });
});

describe("resolveCurrentOrg", () => {
  it("returns the saved org when still a member", () => {
    expect(resolveCurrentOrg(orgs, "b")?.id).toBe("b");
  });
  it("falls back to the first org when the saved id is gone", () => {
    expect(resolveCurrentOrg(orgs, "zzz")?.id).toBe("a");
  });
  it("returns null when there are no orgs", () => {
    expect(resolveCurrentOrg([], "a")).toBeNull();
  });
  it("handles a null saved id", () => {
    expect(resolveCurrentOrg(orgs, null)?.id).toBe("a");
  });
});
