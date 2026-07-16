import type { Background } from "../store/types";

/** A pre-made wall theme: a background plus the accent it drives. */
export type Theme = {
  id: string;
  name: string;
  tagline: string;
  background: Background;
  /** Drives every accent in the UI (buttons, highlights, focus rings). */
  accent: string;
};

/** Accent used when no theme matches (custom backgrounds) — quansynd amber. */
export const DEFAULT_ACCENT = "#d79a3d";

const DARK_BG = "#12110f";
const LIGHT_BG = "#f3ead8";
const DARK_ACCENT = "#d79a3d";
const LIGHT_ACCENT = "#b8802b";

const prefersDark = () =>
  typeof matchMedia === "undefined" || matchMedia("(prefers-color-scheme: dark)").matches;

/** Appearance: solid dark/light backgrounds. "System" resolves to whichever matches the OS at click time. */
export const APPEARANCE_THEMES: Theme[] = [
  {
    id: "dark",
    name: "Dark",
    tagline: "warm dark",
    background: { kind: "color", color: DARK_BG },
    accent: DARK_ACCENT,
  },
  {
    id: "light",
    name: "Light",
    tagline: "warm daylight",
    background: { kind: "color", color: LIGHT_BG },
    accent: LIGHT_ACCENT,
  },
  {
    id: "system",
    name: "System",
    tagline: "match your OS",
    background: { kind: "color", color: prefersDark() ? DARK_BG : LIGHT_BG },
    accent: prefersDark() ? DARK_ACCENT : LIGHT_ACCENT,
  },
];

/** Bundled pixel-art scenes, rendered by scripts/render-scenes.mjs. Each accent
    is sampled from its own artwork so the whole UI recolors with the scene. */
export const SCENE_THEMES: Theme[] = [
  { id: "amber-dunes", name: "Amber Dunes", tagline: "desert dusk", background: { kind: "image", url: "/themes/scenes/amber-dunes.png" }, accent: "#e8b95f" },
  { id: "meadow-night", name: "Meadow Night", tagline: "fireflies at dark", background: { kind: "image", url: "/themes/scenes/meadow-night.png" }, accent: "#e8c060" },
  { id: "campfire", name: "Campfire", tagline: "forest firelight", background: { kind: "image", url: "/themes/scenes/campfire.png" }, accent: "#e07830" },
  { id: "harvest", name: "Harvest", tagline: "golden field", background: { kind: "image", url: "/themes/scenes/harvest.png" }, accent: "#d79a3d" },
  { id: "lantern-harbor", name: "Lantern Harbor", tagline: "docks at night", background: { kind: "image", url: "/themes/scenes/lantern-harbor.png" }, accent: "#ffbe5c" },
  { id: "canyon-dusk", name: "Canyon Dusk", tagline: "mesa first stars", background: { kind: "image", url: "/themes/scenes/canyon-dusk.png" }, accent: "#e8a050" },
  { id: "ember-city", name: "Ember City", tagline: "warm-lit skyline", background: { kind: "image", url: "/themes/scenes/ember-city.png" }, accent: "#e8b45c" },
  { id: "tea-room", name: "Tea Room", tagline: "cozy window light", background: { kind: "image", url: "/themes/scenes/tea-room.png" }, accent: "#d8a55f" },
];

/** Premade looping video backgrounds, bundled under public/themes/. */
export const VIDEO_THEMES: Theme[] = [
  {
    id: "room",
    name: "Room",
    tagline: "pixel bedroom loop",
    background: { kind: "video", url: "/themes/room.mp4" },
    accent: DEFAULT_ACCENT,
  },
  {
    id: "moody-night",
    name: "Moody Night",
    tagline: "snowy nightlight",
    background: { kind: "video", url: "/themes/moody_night.mp4" },
    accent: DEFAULT_ACCENT,
  },
  {
    id: "japanese-day",
    name: "Japanese Day",
    tagline: "sakura daylight",
    background: { kind: "video", url: "/themes/Japanese_Day_Theme.mp4" },
    accent: DEFAULT_ACCENT,
  },
  {
    id: "japanese-night",
    name: "Japanese Night",
    tagline: "sakura moonlight",
    background: { kind: "video", url: "/themes/Japanese_Night_Theme.mp4" },
    accent: DEFAULT_ACCENT,
  },
  {
    id: "candlelit-room",
    name: "Candlelit Room",
    tagline: "cozy night window",
    background: { kind: "video", url: "/themes/Candlelit_Room.mp4" },
    accent: DEFAULT_ACCENT,
  },
  {
    id: "rain-window",
    name: "Rain Window",
    tagline: "quiet watch, rainfall",
    background: { kind: "video", url: "/themes/Rain_Window.mp4" },
    accent: DEFAULT_ACCENT,
  },
  {
    id: "neon-rooftop",
    name: "Neon Rooftop",
    tagline: "cyberpunk skyline",
    background: { kind: "video", url: "/themes/Neon_Rooftop.mp4" },
    accent: DEFAULT_ACCENT,
  },
  {
    id: "neon-street",
    name: "Neon Street",
    tagline: "synthwave night",
    background: { kind: "video", url: "/themes/Neon_Street.mp4" },
    accent: DEFAULT_ACCENT,
  },
];

export const THEMES: Theme[] = [...APPEARANCE_THEMES, ...SCENE_THEMES, ...VIDEO_THEMES];

/** True when the wall's background matches a theme (by color, or by video/image src). */
export function isThemeActive(bg: Background, theme: Theme): boolean {
  if (bg.kind === "color" && theme.background.kind === "color") {
    return bg.color.toLowerCase() === theme.background.color.toLowerCase();
  }
  if (bg.kind === theme.background.kind && (bg.kind === "video" || bg.kind === "image")) {
    const a = "url" in bg ? bg.url : undefined;
    const b = "url" in theme.background ? theme.background.url : undefined;
    return a != null && a === b;
  }
  return false;
}

/** The accent a background should use — its theme's, or the default for custom. */
export function accentForBackground(bg: Background): string {
  return THEMES.find((t) => isThemeActive(bg, t))?.accent ?? DEFAULT_ACCENT;
}

/** Readable text color (#rrggbb) to lay on top of a filled color. */
export function readableTextColor(color: string): string {
  const n = parseInt(color.slice(1), 16);
  if (Number.isNaN(n)) return "#20170a";
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // Dark ink on light/mid colors; near-white on dark colors.
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
  root.style.setProperty("--on-accent", readableTextColor(accent));
}

/** Default title bar ink — matches the app's static --text; used outside a wall and for image/video walls. */
const DEFAULT_CHROME_INK = "#f3eee5";

/**
 * Sets --titlebar-ink to a readable color for whatever's actually behind the
 * glassy title bar: dark ink on a light solid-color wall (e.g. the Light
 * theme), light ink on a dark one. Image/video walls fall back to the
 * default light ink — sampling a live video frame for this is the kind of
 * complexity this cosmetic bar isn't worth (most premade video themes are
 * dark/moody anyway).
 */
export function applyChromeInk(background: Background | null): void {
  const ink = background?.kind === "color" ? readableTextColor(background.color) : DEFAULT_CHROME_INK;
  document.documentElement.style.setProperty("--titlebar-ink", ink);
}

