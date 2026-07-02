import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSaver } from "./saver";

describe("makeSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("writes the latest text once after the debounce delay", async () => {
    const writes: string[] = [];
    const saver = makeSaver(async (t) => { writes.push(t); }, 300);
    saver.schedule(() => "v1");
    saver.schedule(() => "v2");
    expect(writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(writes).toEqual(["v2"]);
    expect(saver.isDirty()).toBe(false);
  });

  it("calls getText lazily, only at fire time", async () => {
    let calls = 0;
    const saver = makeSaver(async () => {}, 300);
    saver.schedule(() => { calls++; return "x"; });
    expect(calls).toBe(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(calls).toBe(1);
  });

  it("flush writes immediately and cancels the pending timer", async () => {
    const writes: string[] = [];
    const saver = makeSaver(async (t) => { writes.push(t); }, 300);
    saver.schedule(() => "now");
    await saver.flush();
    expect(writes).toEqual(["now"]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toEqual(["now"]); // no double write
  });

  it("flush is a no-op when clean", async () => {
    const writes: string[] = [];
    const saver = makeSaver(async (t) => { writes.push(t); }, 300);
    await saver.flush();
    expect(writes).toEqual([]);
  });

  it("a failed write stays dirty and is retried by the next flush", async () => {
    let fail = true;
    const writes: string[] = [];
    const saver = makeSaver(async (t) => {
      if (fail) throw new Error("disk full");
      writes.push(t);
    }, 300);
    saver.schedule(() => "v1");
    await vi.advanceTimersByTimeAsync(300);
    expect(saver.isDirty()).toBe(true);
    fail = false;
    await saver.flush();
    expect(writes).toEqual(["v1"]);
    expect(saver.isDirty()).toBe(false);
  });

  it("a newer schedule supersedes a failed payload", async () => {
    let fail = true;
    const writes: string[] = [];
    const saver = makeSaver(async (t) => {
      if (fail) throw new Error("nope");
      writes.push(t);
    }, 300);
    saver.schedule(() => "old");
    await vi.advanceTimersByTimeAsync(300);
    fail = false;
    saver.schedule(() => "new");
    await vi.advanceTimersByTimeAsync(300);
    expect(writes).toEqual(["new"]);
  });
});
