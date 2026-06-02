import { useCallback, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import "./App.css";
import { TerminalOverlay } from "./wall/TerminalOverlay";
import { useTerminalStore } from "./wall/terminalStore";
import { findSpawnPoint, type Camera, type Rect } from "./wall/transform";
import { excalidrawCamera, excalidrawViewport, type AppStateLike } from "./wall/excalidrawCamera";

// Serve Excalidraw's bundled assets from the app origin (no external CDN).
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/";

const TERMINAL_SIZE = { w: 420, h: 260 };
const DEFAULT_CAMERA: Camera = { x: 0, y: 0, z: 1 };

export default function App() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);

  const onChange = useCallback((_els: readonly unknown[], appState: AppStateLike) => {
    const next = excalidrawCamera(appState);
    setCamera((prev) =>
      prev.x === next.x && prev.y === next.y && prev.z === next.z ? prev : next
    );
  }, []);

  const addTerminal = () => {
    const api = apiRef.current;
    const appState = api?.getAppState() as AppStateLike | undefined;
    const viewport: Rect = appState
      ? excalidrawViewport(appState)
      : { x: 0, y: 0, w: 1200, h: 800 };
    const drawn: Rect[] = (api?.getSceneElements() ?? []).map((e) => ({
      x: e.x, y: e.y, w: e.width, h: e.height,
    }));
    const terms: Rect[] = useTerminalStore.getState().terminals.map((t) => ({
      x: t.x, y: t.y, w: t.w, h: t.h,
    }));
    const { x, y } = findSpawnPoint(viewport, [...drawn, ...terms], TERMINAL_SIZE);
    useTerminalStore.getState().add({
      id: crypto.randomUUID(),
      x, y, w: TERMINAL_SIZE.w, h: TERMINAL_SIZE.h,
      presetId: "plain", cwd: "", started: false,
    });
  };

  return (
    <div className="wall-root">
      <Excalidraw
        theme="dark"
        excalidrawAPI={(api) => {
          apiRef.current = api;
          // Excalidraw doesn't fire onChange on mount and its initial scroll is
          // usually non-zero — seed the camera so the first terminal is placed right.
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
