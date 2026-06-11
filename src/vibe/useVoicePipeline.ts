import { useEffect, useRef } from "react";
import { PorcupineWorker } from "@picovoice/porcupine-web";
import { WebVoiceProcessor } from "@picovoice/web-voice-processor";
import { createSilenceDetector } from "./silence";
import { encodeWav } from "./wav";

const SAMPLE_RATE = 16000; // WebVoiceProcessor's fixed output rate
const MAX_UTTERANCE_MS = 15000;

export type VoicePipeline = {
  /** Records until silence (or 15s cap); resolves to a WAV blob, or null if nothing was said. */
  capture: () => Promise<Blob | null>;
};

/**
 * Owns the mic. While `enabled` and a Picovoice key is set, Porcupine listens
 * for "Vibe" and fires `onWake`. `capture()` can be invoked at any time (wake
 * or hotkey path) and works even when the wake word engine is unavailable.
 */
export function useVoicePipeline(opts: {
  enabled: boolean;
  picovoiceAccessKey: string;
  onWake: () => void;
}): VoicePipeline {
  const porcupineRef = useRef<PorcupineWorker | null>(null);
  const onWakeRef = useRef(opts.onWake);
  onWakeRef.current = opts.onWake;

  useEffect(() => {
    if (!opts.enabled || !opts.picovoiceAccessKey) return;
    let cancelled = false;
    (async () => {
      try {
        const worker = await PorcupineWorker.create(
          opts.picovoiceAccessKey,
          [{ publicPath: "/vibe_wake.ppn", label: "vibe" }],
          () => onWakeRef.current(),
          { publicPath: "/porcupine_params.pv" },
        );
        if (cancelled) {
          worker.terminate();
          return;
        }
        porcupineRef.current = worker;
        await WebVoiceProcessor.subscribe(worker);
      } catch (e) {
        // Missing .ppn / bad AccessKey / mic denied → hotkey-only mode.
        console.warn("[vibe] wake word unavailable:", e);
      }
    })();
    return () => {
      cancelled = true;
      const w = porcupineRef.current;
      porcupineRef.current = null;
      if (w) {
        void WebVoiceProcessor.unsubscribe(w);
        w.terminate();
      }
    };
  }, [opts.enabled, opts.picovoiceAccessKey]);

  const capture = async (): Promise<Blob | null> => {
    const frames: Int16Array[] = [];
    const detector = createSilenceDetector();
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => { resolveDone = r; });
    let finished = false;
    const finish = () => { if (!finished) { finished = true; resolveDone(); } };

    // Engine contract: subscribed objects receive frames via
    // onmessage({ data: { command: "process", inputFrame } }).
    const recorder = {
      onmessage: (e: MessageEvent<{ command: string; inputFrame: Int16Array }>) => {
        if (e.data.command !== "process") return;
        frames.push(new Int16Array(e.data.inputFrame));
        if (detector.push(e.data.inputFrame) === "stop") finish();
      },
    };
    await WebVoiceProcessor.subscribe(recorder);
    const cap = window.setTimeout(finish, MAX_UTTERANCE_MS);
    await done;
    window.clearTimeout(cap);
    await WebVoiceProcessor.unsubscribe(recorder);

    // Never went above the speech threshold = user never spoke.
    const heardAnything = frames.some((f) => f.some((s) => Math.abs(s) > 327)); // > ~0.01
    return heardAnything ? encodeWav(frames, SAMPLE_RATE) : null;
  };

  return { capture };
}
