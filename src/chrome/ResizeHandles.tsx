import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { isTauri, isWindows } from "./platform";

// Lazy + guarded: getCurrentWindow() reads window.__TAURI_INTERNALS__ synchronously
// and throws outside a Tauri webview (e.g. `npm run dev` in a plain browser tab).
let cachedWin: Window | null = null;
function getWin(): Window | null {
  if (!isTauri()) return null;
  if (!cachedWin) cachedWin = getCurrentWindow();
  return cachedWin;
}

const EDGES = [
  { dir: "North", className: "rh-n" },
  { dir: "South", className: "rh-s" },
  { dir: "East", className: "rh-e" },
  { dir: "West", className: "rh-w" },
  { dir: "NorthEast", className: "rh-ne" },
  { dir: "NorthWest", className: "rh-nw" },
  { dir: "SouthEast", className: "rh-se" },
  { dir: "SouthWest", className: "rh-sw" },
] as const;

/**
 * Invisible edge/corner hit zones for resizing the frameless Windows window
 * (decorations:false drops the OS's own resize border). macOS/Linux keep
 * native decorations and their own resize handling, so this renders nothing there.
 */
export function ResizeHandles() {
  if (!isTauri() || !isWindows()) return null;
  return (
    <>
      {EDGES.map(({ dir, className }) => (
        <div
          key={dir}
          className={`resize-handle ${className}`}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            getWin()?.startResizeDragging(dir).catch((err) => console.error("[resize-handle]", err));
          }}
        />
      ))}
    </>
  );
}
