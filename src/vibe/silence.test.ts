import { describe, it, expect } from "vitest";
import { createSilenceDetector, FRAME_MS } from "./silence";

// 512 samples @ 16kHz = 32ms per frame (WebVoiceProcessor's frame size).
const FRAME_LEN = 512;
const loud = () => new Int16Array(FRAME_LEN).fill(8000);   // RMS ≈ 0.24
const quiet = () => new Int16Array(FRAME_LEN).fill(50);    // RMS ≈ 0.0015

function feed(d: ReturnType<typeof createSilenceDetector>, frame: () => Int16Array, ms: number) {
  let last: "speaking" | "waiting" | "stop" = "waiting";
  for (let t = 0; t < ms; t += FRAME_MS) last = d.push(frame());
  return last;
}

describe("createSilenceDetector", () => {
  it("does not stop during initial silence (still waiting for speech)", () => {
    const d = createSilenceDetector();
    expect(feed(d, quiet, 5000)).toBe("waiting");
  });

  it("stops after 1.2s of silence following speech", () => {
    const d = createSilenceDetector();
    feed(d, loud, 500);
    expect(feed(d, quiet, 1100)).toBe("speaking"); // not yet
    expect(feed(d, quiet, 200)).toBe("stop");      // crosses 1200ms
  });

  it("speech resets the silence timer", () => {
    const d = createSilenceDetector();
    feed(d, loud, 500);
    feed(d, quiet, 1000);
    feed(d, loud, 100);                            // resumes speaking
    expect(feed(d, quiet, 1100)).toBe("speaking"); // timer restarted
  });

  it("respects a custom threshold", () => {
    const d = createSilenceDetector({ thresholdRms: 0.5 }); // loud() is below this
    expect(feed(d, loud, 3000)).toBe("waiting");            // never counts as speech
  });
});
