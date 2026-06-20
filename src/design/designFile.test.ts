import { describe, it, expect } from "vitest";
import { designPath, DESIGN_REL } from "./designFile";

describe("designPath", () => {
  it("joins the space folder with the well-known relative path", () => {
    expect(designPath("C:/Users/me/proj")).toBe(`C:/Users/me/proj/${DESIGN_REL}`);
  });

  it("trims a trailing slash on the folder", () => {
    expect(designPath("C:/Users/me/proj/")).toBe(`C:/Users/me/proj/${DESIGN_REL}`);
  });

  it("trims a trailing backslash on the folder", () => {
    expect(designPath("C:\\Users\\me\\proj\\")).toBe(`C:\\Users\\me\\proj/${DESIGN_REL}`);
  });

  it("ends in .design.json (required by the Rust write command)", () => {
    expect(designPath("C:/x").endsWith(".design.json")).toBe(true);
  });
});
