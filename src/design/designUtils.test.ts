import { describe, it, expect } from "vitest";
import { radToDeg, degToRad, labelForElement } from "./designUtils";

describe("radToDeg", () => {
  it("converts 0", () => expect(radToDeg(0)).toBe(0));
  it("converts PI to 180", () => expect(radToDeg(Math.PI)).toBeCloseTo(180));
  it("converts PI/2 to 90", () => expect(radToDeg(Math.PI / 2)).toBeCloseTo(90));
});

describe("degToRad", () => {
  it("converts 0", () => expect(degToRad(0)).toBe(0));
  it("converts 180 to PI", () => expect(degToRad(180)).toBeCloseTo(Math.PI));
  it("round-trips with radToDeg", () => expect(degToRad(radToDeg(1.23))).toBeCloseTo(1.23));
});

describe("labelForElement", () => {
  it("capitalises type for non-text", () => expect(labelForElement({ type: "rectangle" })).toBe("Rectangle"));
  it("uses text content for text elements", () => expect(labelForElement({ type: "text", text: "Hello world" })).toBe('"Hello world"'));
  it("truncates long text", () => {
    const long = "a".repeat(25);
    const label = labelForElement({ type: "text", text: long });
    expect(label.length).toBeLessThanOrEqual(22);
  });
  it("handles empty text", () => expect(labelForElement({ type: "text", text: "" })).toBe('"…"'));
});
