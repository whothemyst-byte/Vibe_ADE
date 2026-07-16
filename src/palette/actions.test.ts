import { describe, expect, it, vi } from "vitest";
import { buildActions, type PaletteDeps } from "./actions";
import type { Card } from "../wall/cardStore";
import { THEMES } from "../settings/themes";

function deps(overrides?: Partial<PaletteDeps>): PaletteDeps {
  return {
    presets: [
      { id: "plain", label: "Plain shell", icon: "▷" },
      { id: "claude", label: "Claude Code", icon: "✦", command: "claude" },
    ],
    walls: [
      { id: "w1", name: "alpha", path: "", updatedAt: 0, isCurrent: false },
      { id: "w2", name: "beta", path: "", updatedAt: 0, isCurrent: false },
    ],
    currentWallId: "w1",
    cards: [],
    launchPreset: vi.fn(),
    launchBrowser: vi.fn(),
    openMusic: vi.fn(),
    runBootRecipe: vi.fn(),
    openTasks: vi.fn(),
    openTeams: vi.fn(),
    openDesign: vi.fn(),
    openSettings: vi.fn(),
    openExplorer: vi.fn(),
    exitWall: vi.fn(),
    switchWall: vi.fn(),
    selectTool: vi.fn(),
    applyTheme: vi.fn(),
    focusTerminal: vi.fn(),
    closeBrowser: vi.fn(),
    closeMusic: vi.fn(),
    nextStation: vi.fn(),
    ...overrides,
  };
}

const terminal = (id: string, name: string, run?: string): Card => ({
  kind: "terminal", id, name, x: 0, y: 0, w: 1, h: 1, presetId: "plain", cwd: "", run,
});
const browser: Card = { kind: "browser", id: "wall-browser", url: "https://x.dev", x: 0, y: 0, w: 1, h: 1 };
const music: Card = { kind: "music", id: "wall-music", stationId: "groove-salad", url: "https://s.fm", x: 0, y: 0, w: 1, h: 1 };

describe("buildActions", () => {
  it("creates one launch action per preset plus the browser and music player", () => {
    const d = deps();
    const a = buildActions(d);
    const launch = a.filter((x) => x.section === "Launch");
    expect(launch.map((x) => x.id)).toEqual(["launch:plain", "launch:claude", "launch:browser", "launch:music"]);
    launch[1].run();
    expect(d.launchPreset).toHaveBeenCalledWith("claude");
  });

  it("offers the boot recipe only when a terminal has a saved startup command", () => {
    expect(buildActions(deps({ cards: [terminal("t1", "Ada")] })).some((x) => x.id === "launch:recipe")).toBe(false);
    const d = deps({ cards: [terminal("t1", "Ada", "npm run dev")] });
    const recipe = buildActions(d).find((x) => x.id === "launch:recipe");
    recipe!.run();
    expect(d.runBootRecipe).toHaveBeenCalled();
  });

  it("offers switching to every wall except the current one", () => {
    const d = deps();
    const ids = buildActions(d).map((x) => x.id);
    expect(ids).toContain("nav:switch:w2");
    expect(ids).not.toContain("nav:switch:w1");
  });

  it("exposes all 12 canvas tools with their shortcut hints", () => {
    const tools = buildActions(deps()).filter((x) => x.section === "Tools");
    expect(tools).toHaveLength(12);
    expect(tools[0].shortcut).toBe("V");
  });

  it("adds focus actions for open terminals and close-browser only when open", () => {
    const bare = buildActions(deps());
    expect(bare.some((x) => x.id === "win:close-browser")).toBe(false);

    const d = deps({ cards: [terminal("t1", "Ada"), browser] });
    const a = buildActions(d);
    const focus = a.find((x) => x.id === "win:focus:t1");
    expect(focus?.label).toBe("Focus Ada");
    focus!.run();
    expect(d.focusTerminal).toHaveBeenCalledWith("t1");
    expect(a.some((x) => x.id === "win:close-browser")).toBe(true);
  });

  it("adds close-music and next-station only while the music card is open", () => {
    const bare = buildActions(deps()).map((x) => x.id);
    expect(bare).not.toContain("win:close-music");
    expect(bare).not.toContain("win:next-station");

    const d = deps({ cards: [music] });
    const a = buildActions(d);
    a.find((x) => x.id === "win:next-station")!.run();
    expect(d.nextStation).toHaveBeenCalled();
    a.find((x) => x.id === "win:close-music")!.run();
    expect(d.closeMusic).toHaveBeenCalled();
  });

  it("exposes every theme, scenes included, and applies via the callback", () => {
    const d = deps();
    const themes = buildActions(d).filter((x) => x.section === "Theme");
    expect(themes.map((x) => x.id)).toEqual(THEMES.map((t) => `theme:${t.id}`));
    themes[0].run();
    expect(d.applyTheme).toHaveBeenCalledWith(THEMES[0]);
  });
});
