import { describe, expect, it } from "vitest";
import { orbitPositions, RING_CAPACITY } from "./orbit";

describe("orbitPositions", () => {
  it("returns one position per member", () => {
    expect(orbitPositions(0)).toHaveLength(0);
    expect(orbitPositions(1)).toHaveLength(1);
    expect(orbitPositions(20)).toHaveLength(20);
  });

  it("fills the inner ring first, then spills outward", () => {
    const inner = RING_CAPACITY[0];
    const pos = orbitPositions(inner + 1);
    expect(pos.slice(0, inner).every((p) => p.ring === 0)).toBe(true);
    expect(pos[inner].ring).toBe(1);
  });

  it("gives each ring a larger radius", () => {
    const pos = orbitPositions(RING_CAPACITY[0] + 2);
    const r0 = pos.find((p) => p.ring === 0)!.radius;
    const r1 = pos.find((p) => p.ring === 1)!.radius;
    expect(r1).toBeGreaterThan(r0);
  });

  it("spaces members evenly within a ring", () => {
    const pos = orbitPositions(4); // 4 on ring 0
    const angles = pos.map((p) => p.angle).sort((a, b) => a - b);
    expect(angles).toEqual([0, 90, 180, 270]);
  });

  it("scales ring radius with the maxRadius argument", () => {
    const small = orbitPositions(1, 100)[0].radius;
    const big = orbitPositions(1, 200)[0].radius;
    expect(big).toBeCloseTo(small * 2);
    expect(small).toBeGreaterThan(0);
  });

  it("defaults to the original 560-box scale", () => {
    // ring 0 radius was 110 in the fixed layout (maxRadius 280)
    expect(orbitPositions(1)[0].radius).toBeCloseTo(110);
  });
});
