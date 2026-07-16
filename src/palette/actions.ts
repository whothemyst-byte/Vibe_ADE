import type { Preset } from "../wall/presets";
import type { WallMeta } from "../store/types";
import { terminalsOf, type Card } from "../wall/cardStore";
import { TOOLS, type ToolDef } from "../wall/tools";
import { recipeEntries } from "../wall/recipe";
import { THEMES, type Theme } from "../settings/themes";

export type PaletteSection = "Launch" | "Navigate" | "Tools" | "Windows" | "Theme";

export type PaletteAction = {
  id: string;
  label: string;
  /** Extra search terms beyond the label. */
  keywords: string[];
  section: PaletteSection;
  /** Display-only hint (e.g. a canvas tool's single key). */
  shortcut?: string;
  run: () => void;
};

/** Everything the registry needs, passed explicitly so it stays a pure function. */
export type PaletteDeps = {
  presets: Preset[];
  walls: WallMeta[];
  currentWallId: string;
  cards: Card[];
  launchPreset: (presetId: string) => void;
  launchBrowser: () => void;
  openMusic: () => void;
  runBootRecipe: () => void;
  openTasks: () => void;
  openTeams: () => void;
  openDesign: () => void;
  openSettings: () => void;
  openExplorer: () => void;
  exitWall: () => void;
  switchWall: (id: string) => void;
  selectTool: (tool: ToolDef) => void;
  applyTheme: (theme: Theme) => void;
  focusTerminal: (id: string) => void;
  closeBrowser: () => void;
  closeMusic: () => void;
  nextStation: () => void;
};

export function buildActions(d: PaletteDeps): PaletteAction[] {
  const actions: PaletteAction[] = [];

  for (const p of d.presets) {
    actions.push({
      id: `launch:${p.id}`,
      label: `New ${p.label} terminal`,
      keywords: ["launch", "open", "terminal", p.label],
      section: "Launch",
      run: () => d.launchPreset(p.id),
    });
  }
  actions.push({
    id: "launch:browser",
    label: "Open browser",
    keywords: ["launch", "web", "browser"],
    section: "Launch",
    run: d.launchBrowser,
  });
  actions.push({
    id: "launch:music",
    label: "Open music player",
    keywords: ["launch", "music", "radio", "focus", "station", "play"],
    section: "Launch",
    run: d.openMusic,
  });
  if (recipeEntries(d.cards).length) {
    actions.push({
      id: "launch:recipe",
      label: "Run boot recipe",
      keywords: ["launch", "boot", "recipe", "startup", "dev server", "replay"],
      section: "Launch",
      run: d.runBootRecipe,
    });
  }

  actions.push(
    { id: "nav:tasks", label: "Open Taskboard", keywords: ["navigate", "tasks", "board"], section: "Navigate", run: d.openTasks },
    { id: "nav:teams", label: "Open Teams", keywords: ["navigate", "teams", "org", "collab"], section: "Navigate", run: d.openTeams },
    { id: "nav:design", label: "Open UI Design", keywords: ["navigate", "design", "figma", "canvas"], section: "Navigate", run: d.openDesign },
    { id: "nav:settings", label: "Open Settings", keywords: ["navigate", "settings", "background", "theme", "preferences"], section: "Navigate", run: d.openSettings },
    { id: "nav:explorer", label: "Open File Explorer", keywords: ["navigate", "files", "folder", "explorer"], section: "Navigate", run: d.openExplorer },
    { id: "nav:exit", label: "Back to all spaces", keywords: ["navigate", "exit", "start", "home", "spaces"], section: "Navigate", run: d.exitWall },
  );
  for (const w of d.walls) {
    if (w.id === d.currentWallId) continue;
    actions.push({
      id: `nav:switch:${w.id}`,
      label: `Switch to ${w.name}`,
      keywords: ["navigate", "switch", "space", "wall", w.name],
      section: "Navigate",
      run: () => d.switchWall(w.id),
    });
  }

  for (const t of TOOLS) {
    actions.push({
      id: `tool:${t.type}`,
      label: `Tool: ${t.label}`,
      keywords: ["tool", "canvas", "draw", t.label],
      section: "Tools",
      shortcut: t.shortcut,
      run: () => d.selectTool(t),
    });
  }

  for (const t of terminalsOf(d.cards)) {
    actions.push({
      id: `win:focus:${t.id}`,
      label: `Focus ${t.name}`,
      keywords: ["window", "focus", "terminal", "agent", t.name],
      section: "Windows",
      run: () => d.focusTerminal(t.id),
    });
  }
  if (d.cards.some((c) => c.kind === "browser")) {
    actions.push({
      id: "win:close-browser",
      label: "Close browser",
      keywords: ["window", "close", "browser"],
      section: "Windows",
      run: d.closeBrowser,
    });
  }
  if (d.cards.some((c) => c.kind === "music")) {
    actions.push(
      {
        id: "win:next-station",
        label: "Next station",
        keywords: ["window", "music", "station", "change", "radio"],
        section: "Windows",
        run: d.nextStation,
      },
      {
        id: "win:close-music",
        label: "Close music player",
        keywords: ["window", "close", "music", "stop", "radio"],
        section: "Windows",
        run: d.closeMusic,
      },
    );
  }

  for (const t of THEMES) {
    actions.push({
      id: `theme:${t.id}`,
      label: `Theme: ${t.name}`,
      keywords: ["theme", "background", "scene", "appearance", t.tagline],
      section: "Theme",
      run: () => d.applyTheme(t),
    });
  }

  return actions;
}
