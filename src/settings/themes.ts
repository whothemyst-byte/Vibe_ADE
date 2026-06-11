import type { Background } from "../store/types";

/** A pre-made wall theme: a background plus a preview palette for the card. */
export type Theme = {
  id: string;
  name: string;
  tagline: string;
  background: Background;
  /** Decorative swatch dots shown on the preview card. */
  palette: string[];
};

export const THEMES: Theme[] = [
  {
    id: "ember",
    name: "Ember",
    tagline: "quansynd · warm dark",
    background: { kind: "color", color: "#12110f" },
    palette: ["#d79a3d", "#b1a692", "#7fa55a", "#c0563f", "#f3eee5"],
  },
  {
    id: "midnight",
    name: "Midnight",
    tagline: "cool night · focused",
    background: { kind: "color", color: "#0c0f14" },
    palette: ["#5d8fb3", "#8aa7bd", "#3d5a73", "#d79a3d", "#e8edf2"],
  },
  {
    id: "parchment",
    name: "Parchment",
    tagline: "paper studio · daylight",
    background: { kind: "color", color: "#f3ead8" },
    palette: ["#b8802b", "#6f6960", "#7fa55a", "#c0563f", "#2a2620"],
  },
  {
    id: "moss",
    name: "Moss",
    tagline: "herbarium · quiet green",
    background: { kind: "color", color: "#0f1410" },
    palette: ["#7fa55a", "#a8c08a", "#4a6b3a", "#d79a3d", "#e9efe2"],
  },
  {
    id: "plum",
    name: "Plum",
    tagline: "dusk · moody",
    background: { kind: "color", color: "#15101a" },
    palette: ["#9a7ab0", "#c4a8d4", "#5d4a73", "#d79a3d", "#efe8f2"],
  },
  {
    id: "slate",
    name: "Slate",
    tagline: "graphite · neutral",
    background: { kind: "color", color: "#141417" },
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
