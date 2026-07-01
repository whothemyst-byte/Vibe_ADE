import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import "./excalidraw-skin.css";
import { Toolbar } from "./Toolbar";
import { TerminalOverlay } from "./TerminalOverlay";
import { useCardStore, terminalsOf, type Card } from "./cardStore";
import { syncBrowserRect } from "./browserSync";
import { useBlocksBrowser } from "./browserVisibility";
import { BROWSER_ID, browserCard, closeBrowser, openBrowser } from "./browserActions";
import { removeCardWithFade } from "./removeCard";
import { browserBack, browserRead } from "../browser/client";
import { layerTransform, type Camera } from "./transform";
import { browserLayout, CELL, fitCamera, gridBBox, gridPositions, maximizeLayout, splitLayout } from "./gridLayout";
import { excalidrawCamera, excalidrawViewport, type AppStateLike } from "./excalidrawCamera";
import { loadWall, saveWall, saveThumbnail, loadIndex, saveIndex } from "../store/persistence";
import { DEFAULT_BACKGROUND, type WallDoc, type Background } from "../store/types";
import { WallBackground } from "./WallBackground";
import { SettingsModal } from "../settings/SettingsModal";
import { useSettingsStore } from "../settings/settingsStore";
import { LaunchMenu } from "./LaunchMenu";
import { FileExplorer } from "./FileExplorer";
import { ToolsIsland } from "./ToolsIsland";
import type { ToolDef } from "./tools";
import { usePresetStore } from "./presetStore";
import { pickAgentName } from "./agentNames";
import { wasSessionDead, sendToSession, focusSession } from "./sessions";
import { useVibeCommand } from "../vibe/commands";
import { useVibeContext } from "../vibe/context";
import { findPresetByPhrase } from "./presets";
import { THEMES, accentForBackground, applyAccent, syncTitlebar, DEFAULT_ACCENT } from "../settings/themes";
import { setPresenceSpace } from "../teams/presence";
import { useOrgStore } from "../teams/orgStore";
import { pushSharedScene } from "../teams/spaceSync";

const DEFAULT_CAMERA: Camera = { x: 0, y: 0, z: 1 };
const THUMB_INTERVAL_MS = 20_000;
/** "Focus <agent>" zooms in until the terminal fills the screen, capped here
    so xterm text doesn't scale into a blur. */
const FOCUS_MAX_ZOOM = 2;

function applyScene(
  api: ExcalidrawImperativeAPI,
  scene: { elements: unknown[]; appState: AppStateLike }
) {
  api.updateScene({
    elements: scene.elements as readonly ExcalidrawElement[],
    appState: {
      scrollX: scene.appState.scrollX,
      scrollY: scene.appState.scrollY,
      zoom: { value: scene.appState.zoom.value as NormalizedZoomValue },
    },
  });
}

