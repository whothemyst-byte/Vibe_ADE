import { describe, expect, it } from "vitest";
import { dataChannel, exitChannel } from "./client";

describe("pty channel helpers", () => {
  it("namespaces data/exit channels by id, matching the Rust side", () => {
    expect(dataChannel("abc")).toBe("pty://data/abc");
    expect(exitChannel("abc")).toBe("pty://exit/abc");
  });
});
