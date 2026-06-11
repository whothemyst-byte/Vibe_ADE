import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../settings/settingsStore";
import { VibePet, type VibeState } from "./VibePet";
import { useVoicePipeline } from "./useVoicePipeline";
import { runAgent } from "./agentLoop";
import { transcribe, chat, type ChatMessage } from "./groq";
import type { ToolDef } from "./commands";
import { speak, cancelSpeech } from "./speech";

const CAPTION_MS = 5000;

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
  const busy = useRef(false);
  const captionTimer = useRef<number | null>(null);

  const showCaption = (text: string, ms = CAPTION_MS) => {
    setCaption(text);
    if (captionTimer.current) window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => setCaption(null), ms);
  };

  const fail = (message: string) => {
    setState("error");
    showCaption(message);
    void speak(message).then(() => setState("idle"));
  };

  const runUtterance = async (transcript: string) => {
    if (!vibe.groqApiKey) { fail("I need a Groq API key — check Settings."); return; }
    setState("thinking");
    showCaption(`"${transcript}"`);
    try {
      const reply = await runAgent(transcript, (messages: ChatMessage[], tools: ToolDef[]) =>
        chat(messages, tools, vibe.groqApiKey)
      );
      setState("speaking");
      setCelebrating(true);
      window.setTimeout(() => setCelebrating(false), 1200);
      showCaption(reply);
      await speak(reply);
      setState("idle");
    } catch (e) {
      fail(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  // busy lives ONLY here: set on entry, cleared in finally on every path,
  // so a failed turn can never leave the pet stuck.
  const listen = async () => {
    if (busy.current) return;
    busy.current = true;
    cancelSpeech();
    setState("listening");
    showCaption("Listening…", 20000);
    try {
      const wav = await pipeline.capture();
      if (!wav) { setState("idle"); showCaption("I didn't catch that."); return; }
      if (!vibe.groqApiKey) { fail("I need a Groq API key — check Settings."); return; }
      setState("thinking");
      const transcript = await transcribe(wav, vibe.groqApiKey);
      if (!transcript) { setState("idle"); showCaption("I didn't catch that."); return; }
      await runUtterance(transcript);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      busy.current = false;
    }
  };

  const pipeline = useVoicePipeline({
    enabled: vibe.enabled,
    picovoiceAccessKey: vibe.picovoiceAccessKey,
    onWake: () => { void listen(); },
  });

  // In-app push-to-talk hotkey.
  useEffect(() => {
    if (!vibe.enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (matchesHotkey(e, vibe.hotkey)) { e.preventDefault(); void listen(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vibe.enabled, vibe.hotkey, vibe.groqApiKey]);

  // Dev escape hatch: drive the full agent loop from the console without a mic:
  //   window.__vibeSay("open a terminal")
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__vibeSay = (t: string) => void runUtterance(t);
    return () => { delete (window as unknown as Record<string, unknown>).__vibeSay; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vibe.groqApiKey]);

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