export function WallView({ wallId, onExit, onSwitch, onDesign, onTasks, onTeams }: { wallId: string; onExit: () => void; onSwitch: (id: string) => void; onDesign: () => void; onTasks: () => void; onTeams: () => void }) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const cameraRef = useRef<Camera>(DEFAULT_CAMERA);
  const layerRef = useRef<HTMLDivElement>(null);
  const rafPending = useRef(false);
  const [activeType, setActiveType] = useState<string>("selection");
  const [background, setBackground] = useState<Background>(DEFAULT_BACKGROUND);
  const backgroundRef = useRef<Background>(DEFAULT_BACKGROUND);
  const [gearOpen, setGearOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  useBlocksBrowser(gearOpen);
  const pendingScene = useRef<{ elements: unknown[]; appState: AppStateLike } | null>(null);
  const presets = usePresetStore((s) => s.presets);
  const [wallPath, setWallPath] = useState("");
  const sharedRef = useRef<{ orgSpaceId: string; version: number } | null>(null);
  const [isShared, setIsShared] = useState(false);
  const [sharedNotice, setSharedNotice] = useState<string | null>(null);

  const saveTimer = useRef<number | null>(null);
  const savesEnabled = useRef(false);
  const lastThumbAt = useRef(0);

  const buildDoc = (): WallDoc | null => {
    const api = apiRef.current;
    if (!api) return null;
    const st = api.getAppState();
    const cards = useCardStore.getState().cards;
    const browser = cards.find((c) => c.kind === "browser");
    return {
      scene: {
        elements: [...api.getSceneElements()],
        appState: { scrollX: st.scrollX, scrollY: st.scrollY, zoom: st.zoom },
      },
      terminals: terminalsOf(cards).map(({ id, x, y, w, h, presetId, cwd, name }) => ({
        id, x, y, w, h, presetId, cwd, name,
      })),
      background: backgroundRef.current,
      gridAnchor: useCardStore.getState().anchor ?? undefined,
      browser: browser ? { url: browser.url, gridIndex: cards.indexOf(browser) } : undefined,
    };
  };

  const bumpLocalCloudVersion = async (version: number) => {
    const index = await loadIndex();
    await saveIndex(index.map((w) => (w.id === wallId ? { ...w, cloudVersion: version } : w)));
  };

  const pushShared = async (doc: WallDoc) => {
    const s = sharedRef.current;
    if (!s) return;
    try {
      const res = await pushSharedScene(s.orgSpaceId, s.version, doc);
      sharedRef.current = { orgSpaceId: s.orgSpaceId, version: res.version };
      await bumpLocalCloudVersion(res.version);
      if (res.status === "reloaded") {
        const api = apiRef.current;
        if (api) applyScene(api, { elements: res.doc.scene.elements, appState: res.doc.scene.appState as AppStateLike });
        backgroundRef.current = res.doc.background;
        setBackground(res.doc.background);
        applyAccent(accentForBackground(res.doc.background));
        syncTitlebar(res.doc.background);
        await saveWall(wallId, res.doc);
        setSharedNotice("Updated by a teammate — reloaded.");
        window.setTimeout(() => setSharedNotice(null), 4000);
      }
    } catch {
      /* sync is best-effort; local save already succeeded */
    }
  };

  const doSave = async (opts?: { thumbnail?: boolean }) => {
    const api = apiRef.current;
    const doc = buildDoc();
    if (!api || !doc) return;
    await saveWall(wallId, doc);
    // exportToBlob renders the whole scene - too expensive for every debounced
    // save, so throttle it (and force it once on exit).
    const wantThumb = opts?.thumbnail ?? Date.now() - lastThumbAt.current > THUMB_INTERVAL_MS;
    if (wantThumb) {
      lastThumbAt.current = Date.now();
      try {
        const blob = await exportToBlob({
          elements: [...api.getSceneElements()] as readonly ExcalidrawElement[],
          appState: { ...api.getAppState(), exportBackground: false },
          files: api.getFiles(),
          mimeType: "image/png",
          maxWidthOrHeight: 480,
        });
        await saveThumbnail(wallId, new Uint8Array(await blob.arrayBuffer()));
      } catch { /* thumbnail is best-effort */ }
    }
    const index = await loadIndex();
    await saveIndex(index.map((w) => (w.id === wallId ? { ...w, updatedAt: Date.now() } : w)));
    if (sharedRef.current) await pushShared(doc);
  };

  const scheduleSave = useCallback(() => {
    if (!savesEnabled.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void doSave(); }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallId]);

  useEffect(() => {
    savesEnabled.current = false;
    let cancelled = false;
    (async () => {
      const doc = await loadWall(wallId);
      if (cancelled) return;
      const bg = doc?.background ?? useSettingsStore.getState().settings.canvas.defaultBackground;
      backgroundRef.current = bg;
      setBackground(bg);
      applyAccent(accentForBackground(bg));
      syncTitlebar(bg);
      // Docs saved before agent names existed lack `name` - assign unique ones.
      // Terminals whose PTY died while this wall was closed are dropped.
      const names: string[] = [];
      const cards: Card[] = (doc?.terminals ?? [])
        .filter((t) => !wasSessionDead(t.id))
        .map((t) => {
          const name = t.name ?? pickAgentName(names);
          names.push(name);
          return { ...t, kind: "terminal" as const, name };
        });
      if (doc?.browser) {
        const i = Math.max(0, Math.min(doc.browser.gridIndex, cards.length));
        cards.splice(i, 0, {
          kind: "browser",
          id: BROWSER_ID,
          url: doc.browser.url,
          x: 0, y: 0, w: CELL.w, h: CELL.h, // placeholder; the grid layout positions it
        });
      }
      useCardStore.setState({ anchor: doc?.gridAnchor ?? null, cards });
      pendingScene.current = doc
        ? { elements: doc.scene.elements, appState: doc.scene.appState as AppStateLike }
        : null;
      const api = apiRef.current;
      if (api && pendingScene.current) applyScene(api, pendingScene.current);
      usePresetStore.getState().load();
      const index = await loadIndex();
      const meta = index.find((w) => w.id === wallId);
      if (!cancelled) {
        setWallPath(meta?.path ?? "");
        if (meta?.sharedOrgSpaceId) {
          sharedRef.current = { orgSpaceId: meta.sharedOrgSpaceId, version: meta.cloudVersion ?? 0 };
          setIsShared(true);
        } else {
          sharedRef.current = null;
          setIsShared(false);
        }
      }
      window.setTimeout(() => { savesEnabled.current = true; }, 400);
    })();
    return () => { cancelled = true; if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [wallId]);

  useEffect(() => useCardStore.subscribe(scheduleSave), [scheduleSave]);

  // Report this space to team presence + persist it as the member's last space.
  useEffect(() => {
    let cancelled = false;
    void loadIndex().then((idx) => {
      if (cancelled) return;
      const meta = idx.find((w) => w.id === wallId);
      const name = meta?.name ?? "space";
      setPresenceSpace(wallId, name, meta?.sharedOrgSpaceId ?? null);
      void useOrgStore.getState().recordSpaceActivity(wallId, name);
    });
    return () => { cancelled = true; setPresenceSpace(null, null); };
  }, [wallId]);

  // Pan/zoom never goes through React state: write the camera to a ref and patch
  // the overlay layer's transform in one rAF. Terminals re-render only when the
  // terminals array itself changes.
  const applyCamera = useCallback((next: Camera) => {
    const prev = cameraRef.current;
    if (prev.x === next.x && prev.y === next.y && prev.z === next.z) return;
    cameraRef.current = next;
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const el = layerRef.current;
      if (el) el.style.transform = layerTransform(cameraRef.current);
      syncBrowserRect();
    });
  }, []);

  /**
   * Lays the managed grid out around the stable anchor and fits the camera
   * (zoom-out only). Writes only x/y/w/h, so the signature subscriber that
   * calls this never re-fires for layout writes.
   */
  const layoutGrid = useCallback(() => {
    const { cards, anchor, maximizedId } = useCardStore.getState();
    if (cards.length === 0) return;
    const api = apiRef.current;
    const st = api?.getAppState() as AppStateLike | undefined;
    const screen = { w: st?.width ?? window.innerWidth, h: st?.height ?? window.innerHeight };
    const aspect = screen.w / screen.h;
    let a = anchor;
    if (!a) {
      // First layout on this wall: anchor the grid at the current viewport center.
      const vp = st ? excalidrawViewport(st) : { x: 0, y: 0, w: screen.w, h: screen.h };
      a = { x: vp.x + vp.w / 2, y: vp.y + vp.h / 2 };
      useCardStore.setState({ anchor: a });
    }
    const maxIdx = maximizedId ? cards.findIndex((c) => c.id === maximizedId) : -1;
    const maximize = maxIdx !== -1 ? maximizeLayout(maxIdx, cards.length, a) : null;
    // With a browser open it becomes the dominant left pane and terminals stack
    // in columns of two beside it. With no browser and 1–4 terminals, they tile
    // a fixed stage (1 full, 2 columns, 3–4 quartered). Otherwise (5+) the
    // uniform grid grows and the camera zooms out to fit.
    const hasBrowser = cards.some((c) => c.kind === "browser");
    const split = !maximize && !hasBrowser && cards.length <= 4 ? splitLayout(cards.length, a) : null;
    const bl = !maximize && hasBrowser ? browserLayout(cards.length - 1, a) : null;
    const pos = maximize || split || bl ? null : gridPositions(cards.length, aspect, a);
    let ti = 0;
    const rectOf = (c: Card, i: number): { x: number; y: number; w: number; h: number } => {
      if (maximize) return maximize.rects[i];
      if (split) return split.rects[i];
      if (bl) {
        if (c.kind === "browser") return bl.browser;
        const p = bl.terminals[ti++];
        return { x: p.x, y: p.y, w: CELL.w, h: CELL.h };
      }
      const p = pos![i];
      return { x: p.x, y: p.y, w: CELL.w, h: CELL.h };
    };
    useCardStore.setState({
      cards: cards.map((c, i) => {
        const r = rectOf(c, i);
        return c.x === r.x && c.y === r.y && c.w === r.w && c.h === r.h
          ? c // keep referential equality so unmoved windows skip re-rendering
          : { ...c, ...r };
      }),
    });
    if (api && st) {
      const bbox = maximize
        ? maximize.bbox
        : split
        ? split.bbox
        : bl
        ? bl.bbox
        : gridBBox(cards.length, aspect, a);
      const cam = fitCamera(bbox, screen);
      api.updateScene({
        appState: { scrollX: cam.x, scrollY: cam.y, zoom: { value: cam.z as NormalizedZoomValue } },
      });
      applyCamera(cam);
    }
  }, [applyCamera]);

  // Re-layout whenever terminal membership, order, or maximized state changes.
  useEffect(() => {
    const state = useCardStore.getState();
    let prevSig = state.cards.map((c) => c.id).join("|") + ":" + (state.maximizedId ?? "");
    return useCardStore.subscribe((s) => {
      const sig = s.cards.map((c) => c.id).join("|") + ":" + (s.maximizedId ?? "");
      if (sig === prevSig) return;
      prevSig = sig;
      layoutGrid();
    });
  }, [layoutGrid]);

  const onChange = useCallback((_els: readonly unknown[], appState: AppStateLike) => {
    const tool = (appState as { activeTool?: { type?: string } }).activeTool?.type;
    if (tool) setActiveType(tool);
    applyCamera(excalidrawCamera(appState));
    scheduleSave();
  }, [applyCamera, scheduleSave]);

  const addTerminal = async (presetId: string) => {
    // Default cwd to the wall folder. If the path hasn't resolved yet (click during
    // the initial load), look it up on demand so agents never start in the wrong dir.
    let cwd = wallPath;
    if (!cwd) cwd = (await loadIndex()).find((w) => w.id === wallId)?.path ?? "";
    useCardStore.getState().add({
      kind: "terminal",
      id: crypto.randomUUID(),
      name: pickAgentName(terminalsOf(useCardStore.getState().cards).map((t) => t.name)),
      x: 0, y: 0, w: CELL.w, h: CELL.h, // placeholder; the grid layout positions it
      presetId, cwd,
    });
  };

  const changeBg = (bg: Background) => {
    backgroundRef.current = bg; setBackground(bg); applyAccent(accentForBackground(bg)); syncTitlebar(bg); scheduleSave();
  };

  // The accent is per-wall; restore the default amber when leaving the wall so
  // the start page / task board never inherit a space's accent.
  useEffect(() => () => { applyAccent(DEFAULT_ACCENT); syncTitlebar(null); }, []);

  const exit = async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (savesEnabled.current) await doSave({ thumbnail: true });
    onExit();
  };

  useVibeContext("wall", () => {
    const cards = useCardStore.getState().cards;
    const terms = terminalsOf(cards).map((t) => {
      const preset = presets.find((p) => p.id === t.presetId);
      return preset ? `${t.name} (${preset.label})` : t.name;
    });
    const theme = THEMES.find(
      (t) => JSON.stringify(t.background) === JSON.stringify(backgroundRef.current)
    )?.name ?? "custom";
    const browser = cards.some((c) => c.kind === "browser") ? "; browser card open" : "";
    return `open terminals: ${terms.join(", ") || "none"}${browser}; theme: ${theme}; terminal presets: ${presets.map((p) => p.label).join(", ")}`;
  });

  useVibeCommand({
    name: "open_terminal",
    description:
      `Spawn a new agent terminal on this space. Available presets: ${presets.map((p) => p.label).join(", ")}. Omit preset for a plain shell.`,
    parameters: {
      type: "object",
      properties: { preset: { type: "string", description: "Preset name (fuzzy matched)" } },
    },
    run: async (args) => {
      const wanted = String(args.preset ?? "");
      const preset = findPresetByPhrase(presets, wanted);
      if (!preset) {
        return `Error: no preset matches "${wanted}". Available presets: ${presets.map((p) => p.label).join(", ")}.`;
      }
      await addTerminal(preset.id);
      const all = terminalsOf(useCardStore.getState().cards);
      const name = all[all.length - 1]?.name;
      return `Opened a ${preset.label} terminal named ${name}.`;
    },
  });

  useVibeCommand({
    name: "apply_theme",
    description:
      `Apply a pre-made theme to this space. Themes: ${THEMES.map((t) => t.name).join(", ")}.`,
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Theme name" } },
      required: ["name"],
    },
    run: (args) => {
      const wanted = String(args.name ?? "").trim().toLowerCase();
      const theme = THEMES.find(
        (t) => t.name.toLowerCase() === wanted || t.name.toLowerCase().includes(wanted) || wanted.includes(t.name.toLowerCase())
      );
      if (!theme) {
        return `Error: no theme matches "${args.name}". Themes: ${THEMES.map((t) => t.name).join(", ")}.`;
      }
      changeBg(theme.background);
      return `Applied the ${theme.name} theme (${theme.tagline}).`;
    },
  });

  useVibeCommand({
    name: "close_terminal",
    description: "Close a terminal on this space by its agent name (e.g. 'Ada').",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Agent name shown on the terminal" } },
      required: ["name"],
    },
    run: (args) => {
      const wanted = String(args.name ?? "").toLowerCase();
      const terminals = terminalsOf(useCardStore.getState().cards);
      const t = terminals.find((t) => t.name.toLowerCase().includes(wanted));
      if (!t) {
        const names = terminals.map((t) => t.name).join(", ") || "none";
        return `Error: no terminal matches "${args.name}". Open terminals: ${names}.`;
      }
      removeCardWithFade(t.id);
      return `Closed terminal ${t.name}.`;
    },
  });

  useVibeCommand({
    name: "focus_terminal",
    description:
      "Zoom in on a terminal by its agent name and give it keyboard focus. Use when the user says 'focus <name>' or wants to look at / work in one terminal.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Agent name shown on the terminal" } },
      required: ["name"],
    },
    run: (args) => {
      const wanted = String(args.name ?? "").toLowerCase();
      const terminals = terminalsOf(useCardStore.getState().cards);
      const t = terminals.find((t) => t.name.toLowerCase().includes(wanted));
      if (!t) {
        const names = terminals.map((t) => t.name).join(", ") || "none";
        return `Error: no terminal matches "${args.name}". Open terminals: ${names}.`;
      }
      const api = apiRef.current;
      const st = api?.getAppState() as AppStateLike | undefined;
      if (api && st) {
        // Zoom in until the terminal fills the screen (capped) and center it.
        const cam = fitCamera(
          { x: t.x, y: t.y, w: t.w, h: t.h },
          { w: st.width, h: st.height },
          48,
          FOCUS_MAX_ZOOM
        );
        api.updateScene({
          appState: { scrollX: cam.x, scrollY: cam.y, zoom: { value: cam.z as NormalizedZoomValue } },
        });
        applyCamera(cam);
      }
      focusSession(t.id);
      return `Focused on terminal ${t.name}.`;
    },
  });

  useVibeCommand({
    name: "send_to_terminal",
    description:
      "Type a prompt or command into a terminal on this space and press Enter — use it to instruct agents like Claude or Codex, or to run shell commands. Pass the agent name shown on the terminal; it can be omitted when only one terminal is open.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Agent name shown on the terminal" },
        text: { type: "string", description: "The prompt or command to type" },
        submit: { type: "boolean", description: "Press Enter after typing (default true)" },
      },
      required: ["text"],
    },
    run: (args) => {
      const text = String(args.text ?? "").trim();
      if (!text) return "Error: nothing to send — give me the prompt or command text.";
      const terminals = terminalsOf(useCardStore.getState().cards);
      const wanted = String(args.name ?? "").toLowerCase().trim();
      const t = wanted
        ? terminals.find((t) => t.name.toLowerCase().includes(wanted))
        : terminals.length === 1 ? terminals[0] : undefined;
      if (!t) {
        const names = terminals.map((t) => t.name).join(", ") || "none";
        return wanted
          ? `Error: no terminal matches "${args.name}". Open terminals: ${names}.`
          : `Error: say which terminal to send this to. Open terminals: ${names}.`;
      }
      const submit = args.submit !== false;
      if (!sendToSession(t.id, text, submit)) {
        return `Error: terminal ${t.name} has no live session.`;
      }
      return submit ? `Sent to ${t.name}: "${text}".` : `Typed into ${t.name} without pressing Enter: "${text}".`;
    },
  });

  useVibeCommand({
    name: "open_browser",
    description:
      "Open the space's browser at a URL, or navigate it if already open. Use when the user asks to open a website or preview a local dev server.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "URL to open; scheme optional" } },
    },
    run: (args) => openBrowser(args.url ? String(args.url) : undefined),
  });

  useVibeCommand({
    name: "close_browser",
    description: "Close the space's browser window.",
    run: () => closeBrowser(),
  });

  useVibeCommand({
    name: "browser_back",
    description: "Go back one page in the space browser's history.",
    run: async () => {
      if (!browserCard()) return "Error: the browser is not open.";
      await browserBack();
      return "Went back a page.";
    },
  });

  useVibeCommand({
    name: "read_browser",
    description:
      "Read the current page in the space's browser. Returns the page title and visible text so you can answer questions about what's on screen.",
    run: async () => {
      if (!browserCard()) return "Error: the browser is not open.";
      const { title, text } = await browserRead();
      return `Page "${title}":\n${text}`;
    },
  });

  useVibeCommand({
    name: "focus_browser",
    description:
      "Zoom the camera in on the browser window. Use when the user says 'focus the browser' or wants to look at the page.",
    run: () => {
      const c = browserCard();
      if (!c) return "Error: the browser is not open.";
      const api = apiRef.current;
      const st = api?.getAppState() as AppStateLike | undefined;
      if (api && st) {
        const cam = fitCamera(
          { x: c.x, y: c.y, w: c.w, h: c.h },
          { w: st.width, h: st.height },
          48,
          FOCUS_MAX_ZOOM
        );
        api.updateScene({
          appState: { scrollX: cam.x, scrollY: cam.y, zoom: { value: cam.z as NormalizedZoomValue } },
        });
        applyCamera(cam);
      }
      return "Focused on the browser.";
    },
  });

  useVibeCommand({
    name: "change_background",
    description:
      "Set this space's background to a solid color. Accepts a CSS color like 'dark green', '#12110f', 'black'.",
    parameters: {
      type: "object",
      properties: { color: { type: "string", description: "CSS color value" } },
      required: ["color"],
    },
    run: (args) => {
      const color = String(args.color ?? "").trim();
      const probe = new Option().style;
      probe.color = color;
      if (!probe.color) return `Error: "${color}" is not a CSS color I understand.`;
      changeBg({ kind: "color", color });
      return `Background changed to ${color}.`;
    },
  });

  useVibeCommand({
    name: "zoom_to_fit",
    description: "Zoom and scroll the canvas so all drawn content is visible.",
    run: () => {
      apiRef.current?.scrollToContent(undefined, { fitToContent: true });
      return "Zoomed to fit the canvas content.";
    },
  });

  useVibeCommand({
    name: "exit_wall",
    description: "Leave this space and return to the start page (saves first).",
    run: async () => { await exit(); return "Left the space."; },
  });

  const selectTool = (tool: ToolDef) => {
    // tool.type is a literal union that includes "image"; assert to setActiveTool's exact
    // parameter union so the discriminated type checks (ExcalidrawImperativeAPI is already
    // imported at the top of this file).
    apiRef.current?.setActiveTool(
      { type: tool.type } as Parameters<ExcalidrawImperativeAPI["setActiveTool"]>[0]
    );
    setActiveType(tool.type);
  };

  return (
    <div className="wall-root">
      <WallBackground background={background} />
      {isShared && <div className="wall-shared-badge">Shared</div>}
      {sharedNotice && <div className="wall-shared-notice">{sharedNotice}</div>}
      <Toolbar wallId={wallId} onBack={() => { void exit(); }} onSwitch={onSwitch} onGear={() => setGearOpen((o) => !o)} onExplorer={() => setExplorerOpen((o) => !o)} onDesign={onDesign} onTasks={onTasks} onTeams={onTeams} />
      <FileExplorer path={wallPath} open={explorerOpen} onClose={() => setExplorerOpen(false)} />
      {gearOpen && (
        <SettingsModal background={background} onChangeBackground={changeBg} onClose={() => setGearOpen(false)} />
      )}
      <Excalidraw
        theme="dark"
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
            export: false,
            saveAsImage: false,
          },
        }}
        excalidrawAPI={(api) => {
          apiRef.current = api;
          if (pendingScene.current) applyScene(api, pendingScene.current);
          applyCamera(excalidrawCamera(api.getAppState() as AppStateLike));
        }}
        onChange={onChange as Parameters<typeof Excalidraw>[0]["onChange"]}
        initialData={{ appState: { viewBackgroundColor: "transparent" } }}
      />
      <LaunchMenu
        presets={presets}
        onLaunch={addTerminal}
        onLaunchBrowser={() => { void openBrowser(); }}
      />
      <ToolsIsland activeType={activeType} onSelect={selectTool} />
      <TerminalOverlay layerRef={layerRef} cameraRef={cameraRef} />
    </div>
  );
}
