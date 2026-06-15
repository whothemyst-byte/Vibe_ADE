import { describe, expect, it } from "vitest";
import { extOf, fromCloudBackground, toCloudBackground } from "./cloudSpace";

describe("extOf", () => {
  it("extracts a lowercased extension", () => {
    expect(extOf("C:/x/cat.PNG")).toBe("png");
    expect(extOf("/a/b/clip.webm")).toBe("webm");
    expect(extOf("noext")).toBe("bin");
  });
});

describe("toCloudBackground", () => {
  it("passes colors through with no upload", () => {
    expect(toCloudBackground({ kind: "color", color: "#123" }, "k")).toEqual({
      cloud: { kind: "color", color: "#123" }, upload: null,
    });
  });
  it("maps an image to a storage key + upload directive", () => {
    expect(toCloudBackground({ kind: "image", path: "C:/p/bg.jpg" }, "org/space")).toEqual({
      cloud: { kind: "image", key: "org/space/bg.jpg" },
      upload: { key: "org/space/bg.jpg", path: "C:/p/bg.jpg" },
    });
  });
});

describe("fromCloudBackground", () => {
  it("returns the color directly", () => {
    expect(fromCloudBackground({ kind: "color", color: "#123" }, null)).toEqual({ kind: "color", color: "#123" });
  });
  it("returns a url-backed image", () => {
    expect(fromCloudBackground({ kind: "image", key: "k/bg.jpg" }, "https://signed")).toEqual({
      kind: "image", url: "https://signed",
    });
  });
});
