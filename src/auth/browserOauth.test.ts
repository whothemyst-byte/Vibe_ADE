import { describe, it, expect } from "vitest";
import { buildSignInUrl } from "./browserOauth";

describe("buildSignInUrl", () => {
  it("encodes the loopback redirect and state into the helper URL", () => {
    const url = buildSignInUrl("https://www.quansynd.com/vibe-space-signin.html", "google", 51234, "abc-123");
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://www.quansynd.com/vibe-space-signin.html");
    expect(parsed.searchParams.get("provider")).toBe("google");
    expect(parsed.searchParams.get("redirect")).toBe("http://127.0.0.1:51234");
    expect(parsed.searchParams.get("state")).toBe("abc-123");
  });

  it("round-trips a different provider and port", () => {
    const parsed = new URL(buildSignInUrl("https://x.test/p.html", "github", 8, "s"));
    expect(parsed.searchParams.get("provider")).toBe("github");
    expect(parsed.searchParams.get("redirect")).toBe("http://127.0.0.1:8");
  });
});
