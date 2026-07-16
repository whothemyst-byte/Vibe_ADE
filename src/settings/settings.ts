import { DEFAULT_BACKGROUND, type Background } from "../store/types";

export type Settings = {
  terminal: { fontSize: number; scrollback: number; shell: string; glossy: boolean };
  canvas: { defaultBackground: Background; minimap: boolean };
  vibe: {
    enabled: boolean;
    groqApiKey: string;
    hotkey: string;
    voice: string;
    deviceId: string;
    /** How dictated agent prompts arrive: the user's exact words, or rewritten by the model. */
    dictation: "shaped" | "verbatim";
  };
};

export const DEFAULT_SETTINGS: Settings = {
  terminal: { fontSize: 13, scrollback: 5000, shell: "powershell.exe", glossy: true },
  canvas: { defaultBackground: DEFAULT_BACKGROUND, minimap: true },
  vibe: { enabled: false, groqApiKey: "", hotkey: "Ctrl+Shift+V", voice: "", deviceId: "", dictation: "shaped" },
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function isBackground(v: unknown): v is Background {
  if (!isRecord(v)) return false;
  if (v.kind === "color") return typeof v.color === "string";
  if (v.kind === "image" || v.kind === "video") return typeof v.path === "string";
  return false;
}

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === "string" && v.length > 0 ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/**
 * Field-by-field overlay of a loaded settings.json onto DEFAULT_SETTINGS.
 * Wrongly-typed fields fall back to defaults and unknown keys are dropped, so
 * old or hand-edited files can never break the app.
 */
export function mergeSettings(raw: unknown): Settings {
  const r = isRecord(raw) ? raw : {};
  const term = isRecord(r.terminal) ? r.terminal : {};
  const canvas = isRecord(r.canvas) ? r.canvas : {};
  const vibe = isRecord(r.vibe) ? r.vibe : {};
  const d = DEFAULT_SETTINGS;
  return {
    terminal: {
      fontSize: num(term.fontSize, d.terminal.fontSize),
      scrollback: num(term.scrollback, d.terminal.scrollback),
      shell: str(term.shell, d.terminal.shell),
      glossy: bool(term.glossy, d.terminal.glossy),
    },
    canvas: {
      defaultBackground: isBackground(canvas.defaultBackground)
        ? canvas.defaultBackground
        : d.canvas.defaultBackground,
      minimap: bool(canvas.minimap, d.canvas.minimap),
    },
    vibe: {
      enabled: bool(vibe.enabled, d.vibe.enabled),
      groqApiKey: typeof vibe.groqApiKey === "string" ? vibe.groqApiKey : d.vibe.groqApiKey,
      hotkey: str(vibe.hotkey, d.vibe.hotkey),
      voice: typeof vibe.voice === "string" ? vibe.voice : d.vibe.voice,
      deviceId: typeof vibe.deviceId === "string" ? vibe.deviceId : d.vibe.deviceId,
      dictation: vibe.dictation === "verbatim" ? "verbatim" : "shaped",
    },
  };
}
