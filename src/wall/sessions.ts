import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { spawnPty, writePty, resizePty, killPty, onPtyExit } from "../pty/client";
import { newActivity, recordOutput, type Activity } from "./agentStatus";
import { useCardStore } from "./cardStore";
import { useSettingsStore } from "../settings/settingsStore";

/**
 * Terminal sessions live OUTSIDE the React tree. A session (xterm instance, its
 * DOM host, the PTY, and the activity clock) is created once when a terminal
 * spawns and survives view switches: TerminalWindow only attaches/detaches the
 * host element on mount/unmount. Nothing is killed until the card is closed or
 * the agent's process exits.
 */

type Session = {
  host: HTMLDivElement;
  term: Terminal;
  fit: FitAddon;
  dispose: () => void;
};

const sessions = new Map<string, Session>();
const activityRefs = new Map<string, { current: Activity }>();
/** PTYs that exited while their wall wasn't open — dropped on the next wall load. */
const deadIds = new Set<string>();

/**
 * Hidden in-DOM parking lot for detached terminals. Fully detached WebGL
 * canvases can leave stale composited layers in WebView2 (rendering artifacts
 * on other views); a display:none subtree is never composited, and xterm keeps
 * its buffer, so this is the safe place to keep off-screen sessions.
 */
let park: HTMLDivElement | null = null;
function parkEl(): HTMLDivElement {
  if (!park) {
    park = document.createElement("div");
    park.style.display = "none";
    park.setAttribute("aria-hidden", "true");
    document.body.appendChild(park);
  }
  return park;
}

/** Stable per-terminal activity ref shared by the session and the StatusFooter. */
export function getActivityRef(id: string): { current: Activity } {
  let ref = activityRefs.get(id);
  if (!ref) {
    ref = { current: newActivity() };
    activityRefs.set(id, ref);
  }
  return ref;
}

/** True once if the session's PTY exited while unmounted (consumes the flag). */
export function wasSessionDead(id: string): boolean {
  return deadIds.delete(id);
}

/** Creates the session on first call; re-attaches the live one afterwards. */
export function ensureSession(opts: {
  id: string;
  cwd?: string;
  command?: string;
  container: HTMLElement;
}): void {
  const { id, container } = opts;
  const existing = sessions.get(id);
  if (existing) {
    if (existing.host.parentElement !== container) container.appendChild(existing.host);
    fitSession(id);
    return;
  }

  const host = document.createElement("div");
  host.className = "terminal-host";
  container.appendChild(host);

  const termSettings = useSettingsStore.getState().settings.terminal;
  const term = new Terminal({
    fontSize: termSettings.fontSize,
    scrollback: termSettings.scrollback,
    fontFamily: '"Geist Mono", ui-monospace, monospace',
    theme: {
      background: "#12110f",
      foreground: "#f3eee5",
      cursor: "#d79a3d",
      cursorAccent: "#12110f",
      selectionBackground: "rgba(215, 154, 61, .28)",
    },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host);
  try {
    const webgl = new WebglAddon();
    // On context loss, dispose the addon: xterm falls back to the DOM renderer.
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch {
    // WebGL unavailable - DOM renderer fallback.
  }
  fit.fit();

  const activity = getActivityRef(id);
  const dataSub = term.onData((d) => writePty(id, new TextEncoder().encode(d)));

  let unExit: (() => void) | null = null;
  let disposed = false;
  const dispose = () => {
    disposed = true;
    dataSub.dispose();
    unExit?.();
    unExit = null;
    term.dispose();
    host.remove();
  };

  sessions.set(id, { host, term, fit, dispose });

  void (async () => {
    const un = await onPtyExit(id, () => {
      if (disposed) return;
      // Agent process ended: tear down and drop the card. If this terminal's
      // wall isn't open the store remove is a no-op, so remember the id and
      // filter it out on the next wall load.
      destroySession(id);
      const store = useCardStore.getState();
      if (store.cards.some((c) => c.id === id)) store.remove(id);
      else deadIds.add(id);
    });
    if (disposed) {
      un();
      return;
    }
    unExit = un;
    await spawnPty({
      id,
      shell: termSettings.shell,
      cwd: opts.cwd || undefined,
      rows: term.rows,
      cols: term.cols,
      command: opts.command,
      onData: (bytes) => {
        if (disposed) return;
        activity.current = recordOutput(activity.current, Date.now());
        term.write(bytes);
      },
    });
  })();
}

/** Parks the host on unmount; the session keeps running off-screen. */
export function detachSession(id: string): void {
  const s = sessions.get(id);
  if (s) parkEl().appendChild(s.host);
}

/** Refits xterm to its container and syncs the PTY size (no-op while parked). */
export function fitSession(id: string): void {
  const s = sessions.get(id);
  if (!s || s.host.clientWidth === 0) return; // parked (display:none) or not laid out yet
  s.fit.fit();
  void resizePty(id, s.term.rows, s.term.cols);
}

// Font size applies to running terminals live; other terminal settings only
// affect sessions spawned after the change.
let appliedFontSize = useSettingsStore.getState().settings.terminal.fontSize;
useSettingsStore.subscribe((state) => {
  const next = state.settings.terminal.fontSize;
  if (next === appliedFontSize) return;
  appliedFontSize = next;
  for (const [id, s] of sessions) {
    s.term.options.fontSize = next;
    fitSession(id);
  }
});

/**
 * Types text into a terminal as if the user pasted it (bracketed paste keeps
 * multi-line prompts intact in TUI agents), optionally pressing Enter.
 * Returns false if no live session exists for the id.
 */
export function sendToSession(id: string, text: string, submit: boolean): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  if (text) s.term.paste(text);
  if (submit) s.term.input("\r");
  return true;
}

/** Moves keyboard focus into a terminal's xterm so keystrokes go there. */
export function focusSession(id: string): void {
  sessions.get(id)?.term.focus();
}

/** Kills the PTY and disposes the terminal (card closed or process exited). */
export function destroySession(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  activityRefs.delete(id);
  s.dispose();
  void killPty(id);
}
