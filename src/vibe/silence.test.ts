import { describe, it, expect } from "vitest";
import { createSilenceDetector, FRAME_MS } from "./silence";

// 512 samples @ 16kHz = 32ms per frame (WebVoiceProcessor's frame size).
const FRAME_LEN = 512;
const frame = (fill: number) => new Int16Array(FRAME_LEN).fill(fill);
const loud = () => frame(8000);   // RMS ≈ 0.24
const noise = () => frame(1638);  // RMS ≈ 0.05
const quiet = () => frame(50);    // RMS ≈ 0.0015

function feed(d: ReturnType<typeof createSilenceDetector>, f: () => Int16Array, ms: number) {
  let last: "speaking" | "waiting" | "stop" = "waiting";
  for (let t = 0; t < ms; t += FRAME_MS) last = d.push(f());
  return last;
}

// calibrationMs: 0 disables ambient calibration so endpointing is tested alone.
const plain = (opts = {}) => createSilenceDetector({ calibrationMs: 0, ...opts });

describe("endpointing", () => {
  it("does not stop during initial silence (still waiting for speech)", () => {
    expect(feed(plain(), quiet, 5000)).toBe("waiting");
  });

  it("stops after 1.2s of silence following real speech", () => {
    const d = plain();
    feed(d, loud, 500);
    expect(feed(d, quiet, 1100)).toBe("speaking"); // not yet
    expect(feed(d, quiet, 200)).toBe("stop");      // crosses 1200ms
  });

  it("speech resets the silence timer", () => {
    const d = plain();
    feed(d, loud, 500);
    feed(d, quiet, 1000);
    feed(d, loud, 100);                            // resumes speaking
    expect(feed(d, quiet, 1100)).toBe("speaking"); // timer restarted
  });

  it("respects a custom threshold floor", () => {
    const d = plain({ thresholdRms: 0.5 });        // loud() is below this
    expect(feed(d, loud, 3000)).toBe("waiting");   // never counts as speech
  });
});

describe("min-speech gate", () => {
  it("a sub-300ms blip does not arm the endpoint", () => {
    const d = plain();
    feed(d, loud, 100);                            // cough / click
    expect(feed(d, quiet, 3000)).toBe("waiting");  // silence cannot stop capture yet
  });

  it("cumulative speech across pauses arms the endpoint", () => {
    const d = plain();
    feed(d, loud, 200);
    feed(d, quiet, 500);
    feed(d, loud, 200);                            // total speech 400ms ≥ 300ms
    expect(feed(d, quiet, 1300)).toBe("stop");
  });
});

describe("max utterance length", () => {
  it("stops at the hard cap even with continuous speech", () => {
    const d = plain();
    expect(feed(d, loud, 15100)).toBe("stop");
  });

  it("stops at the hard cap even if the user never spoke", () => {
    const d = plain();
    expect(feed(d, quiet, 15100)).toBe("stop");
  });
});

describe("ambient calibration", () => {
  it("raises the threshold above steady background noise", () => {
    const d = createSilenceDetector();             // calibration on (300ms)
    feed(d, noise, 300);                           // ambient ≈ 0.05 → threshold 0.1 (clamped)
    expect(feed(d, noise, 3000)).toBe("waiting");  // noise alone is not speech
    feed(d, loud, 400);                            // real speech clears the raised bar
    expect(feed(d, quiet, 1300)).toBe("stop");
  });

  it("keeps the floor in a quiet room", () => {
    const d = createSilenceDetector();
    feed(d, quiet, 300);                           // ambient ≈ 0 → threshold stays at floor
    feed(d, loud, 400);
    expect(feed(d, quiet, 1300)).toBe("stop");
  });
});
