import { describe, expect, it } from "vitest";
import { exitChannel, toBytes } from "./client";

describe("pty client", () => {
  it("namespaces the exit channel by id, matching the Rust side", () => {
    expect(exitChannel("abc")).toBe("pty://exit/abc");
  });

  it("normalizes ArrayBuffer channel payloads to Uint8Array", () => {
    const buf = new Uint8Array([27, 91, 65]).buffer;
    expect(Array.from(toBytes(buf))).toEqual([27, 91, 65]);
  });

  it("normalizes number-array channel payloads to Uint8Array", () => {
    expect(Array.from(toBytes([27, 91, 65]))).toEqual([27, 91, 65]);
  });
});
