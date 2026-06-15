import { describe, expect, it } from "vitest";
import { parseJoinUrl } from "./joinUrl";

describe("parseJoinUrl", () => {
  it("reads the code from a custom-scheme link", () => {
    expect(parseJoinUrl("vibespace://join/AB12CD")).toBe("AB12CD");
  });
  it("reads the code from the https landing link", () => {
    expect(parseJoinUrl("https://quansynd.com/join/AB12CD")).toBe("AB12CD");
  });
  it("supports a ?code= query form", () => {
    expect(parseJoinUrl("vibespace://join?code=XYZ")).toBe("XYZ");
  });
  it("url-decodes the code", () => {
    expect(parseJoinUrl("vibespace://join/a%20b")).toBe("a b");
  });
  it("returns null for unrelated urls", () => {
    expect(parseJoinUrl("https://quansynd.com/")).toBeNull();
    expect(parseJoinUrl("not a url")).toBeNull();
  });
});
