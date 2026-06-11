/** Mono 16-bit PCM WAV from raw Int16 frames (as delivered by WebVoiceProcessor). */
export function encodeWav(frames: Int16Array[], sampleRate: number): Blob {
  const sampleCount = frames.reduce((n, f) => n + f.length, 0);
  const dataBytes = sampleCount * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const tag = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  tag(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);             // fmt chunk size
  v.setUint16(20, 1, true);              // PCM
  v.setUint16(22, 1, true);              // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true);              // block align
  v.setUint16(34, 16, true);             // bits per sample
  tag(36, "data");
  v.setUint32(40, dataBytes, true);
  let off = 44;
  for (const f of frames) {
    for (let i = 0; i < f.length; i++, off += 2) v.setInt16(off, f[i], true);
  }
  return new Blob([buf], { type: "audio/wav" });
}
