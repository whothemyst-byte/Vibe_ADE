import { describe, expect, it } from "vitest";
import { corsAllowOrigin, corsHeaders, parseBearer, ALLOWED_ORIGINS } from "./rules";

describe("corsAllowOrigin", () => {
  it("echoes an allow-listed origin", () => {
    for (const o of ALLOWED_ORIGINS) expect(corsAllowOrigin(o)).toBe(o);
  });
  it("falls back to the canonical origin for unknown/empty origins", () => {
    expect(corsAllowOrigin("https://evil.example")).toBe("https://www.quansynd.com");
    expect(corsAllowOrigin(null)).toBe("https://www.quansynd.com");
    expect(corsAllowOrigin(undefined)).toBe("https://www.quansynd.com");
  });
});

describe("corsHeaders", () => {
  it("includes the resolved origin and a Vary header", () => {
    const h = corsHeaders("https://quansynd.com");
    expect(h["Access-Control-Allow-Origin"]).toBe("https://quansynd.com");
    expect(h["Vary"]).toBe("Origin");
    expect(h["Access-Control-Allow-Methods"]).toContain("POST");
    expect(h["Access-Control-Allow-Headers"]).toContain("apikey");
  });
});

describe("parseBearer", () => {
  it("extracts the token", () => {
    expect(parseBearer("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(parseBearer("bearer  xyz")).toBe("xyz");
  });
  it("returns null when missing or malformed", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer("Token abc")).toBeNull();
  });
});
