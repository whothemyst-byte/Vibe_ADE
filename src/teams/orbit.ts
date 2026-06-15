export type OrbitPos = { ring: number; angle: number; radius: number };

/** Max avatars per ring, innermost first. Beyond the last, the outer ring keeps filling. */
export const RING_CAPACITY = [6, 12, 18];
/** Ring radius as a fraction of maxRadius. Mirrors the original 110/180/250 over 280. */
const RING_FRACTION = [110 / 280, 180 / 280, 250 / 280];
const DEFAULT_MAX_RADIUS = 280;

function ringRadius(ring: number, maxRadius: number): number {
  const last = RING_FRACTION.length - 1;
  const frac = ring <= last
    ? RING_FRACTION[ring]
    : Math.min(1, RING_FRACTION[last] + (ring - last) * 0.25);
  return frac * maxRadius;
}

/** Assigns each of `count` members to a ring + even angle. Angles in degrees. */
export function orbitPositions(count: number, maxRadius = DEFAULT_MAX_RADIUS): OrbitPos[] {
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
      out.push({ ring: r, angle: (360 / n) * i, radius: ringRadius(r, maxRadius) });
    }
  });
  return out;
}
