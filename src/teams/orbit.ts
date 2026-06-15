export type OrbitPos = { ring: number; angle: number; radius: number };

/** Max avatars per ring, innermost first. Beyond the last, the outer ring keeps filling. */
export const RING_CAPACITY = [6, 12, 18];
const RING_RADIUS = [110, 180, 250];

function ringRadius(ring: number): number {
  return RING_RADIUS[ring] ?? RING_RADIUS[RING_RADIUS.length - 1] + (ring - RING_RADIUS.length + 1) * 70;
}

/** Assigns each of `count` members to a ring + even angle. Angles in degrees. */
export function orbitPositions(count: number): OrbitPos[] {
  // Bucket indices into rings by capacity.
  const rings: number[] = [];
  let remaining = count;
  let ring = 0;
  while (remaining > 0) {
    const cap = RING_CAPACITY[ring] ?? RING_CAPACITY[RING_CAPACITY.length - 1];
    const take = Math.min(cap, remaining);
    rings.push(take);
    remaining -= take;
    ring += 1;
  }
  const out: OrbitPos[] = [];
  rings.forEach((n, r) => {
    for (let i = 0; i < n; i++) {
      out.push({ ring: r, angle: (360 / n) * i, radius: ringRadius(r) });
    }
  });
  return out;
}
