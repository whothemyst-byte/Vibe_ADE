/** WebVoiceProcessor delivers 512-sample frames at 16kHz = 32ms. */
export const FRAME_MS = 32;

export type SilenceDetectorOptions = {
  /** Normalized RMS (0..1) floor above which a frame counts as speech. Calibration can only raise it. */
  thresholdRms?: number;
  /** Silence duration after speech that ends the utterance. */
  silenceMs?: number;
  /** Cumulative speech required before silence may end the capture (a cough can't arm the endpoint). */
  minSpeechMs?: number;
  /** Hard cap on total capture length. */
  maxUtteranceMs?: number;
  /** Opening window sampled as ambient noise to calibrate the threshold; 0 disables. */
  calibrationMs?: number;
};

export type SilenceState = "waiting" | "speaking" | "stop";

/**
 * Stateful endpoint detector. Feed every mic frame; returns:
 *  - "waiting":  no (or not enough) speech heard yet — silence never ends capture
 *  - "speaking": speech heard, utterance ongoing
 *  - "stop":     >= silenceMs of quiet after real speech, or the hard time cap
 */
export function createSilenceDetector(opts: SilenceDetectorOptions = {}) {
  const floor = opts.thresholdRms ?? 0.01;
  const silenceMs = opts.silenceMs ?? 1200;
  const minSpeechMs = opts.minSpeechMs ?? 300;
  const maxUtteranceMs = opts.maxUtteranceMs ?? 15000;
  const calibrationMs = opts.calibrationMs ?? 300;

  let threshold = floor;
  let calibratedMs = 0;
  let ambientSum = 0;
  let speechMs = 0;
  let quietMs = 0;
  let totalMs = 0;

  return {
    push(frame: Int16Array): SilenceState {
      let sum = 0;
      for (let i = 0; i < frame.length; i++) {
        const s = frame[i] / 32768;
        sum += s * s;
      }
      const rms = Math.sqrt(sum / frame.length);

      totalMs += FRAME_MS;
      if (totalMs >= maxUtteranceMs) return "stop";

      // Calibration: the opening window is ambient noise; raise the threshold
      // above it (clamped so loud ambience can't make speech undetectable, and
      // never below the configured floor).
      if (calibratedMs < calibrationMs) {
        calibratedMs += FRAME_MS;
        ambientSum += rms;
        if (calibratedMs >= calibrationMs) {
          const ambient = ambientSum / (calibratedMs / FRAME_MS);
          threshold = Math.max(floor, Math.min(ambient * 2.5, 0.1));
        }
        return "waiting";
      }

      if (rms >= threshold) {
        speechMs += FRAME_MS;
        quietMs = 0;
        return "speaking";
      }
      if (speechMs < minSpeechMs) return "waiting"; // blips don't arm the endpoint
      quietMs += FRAME_MS;
      return quietMs >= silenceMs ? "stop" : "speaking";
    },
  };
}
