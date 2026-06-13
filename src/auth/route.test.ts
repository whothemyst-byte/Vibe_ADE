import { describe, it, expect } from "vitest";
import { isSsoCallbackPath, SSO_CALLBACK_PATH } from "./route";

describe("isSsoCallbackPath", () => {
  it("matches the canonical callback path", () => {
    expect(isSsoCallbackPath(SSO_CALLBACK_PATH)).toBe(true);
  });
  it("matches with a trailing slash", () => {
    expect(isSsoCallbackPath("/sso-callback/")).toBe(true);
  });
  it("does not match other paths", () => {
    expect(isSsoCallbackPath("/")).toBe(false);
    expect(isSsoCallbackPath("/sso-callback-extra")).toBe(false);
  });
});
