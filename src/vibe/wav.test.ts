import { describe, it, expect } from "vitest";
import { encodeWav } from "./wav";

const SAMPLE_RATE = 16000;

async function bytes(frames: Int16Array[]): Promise<DataView> {
  return new DataView(await encodeWav(frames, SAMPLE_RATE).arrayBuffer());
}

describe("encodeWav", () => {
  it("writes a valid 44-byte PCM header", async () => {
    const v = await bytes([new Int16Array([0, 1000, -1000])]);
    const tag = (off: number) =>
      String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    expect(tag(0)).toBe("RIFF");
    expect(tag(8)).toBe("WAVE");
    expect(tag(12)).toBe("fmt ");
    expect(v.getUint16(20, true)).toBe(1);           // PCM
    expect(v.getUint16(22, true)).toBe(1);           // mono
    expect(v.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(v.getUint16(34, true)).toBe(16);          // bits per sample
    expect(tag(36)).toBe("data");
    expect(v.getUint32(40, true)).toBe(6);           // 3 samples * 2 bytes
  });

  it("concatenates multiple frames in order, little-endian", async () => {
    const v = await bytes([new Int16Array([100]), new Int16Array([-200, 300])]);
    expect(v.getInt16(44, true)).toBe(100);
    expect(v.getInt16(46, true)).toBe(-200);
    expect(v.getInt16(48, true)).toBe(300);
    expect(v.getUint32(4, true)).toBe(36 + 6);       // RIFF chunk size
  });

  it("handles empty input", async () => {
    const v = await bytes([]);
    expect(v.getUint32(40, true)).toBe(0);
  });
});
