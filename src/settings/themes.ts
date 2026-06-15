import type { Background } from "../store/types";

/** A pre-made wall theme: a background plus a preview palette for the card. */
export type Theme = {
  id: string;
  name: string;
  tagline: string;
  background: Background;
  /** Drives every accent in the UI (buttons, highlights, focus rings). */
  accent: string;
  /** Decorative swatch dots shown on the preview card. */
  palette: string[];
};

/** Accent used when no theme matches (custom backgrounds) — quansynd amber. */
export const DEFAULT_ACCENT = "#d79a3d";

export const THEMES: Theme[] = [
  {
    id: "ember",
    name: "Ember",
    tagline: "quansynd · warm dark",
    background: { kind: "color", color: "#12110f" },
    accent: "#d79a3d",
    palette: ["#d79a3d", "#b1a692", "#7fa55a", "#c0563f", "#f3eee5"],
  },
  {
    id: "midnight",
    name: "Midnight",
    tagline: "cool night · focused",
    background: { kind: "color", color: "#0c0f14" },
    accent: "#5d8fb3",
    palette: ["#5d8fb3", "#8aa7bd", "#3d5a73", "#d79a3d", "#e8edf2"],
  },
  {
    id: "parchment",
    name: "Parchment",
    tagline: "paper studio · daylight",
    background: { kind: "color", color: "#f3ead8" },
    accent: "#b8802b",
    palette: ["#b8802b", "#6f6960", "#7fa55a", "#c0563f", "#2a2620"],
  },
  {
    id: "moss",
    name: "Moss",
    tagline: "herbarium · quiet green",
    background: { kind: "color", color: "#0f1410" },
    accent: "#7fa55a",
    palette: ["#7fa55a", "#a8c08a", "#4a6b3a", "#d79a3d", "#e9efe2"],
  },
  {
    id: "plum",
    name: "Plum",
    tagline: "dusk · moody",
    background: { kind: "color", color: "#15101a" },
    accent: "#9a7ab0",
    palette: ["#9a7ab0", "#c4a8d4", "#5d4a73", "#d79a3d", "#efe8f2"],
  },
  {
    id: "slate",
    name: "Slate",
    tagline: "graphite · neutral",
    background: { kind: "color", color: "#141417" },
    accent: "#8a8a92",
    palette: ["#8a8a92", "#b8b8c0", "#55555e", "#d79a3d", "#ededf0"],
  },
];

/** True when the wall's background matches a theme (color themes only). */
export function isThemeActive(bg: Background, theme: Theme): boolean {
  return (
    bg.kind === "color" &&
    theme.background.kind === "color" &&
    bg.color.toLowerCase() === theme.background.color.toLowerCase()
  );
}

/** The accent a background should use — its theme's, or the default for custom. */
export function accentForBackground(bg: Background): string {
  return THEMES.find((t) => isThemeActive(bg, t))?.accent ?? DEFAULT_ACCENT;
}

/** Readable text color (#rrggbb) to lay on top of a filled accent button. */
function onAccentText(accent: string): string {
  const n = parseInt(accent.slice(1), 16);
  if (Number.isNaN(n)) return "#20170a";
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // Dark ink on light/mid accents; near-white on dark accents.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? "#20170a" : "#fbf6ec";
}

/**
 * Drives the whole UI accent from one color. theme.css derives --accent-hover,
 * --accent-dim, --accent-soft and --focus from --accent via color-mix, so setting
 * these two custom properties recolors every button, highlight, and focus ring.
 */
export function applyAccent(accent: string): void {
  const root = document.documentElement;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--on-accent", onAccentText(accent));
}
