import { describe, it, expect } from "vitest";
import { providerLabel, connectedProviders, memberSince } from "./profile";

describe("providerLabel", () => {
  it("humanizes known providers regardless of oauth_ prefix", () => {
    expect(providerLabel("oauth_google")).toBe("Google");
    expect(providerLabel("google")).toBe("Google");
    expect(providerLabel("github")).toBe("GitHub");
  });
  it("falls back to a title-cased provider name", () => {
    expect(providerLabel("oauth_gitlab")).toBe("Gitlab");
  });
});

describe("connectedProviders", () => {
  it("maps external accounts to labels", () => {
    const accounts = [{ provider: "google" }, { provider: "oauth_github" }];
    expect(connectedProviders(accounts)).toEqual(["Google", "GitHub"]);
  });
  it("returns an empty array when there are none", () => {
    expect(connectedProviders([])).toEqual([]);
    expect(connectedProviders(undefined)).toEqual([]);
  });
});

describe("memberSince", () => {
  it("formats a date as Month Year", () => {
    expect(memberSince(new Date("2026-06-13T00:00:00Z"))).toBe("June 2026");
  });
  it("returns empty string for null", () => {
    expect(memberSince(null)).toBe("");
  });
});
