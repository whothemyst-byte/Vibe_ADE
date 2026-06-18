import { describe, it, expect } from "vitest";
import { spaceFromFolder } from "./spaceFromFolder";

describe("spaceFromFolder", () => {
  it("derives name from the trailing folder segment", () => {
    const m = spaceFromFolder("C:\\Users\\admin\\Projects\\demo");
    expect(m.name).toBe("demo");
    expect(m.path).toBe("C:\\Users\\admin\\Projects\\demo");
  });

  it("ignores trailing slashes and handles forward slashes", () => {
    expect(spaceFromFolder("D:/work/site/").name).toBe("site");
  });

  it("falls back to 'wall' for a rootless path", () => {
    expect(spaceFromFolder("").name).toBe("wall");
  });

  it("marks the space current with a fresh id and timestamp", () => {
    const before = Date.now();
    const m = spaceFromFolder("C:\\a\\b");
    expect(m.isCurrent).toBe(true);
    expect(m.id).toMatch(/[0-9a-f-]{36}/);
    expect(m.updatedAt).toBeGreaterThanOrEqual(before);
  });
});
