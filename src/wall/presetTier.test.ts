import { describe, expect, it } from "vitest";
import { presetTierColor } from "./presetTier";

describe("presetTierColor", () => {
  it("maps known presets to brand token colors", () => {
    expect(presetTierColor("plain")).toBe("var(--text-faint)");
    expect(presetTierColor("claude")).toBe("var(--accent)");
    expect(presetTierColor("codex")).toBe("var(--info)");
  });
  it("falls back to muted for unknown presets", () => {
    expect(presetTierColor("anything-else")).toBe("var(--text-muted)");
  });
});
