import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../settings/settingsStore";
import { VibePet, type VibeState } from "./VibePet";
import { useVoicePipeline } from "./useVoicePipeline";
import { runAgent } from "./agentLoop";
import { transcribe, chat, type ChatMessage } from "./groq";
import { useVibeCommand, type ToolDef } from "./commands";
import { speak, cancelSpeech } from "./speech";

const CAPTION_MS = 5000;
/** Max chained "Vibe asks, user answers" rounds per conversation. */
const MAX_FOLLOW_UPS = 2;

/** "Ctrl+Shift+V" → matcher for keydown events. */
function matchesHotkey(e: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey.toLowerCase().split("+").map((p) => p.trim());
  const key = parts.filter((p) => !["ctrl", "shift", "alt", "meta"].includes(p))[0] ?? "";
  return (
    e.key.toLowerCase() === key &&
    e.ctrlKey === parts.includes("ctrl") &&
    e.shiftKey === parts.includes("shift") &&
    e.altKey === parts.includes("alt") &&
    e.metaKey === parts.includes("meta")
  );
}

export function VibeAgent() {
  const vibe = useSettingsStore((s) => s.settings.vibe);
  const [state, setState] = useState<VibeState>("idle");
  const [caption, setCaption] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const busy = useRef(false);
  const captionTimer = useRef<number | null>(null);
  const conversation = useRef<ChatMessage[] | null>(null);
  const followUps = useRef(0);
  const sleepRequested = useRef(false);

  const showCaption = (text: string, ms = CAPTION_MS) => {
    setCaption(text);
    if (captionTimer.current) window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => setCaption(null), ms);
  };

  const fail = (message: string) => {
    conversation.current = null;
    followUps.current = 0;
    setState("error");
    showCaption(message);
    void speak(message, vibe.voice).then(() => setState("idle"));
  };

  useVibeCommand({
    name: "go_to_sleep",
    description:
      "Put Vibe (yourself) to sleep: stop listening for the wake word until woken by a click or the hotkey. Use when the user says 'go to sleep' or asks for quiet.",
    run: () => {
      sleepRequested.current = true;
      return "Going to sleep.";
    },
  });

  const fallAsleep = () => {
    sleepRequested.current = false;
    conversation.current = null;
    followUps.current = 0;
    setSleeping(true);
    setState("sleeping");
    showCaption("Zzz… (click me or press the hotkey to wake me)", 8000);
  };

  const wakeUp = () => {
    setSleeping(false);
    setState("idle");
    showCaption("I'm awake! Say \"Vibe\" or click me when you need something.");
  };

  const runUtterance = async (transcript: string) => {
    if (!vibe.groqApiKey) { fail("I need a Groq API key — check Settings."); return; }
    setState("thinking");
    showCaption(`"${transcript}"`);
    try {
      const { text, messages } = await runAgent(
        transcript,
        (msgs: ChatMessage[], tools: ToolDef[]) => chat(msgs, tools, vibe.groqApiKey),
        conversation.current ?? undefined
      );

      if (sleepRequested.current) {
        showCaption(text);
        await speak(text, vibe.voice);
        fallAsleep();
        return;
      }

      const isQuestion = text.trim().endsWith("?") && followUps.current < MAX_FOLLOW_UPS;
      setState("speaking");
      if (!isQuestion) {
        setCelebrating(true);
        window.setTimeout(() => setCelebrating(false), 1200);
      }
      showCaption(text, isQuestion ? 20000 : CAPTION_MS);
      await speak(text, vibe.voice);

      if (isQuestion) {
        // Vibe asked something — keep the conversation and listen for the answer.
        conversation.current = messages;
        followUps.current += 1;
        await listenForAnswer();
      } else {
        conversation.current = null;
        followUps.current = 0;
        setState("idle");
      }
    } catch (e) {
      fail(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  /** Capture + transcribe one utterance; empty result returns null after captioning. */
  const captureTranscript = async (): Promise<string | null> => {
    setState("listening");
    const wav = await pipeline.capture();
    if (!wav) { setState("idle"); showCaption("I didn't catch that."); return null; }
    setState("thinking");
    const transcript = await transcribe(wav, vibe.groqApiKey);
    if (!transcript) { setState("idle"); showCaption("I didn't catch that."); return null; }
    return transcript;
  };

  /** Continuation listen (inside an ongoing conversation; busy stays held). */
  const listenForAnswer = async () => {
    const transcript = await captureTranscript();
    if (transcript === null) {
      conversation.current = null;
      followUps.current = 0;
      return;
    }
    await runUtterance(transcript);
  };

  // busy lives ONLY here: set on entry, cleared in finally on every path,
  // so a failed turn can never leave the pet stuck.
  const listen = async () => {
    if (sleeping) { wakeUp(); return; }
    if (busy.current) return;
    busy.current = true;
    cancelSpeech();
    conversation.current = null;
    followUps.current = 0;
    showCaption("Listening…", 20000);
    try {
      const transcript = await captureTranscript();
      if (transcript === null) return;
      if (!vibe.groqApiKey) { fail("I need a Groq API key — check Settings."); return; }
      await runUtterance(transcript);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      busy.current = false;
    }
  };

  const pipeline = useVoicePipeline({
    enabled: vibe.enabled && !sleeping,
    onWake: () => { void listen(); },
  });

  // In-app push-to-talk hotkey (also wakes a sleeping pet).
  useEffect(() => {
    if (!vibe.enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (matchesHotkey(e, vibe.hotkey)) { e.preventDefault(); void listen(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vibe.enabled, vibe.hotkey, vibe.groqApiKey, sleeping]);

  // Dev escape hatch: drive the full agent loop from the console without a mic:
  //   window.__vibeSay("open a terminal")
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__vibeSay = (t: string) => void runUtterance(t);
    return () => { delete (window as unknown as Record<string, unknown>).__vibeSay; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vibe.groqApiKey, vibe.voice]);

  if (!vibe.enabled) return null;

  return (
    <VibePet
      state={state}
      caption={caption}
      celebrating={celebrating}
      onActivate={() => void listen()}
    />
  );
}
