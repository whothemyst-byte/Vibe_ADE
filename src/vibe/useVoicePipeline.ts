import { useEffect, useRef } from "react";
import { createModel, type Model, type KaldiRecognizer } from "vosk-browser";
import { WebVoiceProcessor } from "@picovoice/web-voice-processor";
import { createSilenceDetector } from "./silence";
import { encodeWav } from "./wav";

const SAMPLE_RATE = 16000; // WebVoiceProcessor's fixed output rate
const MAX_UTTERANCE_MS = 15000;
const WAKE_DEBOUNCE_MS = 2000;
const MODEL_URL = "/vosk-model-small-en-us.tar.gz";
/** Restrict recognition to the wake word; everything else maps to [unk]. */
const WAKE_GRAMMAR = '["vibe", "[unk]"]';

export type VoicePipeline = {
  /** Records until silence (or 15s cap); resolves to a WAV blob, or null if nothing was said. */
  capture: () => Promise<Blob | null>;
};

/**
 * Owns the mic. While `enabled`, a local Vosk recognizer (WASM, fully offline,
 * no account or API key) listens for the word "vibe" and fires `onWake`.
 * `capture()` can be invoked at any time (wake or hotkey path) and works even
 * when the wake word engine is unavailable.
 */
export function useVoicePipeline(opts: {
  enabled: boolean;
  onWake: () => void;
}): VoicePipeline {
  const onWakeRef = useRef(opts.onWake);
  onWakeRef.current = opts.onWake;

  useEffect(() => {
    if (!opts.enabled) return;
    let cancelled = false;
    let model: Model | null = null;
    let recognizer: KaldiRecognizer | null = null;
    let engine: { onmessage: (e: MessageEvent) => void } | null = null;
    let lastWakeAt = 0;

    const heardWake = (text: string) => {
      // Require "vibe" as a standalone token (not a substring), so partial
      // mis-decodes of ambient noise can't trip the wake word.
      if (!text.trim().split(/\s+/).includes("vibe")) return;
      const now = Date.now();
      if (now - lastWakeAt < WAKE_DEBOUNCE_MS) return;
      lastWakeAt = now;
      onWakeRef.current();
    };

    (async () => {
      try {
        const m = await createModel(MODEL_URL);
        if (cancelled) { m.terminate(); return; }
        model = m;
        recognizer = new m.KaldiRecognizer(SAMPLE_RATE, WAKE_GRAMMAR);
        // Only act on finalized results, never partials: streaming partials
        // constantly mis-fit ambient noise to "vibe", which made Vibe look like
        // it was always listening. A final result has enough context to trust.
        recognizer.on("result", (msg) => {
          const r = (msg as { result?: { text?: string } }).result;
          if (r?.text) heardWake(r.text);
        });

        const rec = recognizer;
        engine = {
          onmessage: (e: MessageEvent<{ command: string; inputFrame: Int16Array }>) => {
            if (e.data.command !== "process") return;
            const int16 = e.data.inputFrame;
            const f32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
            rec.acceptWaveformFloat(f32, SAMPLE_RATE);
          },
        };
        await WebVoiceProcessor.subscribe(engine);
      } catch (e) {
        // Missing model file / mic denied → hotkey-only mode.
        console.warn("[vibe] wake word unavailable:", e);
      }
    })();
    return () => {
      cancelled = true;
      if (engine) void WebVoiceProcessor.unsubscribe(engine);
      recognizer?.remove();
      model?.terminate();
    };
  }, [opts.enabled]);

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
