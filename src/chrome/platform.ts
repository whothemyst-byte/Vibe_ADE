/**
 * Client-side OS sniffing to branch custom window chrome. Windows gets a fully
 * custom glassy bar + hand-rolled resize handles (decorations:false there,
 * see tauri.windows.conf.json). macOS keeps native decorations and traffic
 * lights (titleBarStyle:Overlay, see tauri.macos.conf.json) — it only needs
 * the drag/blur strip, not custom buttons or resize handles. Linux keeps the
 * full native title bar untouched and renders none of this.
 */
const ua = () => navigator.platform ?? navigator.userAgent ?? "";

export const isMac = () => /Mac/i.test(ua());
export const isWindows = () => /Win/i.test(ua());

/** False outside a Tauri webview (e.g. `npm run dev` in a plain browser tab) — gate any @tauri-apps/api/window use on this. */
export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
