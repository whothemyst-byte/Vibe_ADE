import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import "./excalidraw-skin.css";
import { Toolbar } from "./Toolbar";
import { TerminalOverlay } from "./TerminalOverlay";
import { useTerminalStore } from "./terminalStore";
import { findSpawnPoint, layerTransform, type Camera, type Rect } from "./transform";
import { excalidrawCamera, excalidrawViewport, type AppStateLike } from "./excalidrawCamera";
import { loadWall, saveWall, saveThumbnail, loadIndex, saveIndex } from "../store/persistence";
import { DEFAULT_BACKGROUND, type WallDoc, type Background } from "../store/types";
import { WallBackground } from "./WallBackground";
import { SettingsModal } from "../settings/SettingsModal";
import { useSettingsStore } from "../settings/settingsStore";
import { LaunchMenu } from "./LaunchMenu";
import { ToolsIsland } from "./ToolsIsland";
import type { ToolDef } from "./tools";
import { usePresetStore } from "./presetStore";
import { pickAgentName } from "./agentNames";
import { wasSessionDead } from "./sessions";
import { useVibeCommand } from "../vibe/commands";
import { findPresetByPhrase } from "./presets";
import { THEMES } from "../settings/themes";

const TERMINAL_SIZE = { w: 420, h: 260 };
const DEFAULT_CAMERA: Camera = { x: 0, y: 0, z: 1 };
const THUMB_INTERVAL_MS = 20_000;

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

