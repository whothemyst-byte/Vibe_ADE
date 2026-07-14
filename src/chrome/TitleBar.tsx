import { useEffect, useState } from "react";
import { getCurrentWindow, type Window } from "@tauri-apps/api/window";
import { isMac, isTauri, isWindows } from "./platform";

// Lazy + guarded: getCurrentWindow() reads window.__TAURI_INTERNALS__ synchronously
// and throws outside a Tauri webview (e.g. `npm run dev` in a plain browser tab).
// The import above is just a function reference — safe; only the call is deferred.
let cachedWin: Window | null = null;
function getWin(): Window | null {
  if (!isTauri()) return null;
  if (!cachedWin) cachedWin = getCurrentWindow();
  return cachedWin;
}

/** Logs instead of swallowing — a missing capabilities/*.json permission rejects silently otherwise. */
function act(action: () => Promise<void> | undefined) {
  void action()?.catch((e) => console.error("[titlebar]", e));
}

function MinimizeGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
function MaximizeGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
function RestoreGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <rect x="2.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M0.5 2.5v7h7" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
function CloseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/**
 * Custom glassy title bar (Windows only — decorations:false there, see
 * tauri.windows.conf.json). macOS keeps its native traffic lights via
 * titleBarStyle:Overlay and just gets the drag/blur strip; Linux keeps the
 * full native title bar untouched.
 */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const mac = isMac();
  const visible = isTauri() && (mac || isWindows()); // Linux/browser: keep the native title bar untouched.

  useEffect(() => {
    if (!visible) return;
    const win = getWin();
    if (!win) return;
    void win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => void win.isMaximized().then(setMaximized));
    return () => { void unlisten.then((f) => f()); };
  }, [visible]);

  // Other floating chrome (launch buttons, canvas toolbars, page padding) reads
  // this class to clear the bar's height — see the html.has-custom-titlebar
  // rules in App.css. Only reserve that space where the bar actually renders.
  useEffect(() => {
    document.documentElement.classList.toggle("has-custom-titlebar", visible);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className={`titlebar${mac ? " titlebar-mac" : ""}`}>
      <div className="titlebar-drag" data-tauri-drag-region onDoubleClick={() => act(() => getWin()?.toggleMaximize())}>
        <img src="/app-icon.png" alt="" className="titlebar-icon" draggable={false} />
        <span className="titlebar-title">Vibe Space</span>
      </div>
      {!mac && (
        <div className="titlebar-controls">
          <button className="titlebar-btn" title="Minimize" onClick={() => act(() => getWin()?.minimize())}>
            <MinimizeGlyph />
          </button>
          <button className="titlebar-btn" title={maximized ? "Restore" : "Maximize"} onClick={() => act(() => getWin()?.toggleMaximize())}>
            {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
          </button>
          <button className="titlebar-btn titlebar-btn-close" title="Close" onClick={() => act(() => getWin()?.close())}>
            <CloseGlyph />
          </button>
        </div>
      )}
    </div>
  );
}
