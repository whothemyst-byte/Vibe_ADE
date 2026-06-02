import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { Toolbar } from "./Toolbar";
import { TerminalOverlay } from "./TerminalOverlay";
import { useTerminalStore } from "./terminalStore";
import { findSpawnPoint, type Camera, type Rect } from "./transform";
import { excalidrawCamera, excalidrawViewport, type AppStateLike } from "./excalidrawCamera";
import { loadWall, saveWall, saveThumbnail, loadIndex, saveIndex } from "../store/persistence";
import { DEFAULT_BACKGROUND, type WallDoc } from "../store/types";

const TERMINAL_SIZE = { w: 420, h: 260 };
const DEFAULT_CAMERA: Camera = { x: 0, y: 0, z: 1 };

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

export function WallView({ wallId, onExit, onSwitch }: { wallId: string; onExit: () => void; onSwitch: (id: string) => void }) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const pendingScene = useRef<{ elements: unknown[]; appState: AppStateLike } | null>(null);

  const saveTimer = useRef<number | null>(null);
  const savesEnabled = useRef(false);

  const buildDoc = (): WallDoc | null => {
    const api = apiRef.current;
    if (!api) return null;
    const st = api.getAppState();
    return {
      scene: {
        elements: [...api.getSceneElements()],
        appState: { scrollX: st.scrollX, scrollY: st.scrollY, zoom: st.zoom },
      },
      terminals: useTerminalStore.getState().terminals.map(({ id, x, y, w, h, presetId, cwd }) => ({
        id, x, y, w, h, presetId, cwd,
      })),
      background: DEFAULT_BACKGROUND,
    };
  };

  const doSave = async () => {
    const api = apiRef.current;
    const doc = buildDoc();
    if (!api || !doc) return;
    await saveWall(wallId, doc);
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
      useTerminalStore.setState({
        terminals: (doc?.terminals ?? []).map((t) => ({ ...t, started: false })),
      });
      pendingScene.current = doc
        ? { elements: doc.scene.elements, appState: doc.scene.appState as AppStateLike }
        : null;
      const api = apiRef.current;
      if (api && pendingScene.current) applyScene(api, pendingScene.current);
      window.setTimeout(() => { savesEnabled.current = true; }, 400);
    })();
    return () => { cancelled = true; if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [wallId]);

  useEffect(() => useTerminalStore.subscribe(scheduleSave), [scheduleSave]);

  const onChange = useCallback((_els: readonly unknown[], appState: AppStateLike) => {
    const next = excalidrawCamera(appState);
    setCamera((prev) =>
      prev.x === next.x && prev.y === next.y && prev.z === next.z ? prev : next
    );
    scheduleSave();
  }, [scheduleSave]);

  const addTerminal = () => {
    const api = apiRef.current;
    const appState = api?.getAppState() as AppStateLike | undefined;
    const viewport: Rect = appState ? excalidrawViewport(appState) : { x: 0, y: 0, w: 1200, h: 800 };
    const drawn: Rect[] = (api?.getSceneElements() ?? []).map((e) => ({ x: e.x, y: e.y, w: e.width, h: e.height }));
    const terms: Rect[] = useTerminalStore.getState().terminals.map((t) => ({ x: t.x, y: t.y, w: t.w, h: t.h }));
    const { x, y } = findSpawnPoint(viewport, [...drawn, ...terms], TERMINAL_SIZE);
    useTerminalStore.getState().add({
      id: crypto.randomUUID(), x, y, w: TERMINAL_SIZE.w, h: TERMINAL_SIZE.h, presetId: "plain", cwd: "", started: false,
    });
  };

  return (
    <div className="wall-root">
      <Toolbar wallId={wallId} onBack={onExit} onSwitch={onSwitch} />
      <Excalidraw
        theme="dark"
        excalidrawAPI={(api) => {
          apiRef.current = api;
          if (pendingScene.current) applyScene(api, pendingScene.current);
          setCamera(excalidrawCamera(api.getAppState() as AppStateLike));
        }}
        onChange={onChange as Parameters<typeof Excalidraw>[0]["onChange"]}
        initialData={{ appState: { viewBackgroundColor: "transparent" } }}
      />
      <button className="add-terminal" onPointerDown={addTerminal}>+ Terminal</button>
      <TerminalOverlay camera={camera} />
    </div>
  );
}
