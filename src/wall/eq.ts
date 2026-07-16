/** EQ bar math for the music card. The component owns the AnalyserNode and
    canvas; this module is pure so the fallback behavior is testable. */
export const BAR_COUNT = 16;

/** Averages analyser bins (0-255) into `count` bars normalized to 0..1. */
export function barsFromBins(bins: Uint8Array, count = BAR_COUNT): number[] {
  const per = Math.max(1, Math.floor(bins.length / count));
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = i * per; j < (i + 1) * per && j < bins.length; j++) sum += bins[j];
    bars.push(sum / (per * 255));
  }
  return bars;
}

/** True when the analyser yields nothing — either real silence or a CORS-opaque
    stream (which stays all-zero forever; the component times this out). */
export function isSilent(bins: Uint8Array): boolean {
  return bins.every((b) => b === 0);
}

/** Fake-but-lively bars for CORS-opaque streams: layered sines per bar, eased
    toward from `prev` so motion stays smooth. Deterministic in (prev, tMs). */
export function simulateBars(prev: number[], tMs: number): number[] {
  return prev.map((p, i) => {
    const target =
      0.4 +
      0.28 * Math.sin(tMs / 700 + i * 1.7) +
      0.22 * Math.sin(tMs / 240 + i * 0.9 + 2);
    const clamped = Math.min(1, Math.max(0.05, target));
    return p + (clamped - p) * 0.3;
  });
}
