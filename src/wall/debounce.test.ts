import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trailingDebounce } from "./debounce";

describe("trailingDebounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires once after the quiet period", () => {
    const fn = vi.fn();
    const d = trailingDebounce(fn, 150);
    d.bump();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("coalesces a burst of bumps into a single trailing call", () => {
    const fn = vi.fn();
    const d = trailingDebounce(fn, 150);
    // Simulate ResizeObserver firing every frame of a 300ms CSS transition.
    for (let t = 0; t < 300; t += 16) {
      d.bump();
      vi.advanceTimersByTime(16);
    }
    expect(fn).not.toHaveBeenCalled(); // still inside the quiet window
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the pending call", () => {
    const fn = vi.fn();
    const d = trailingDebounce(fn, 150);
    d.bump();
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("fires again for a new burst after settling", () => {
    const fn = vi.fn();
    const d = trailingDebounce(fn, 150);
    d.bump();
    vi.advanceTimersByTime(150);
    d.bump();
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