export function WallView({ wallId, onExit, onSwitch, onTasks }: { wallId: string; onExit: () => void; onSwitch: (id: string) => void; onTasks: () => void }) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const cameraRef = useRef<Camera>(DEFAULT_CAMERA);
  const layerRef = useRef<HTMLDivElement>(null);
  const rafPending = useRef(false);
  const [activeType, setActiveType] = useState<string>("selection");
  const [background, setBackground] = useState<Background>(DEFAULT_BACKGROUND);
  const backgroundRef = useRef<Background>(DEFAULT_BACKGROUND);
  const [gearOpen, setGearOpen] = useState(false);
  const pendingScene = useRef<{ elements: unknown[]; appState: AppStateLike } | null>(null);
  const presets = usePresetStore((s) => s.presets);
  const [wallPath, setWallPath] = useState("");

  const saveTimer = useRef<number | null>(null);
  const savesEnabled = useRef(false);
  const lastThumbAt = useRef(0);

  const buildDoc = (): WallDoc | null => {
    const api = apiRef.current;
    if (!api) return null;
    const st = api.getAppState();
    return {
      scene: {
        elements: [...api.getSceneElements()],
        appState: { scrollX: st.scrollX, scrollY: st.scrollY, zoom: st.zoom },
      },
      terminals: useTerminalStore.getState().terminals.map(({ id, x, y, w, h, presetId, cwd, name }) => ({
        id, x, y, w, h, presetId, cwd, name,
      })),
      background: backgroundRef.current,
    };
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
      // Docs saved before agent names existed lack `name` - assign unique ones.
      // Terminals whose PTY died while this wall was closed are dropped.
      const names: string[] = [];
      useTerminalStore.setState({
        terminals: (doc?.terminals ?? [])
          .filter((t) => !wasSessionDead(t.id))
          .map((t) => {
            const name = t.name ?? pickAgentName(names);
            names.push(name);
            return { ...t, name };
          }),
      });
      pendingScene.current = doc
        ? { elements: doc.scene.elements, appState: doc.scene.appState as AppStateLike }
        : null;
      const api = apiRef.current;
      if (api && pendingScene.current) applyScene(api, pendingScene.current);
      usePresetStore.getState().load();
      const index = await loadIndex();
      if (!cancelled) setWallPath(index.find((w) => w.id === wallId)?.path ?? "");
      window.setTimeout(() => { savesEnabled.current = true; }, 400);
    })();
    return () => { cancelled = true; if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [wallId]);

  useEffect(() => useTerminalStore.subscribe(scheduleSave), [scheduleSave]);

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
    });
  }, []);

  const onChange = useCallback((_els: readonly unknown[], appState: AppStateLike) => {
    const tool = (appState as { activeTool?: { type?: string } }).activeTool?.type;
    if (tool) setActiveType(tool);
    applyCamera(excalidrawCamera(appState));
    scheduleSave();
  }, [applyCamera, scheduleSave]);

  const addTerminal = async (presetId: string) => {
    const api = apiRef.current;
    const appState = api?.getAppState() as AppStateLike | undefined;
    const viewport: Rect = appState ? excalidrawViewport(appState) : { x: 0, y: 0, w: 1200, h: 800 };
    const drawn: Rect[] = (api?.getSceneElements() ?? []).map((e) => ({ x: e.x, y: e.y, w: e.width, h: e.height }));
    const terms: Rect[] = useTerminalStore.getState().terminals.map((t) => ({ x: t.x, y: t.y, w: t.w, h: t.h }));
    const { x, y } = findSpawnPoint(viewport, [...drawn, ...terms], TERMINAL_SIZE);
    // Default cwd to the wall folder. If the path hasn't resolved yet (click during
    // the initial load), look it up on demand so agents never start in the wrong dir.
    let cwd = wallPath;
    if (!cwd) cwd = (await loadIndex()).find((w) => w.id === wallId)?.path ?? "";
    useTerminalStore.getState().add({
      id: crypto.randomUUID(),
      name: pickAgentName(useTerminalStore.getState().terminals.map((t) => t.name)),
      x, y, w: TERMINAL_SIZE.w, h: TERMINAL_SIZE.h, presetId, cwd,
    });
  };

  const changeBg = (bg: Background) => { backgroundRef.current = bg; setBackground(bg); scheduleSave(); };

  const exit = async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (savesEnabled.current) await doSave({ thumbnail: true });
    onExit();
  };

  useVibeCommand({
    name: "open_terminal",
    description:
      `Spawn a new agent terminal on this wall. Available presets: ${presets.map((p) => p.label).join(", ")}. Omit preset for a plain shell.`,
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
      const all = useTerminalStore.getState().terminals;
      const name = all[all.length - 1]?.name;
      return `Opened a ${preset.label} terminal named ${name}.`;
    },
  });

  useVibeCommand({
    name: "apply_theme",
    description:
      `Apply a pre-made theme to this wall. Themes: ${THEMES.map((t) => t.name).join(", ")}.`,
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
    description: "Close a terminal on this wall by its agent name (e.g. 'Ada').",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Agent name shown on the terminal" } },
      required: ["name"],
    },
    run: (args) => {
      const wanted = String(args.name ?? "").toLowerCase();
      const { terminals, remove } = useTerminalStore.getState();
      const t = terminals.find((t) => t.name.toLowerCase().includes(wanted));
      if (!t) {
        const names = terminals.map((t) => t.name).join(", ") || "none";
        return `Error: no terminal matches "${args.name}". Open terminals: ${names}.`;
      }
      remove(t.id);
      return `Closed terminal ${t.name}.`;
    },
  });

  useVibeCommand({
    name: "focus_terminal",
    description: "Bring a terminal to the front by its agent name.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Agent name shown on the terminal" } },
      required: ["name"],
    },
    run: (args) => {
      const wanted = String(args.name ?? "").toLowerCase();
      const { terminals } = useTerminalStore.getState();
      const t = terminals.find((t) => t.name.toLowerCase().includes(wanted));
      if (!t) {
        const names = terminals.map((t) => t.name).join(", ") || "none";
        return `Error: no terminal matches "${args.name}". Open terminals: ${names}.`;
      }
      // Terminals render in array order; last = on top.
      useTerminalStore.setState({
        terminals: [...terminals.filter((x) => x.id !== t.id), t],
      });
      return `Terminal ${t.name} is now in front.`;
    },
  });

  useVibeCommand({
    name: "change_background",
    description:
      "Set this wall's background to a solid color. Accepts a CSS color like 'dark green', '#12110f', 'black'.",
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
    description: "Leave this wall and return to the start page (saves first).",
    run: async () => { await exit(); return "Left the wall."; },
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
      <Toolbar wallId={wallId} onBack={() => { void exit(); }} onSwitch={onSwitch} onGear={() => setGearOpen((o) => !o)} onTasks={onTasks} />
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
      <LaunchMenu presets={presets} onLaunch={addTerminal} />
      <ToolsIsland activeType={activeType} onSelect={selectTool} />
      <TerminalOverlay layerRef={layerRef} cameraRef={cameraRef} />
    </div>
  );
}
