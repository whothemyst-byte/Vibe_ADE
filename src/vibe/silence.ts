/** WebVoiceProcessor delivers 512-sample frames at 16kHz = 32ms. */
export const FRAME_MS = 32;

export type SilenceDetectorOptions = {
  /** Normalized RMS (0..1) above which a frame counts as speech. */
  thresholdRms?: number;
  /** Silence duration after speech that ends the utterance. */
  silenceMs?: number;
};

export type SilenceState = "waiting" | "speaking" | "stop";

/**
 * Stateful endpoint detector. Feed every mic frame; returns:
 *  - "waiting":  no speech heard yet (initial silence never ends capture)
 *  - "speaking": speech heard, utterance ongoing
 *  - "stop":     >= silenceMs of quiet after speech — stop recording
 */
export function createSilenceDetector(opts: SilenceDetectorOptions = {}) {
  const threshold = opts.thresholdRms ?? 0.01;
  const silenceMs = opts.silenceMs ?? 1200;
  let heardSpeech = false;
  let quietMs = 0;

  return {
    push(frame: Int16Array): SilenceState {
      let sum = 0;
      for (let i = 0; i < frame.length; i++) {
        const s = frame[i] / 32768;
        sum += s * s;
      }
      const rms = Math.sqrt(sum / frame.length);
      if (rms >= threshold) {
        heardSpeech = true;
        quietMs = 0;
        return "speaking";
      }
      if (!heardSpeech) return "waiting";
      quietMs += FRAME_MS;
      return quietMs >= silenceMs ? "stop" : "speaking";
    },
  };
}
