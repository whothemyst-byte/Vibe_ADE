import { useEffect, useState } from "react";
import type { VibeState } from "./VibePet";
import { terminalsOf, useCardStore } from "../wall/cardStore";
import { DEFAULT_PRESETS } from "../wall/presets";
import { buildHints } from "./hints";
import "./HintPill.css";

const ROTATE_MS = 8000;

/**
 * Bottom-center voice pill. Idle: cycles "Try …" hints. Listening: mic
 * animation. Otherwise: the current caption (transcript / reply) from
 * VibeAgent's state machine — the pill renders state, it owns none.
 */
export function HintPill({ state, caption }: { state: VibeState; caption: string | null }) {
  const cards = useCardStore((s) => s.cards);
  const [i, setI] = useState(0);

  const hints = buildHints(
    terminalsOf(cards).map((t) => t.name),
    DEFAULT_PRESETS.map((p) => p.label)
  );

  useEffect(() => {
    const t = window.setInterval(() => setI((n) => n + 1), ROTATE_MS);
    return () => window.clearInterval(t);
  }, []);

  if (state === "sleeping") return null;

  const listening = state === "listening";
  const text = listening
    ? "Listening…"
    : caption ?? hints[i % Math.max(hints.length, 1)] ?? "";
  if (!text) return null;

  return (
    <div className={`hint-pill ${listening ? "hint-pill--listening" : ""} ${caption ? "hint-pill--active" : ""}`}>
      <span className="hint-pill-dot" aria-hidden />
      <span className="hint-pill-text">{text}</span>
    </div>
  );
}
