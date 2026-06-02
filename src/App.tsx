import { useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./App.css";

// Serve Excalidraw's bundled assets from the app origin (no external CDN).
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = "/";

export default function App() {
  const [, setReady] = useState(false);
  return (
    <div className="wall-root">
      <Excalidraw
        theme="dark"
        excalidrawAPI={() => setReady(true)}
        initialData={{ appState: { viewBackgroundColor: "transparent" } }}
      />
    </div>
  );
}
