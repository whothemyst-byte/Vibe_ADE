import { describe, expect, it } from "vitest";
import {
  IDLE_AFTER_MS, newActivity, recordOutput, settle,
  isWorking, workedMs, formatElapsed, statusLabel,
} from "./agentStatus";

describe("activity tracking", () => {
  it("starts idle with zero worked time", () => {
    const a = newActivity();
    expect(isWorking(a, 1000)).toBe(false);
    expect(workedMs(a, 1000)).toBe(0);
    expect(statusLabel(a, 1000)).toBe("Idle");
  });

  it("is working right after output, idle once IDLE_AFTER_MS passes", () => {
    const a = recordOutput(newActivity(), 1000);
    expect(isWorking(a, 1000 + IDLE_AFTER_MS - 1)).toBe(true);
    expect(isWorking(a, 1000 + IDLE_AFTER_MS)).toBe(false);
  });

  it("accumulates the live span while working", () => {
    let a = recordOutput(newActivity(), 1000);
    a = recordOutput(a, 5000);
    expect(workedMs(a, 6000)).toBe(5000); // 1000 -> 6000, still working
  });

  it("caps a finished span at the last output time", () => {
    const a = recordOutput(newActivity(), 1000);
    // long idle: span counts 1000 -> 1000 (zero length), not up to `now`
    expect(workedMs(a, 60_000)).toBe(0);
  });

  it("settle folds the finished span and a new span adds to it", () => {
    let a = recordOutput(newActivity(), 1000);
    a = recordOutput(a, 4000); // span worth 3000ms
    a = settle(a, 4000 + IDLE_AFTER_MS); // idle -> fold
    expect(a.activeSince).toBeNull();
    expect(workedMs(a, 99_000)).toBe(3000);
    a = recordOutput(a, 100_000);
    expect(workedMs(a, 102_000)).toBe(5000); // 3000 folded + 2000 live
  });

  it("settle is a no-op while still working", () => {
    const a = recordOutput(newActivity(), 1000);
    expect(settle(a, 1500)).toEqual(a);
  });
});

describe("formatting", () => {
  it("formats seconds, minutes, hours", () => {
    expect(formatElapsed(45_000)).toBe("45s");
    expect(formatElapsed(252_000)).toBe("4m 12s");
    expect(formatElapsed(3_660_000)).toBe("1h 1m");
  });

  it("labels working and cooked states", () => {
    let a = recordOutput(newActivity(), 0);
    a = recordOutput(a, 252_000);
    expect(statusLabel(a, 252_000)).toBe("Working 4m 12s");
    a = settle(a, 252_000 + IDLE_AFTER_MS);
    expect(statusLabel(a, 300_000)).toBe("Cooked for 4m 12s");
  });
});
