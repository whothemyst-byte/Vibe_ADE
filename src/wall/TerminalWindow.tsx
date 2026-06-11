import { memo, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { HEADER_H, type Camera } from "./transform";
import { useTerminalStore, type TerminalState } from "./terminalStore";
import { spawnPty, writePty, resizePty, killPty, onPtyExit } from "../pty/client";
import { usePresetStore } from "./presetStore";
import { resolvePreset } from "./presets";
import { presetTierColor } from "./presetTier";

function TerminalWindowInner({
  terminal,
  cameraRef,
}: {
  terminal: TerminalState;
  cameraRef: RefObject<Camera>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const update = useTerminalStore((s) => s.update);
  const remove = useTerminalStore((s) => s.remove);
  const { id, started, w, h, cwd } = terminal;
  const presets = usePresetStore((s) => s.presets);
  const preset = resolvePreset(presets, terminal.presetId);

  useEffect(() => {
    if (!started || !bodyRef.current) return;
    const term = new Terminal({
      fontSize: 13,
      scrollback: 5000,
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
    term.open(bodyRef.current);
    try {
      const webgl = new WebglAddon();
      // On context loss, dispose the addon: xterm falls back to the DOM renderer.
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // WebGL unavailable - DOM renderer fallback.
    }
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const unlisteners: Array<() => void> = [];
    let disposed = false;

    const dataSub = term.onData((d) => writePty(id, new TextEncoder().encode(d)));

    (async () => {
      const uExit = await onPtyExit(id, () => { if (!disposed) remove(id); });
      if (disposed) { uExit(); return; }
      unlisteners.push(uExit);

      await spawnPty({
        id,
        shell: "powershell.exe",
        cwd: cwd || undefined,
        rows: term.rows,
        cols: term.cols,
        command: preset.command,
        onData: (bytes) => { if (!disposed) term.write(bytes); },
      });
    })();

    return () => {
      disposed = true;
      dataSub.dispose();
      unlisteners.forEach((u) => u());
      killPty(id);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, id]);

  useEffect(() => {
    if (!started || !fitRef.current || !termRef.current) return;
    fitRef.current.fit();
    resizePty(id, termRef.current.rows, termRef.current.cols);
  }, [w, h, started, id]);

  const start = () => update(id, { started: true });
  const close = (e: ReactPointerEvent) => { e.stopPropagation(); remove(id); };

  // Gestures mutate the wrapper element directly; the store gets ONE commit on
  // release (one autosave, no per-frame React work).
  const beginDrag = (e: ReactPointerEvent) => {
    e.stopPropagation();
    // Camera can't change mid-gesture: the pointer is captured by the window, not the canvas.
    const z = cameraRef.current.z;
    const sx = e.clientX, sy = e.clientY;
    const ox = terminal.x, oy = terminal.y;
    let nx = ox, ny = oy;
    const onMove = (ev: PointerEvent) => {
      nx = ox + (ev.clientX - sx) / z;
      ny = oy + (ev.clientY - sy) / z;
      const el = wrapRef.current;
      if (el) el.style.transform = `translate(${nx}px, ${ny}px)`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      update(id, { x: nx, y: ny });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const beginResize = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const z = cameraRef.current.z;
    const sx = e.clientX, sy = e.clientY;
    const ow = terminal.w, oh = terminal.h;
    let nw = ow, nh = oh;
    const onMove = (ev: PointerEvent) => {
      nw = Math.max(220, ow + (ev.clientX - sx) / z);
      nh = Math.max(140, oh + (ev.clientY - sy) / z);
      const el = wrapRef.current;
      if (el) { el.style.width = `${nw}px`; el.style.height = `${nh}px`; }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      update(id, { w: nw, h: nh }); // commit refits xterm via the w/h effect
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={wrapRef}
      className="terminal-window"
      style={{
        transform: `translate(${terminal.x}px, ${terminal.y}px)`,
        width: terminal.w,
        height: terminal.h,
      }}
    >
      <div className="terminal-header" style={{ height: HEADER_H }} onPointerDown={beginDrag}>
        <span className="terminal-tier" style={{ background: presetTierColor(preset.id) }} />
        <span className="terminal-title">{preset.label}</span>
        <button className="terminal-close" title="Close" onPointerDown={close}>
          &times;
        </button>
      </div>
      {started ? (
        <div ref={bodyRef} className="terminal-body" style={{ top: HEADER_H }} />
      ) : (
        <button className="terminal-start" onPointerDown={(e) => { e.stopPropagation(); start(); }}>
          &#9655; Start
        </button>
      )}
      <div className="terminal-resize" onPointerDown={beginResize} />
    </div>
  );
}

// Shallow compare is correct: the store's update() replaces only the changed
// terminal's object, so untouched windows keep referential equality and skip rendering.
export const TerminalWindow = memo(TerminalWindowInner);
