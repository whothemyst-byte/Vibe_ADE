import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { HEADER_H } from "./transform";
import { useTerminalStore, type TerminalState } from "./terminalStore";
import { spawnPty, writePty, resizePty, killPty, onPtyData, onPtyExit } from "../pty/client";

export function TerminalWindow({ terminal, zoom }: { terminal: TerminalState; zoom: number }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const update = useTerminalStore((s) => s.update);
  const remove = useTerminalStore((s) => s.remove);
  const { id, started, w, h, cwd } = terminal;

  useEffect(() => {
    if (!started || !bodyRef.current) return;
    const term = new Terminal({ fontSize: 13, fontFamily: "ui-monospace, monospace", theme: { background: "#0b0e14" } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(bodyRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const unlisteners: Array<() => void> = [];
    let disposed = false;

    const dataSub = term.onData((d) => writePty(id, new TextEncoder().encode(d)));

    (async () => {
      const uData = await onPtyData(id, (bytes) => term.write(bytes));
      if (disposed) { uData(); return; }
      unlisteners.push(uData);

      const uExit = await onPtyExit(id, () => { if (!disposed) remove(id); });
      if (disposed) { uExit(); return; }
      unlisteners.push(uExit);

      await spawnPty({ id, shell: "powershell.exe", cwd: cwd || undefined, rows: term.rows, cols: term.cols });
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

  const beginDrag = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const ox = terminal.x, oy = terminal.y;
    const onMove = (ev: PointerEvent) =>
      update(id, { x: ox + (ev.clientX - sx) / zoom, y: oy + (ev.clientY - sy) / zoom });
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const beginResize = (e: ReactPointerEvent) => {
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const ow = terminal.w, oh = terminal.h;
    const onMove = (ev: PointerEvent) =>
      update(id, {
        w: Math.max(220, ow + (ev.clientX - sx) / zoom),
        h: Math.max(140, oh + (ev.clientY - sy) / zoom),
      });
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <>
      <div className="terminal-header" style={{ height: HEADER_H }} onPointerDown={beginDrag}>
        <span className="terminal-title">{`Terminal ${id.slice(0, 4)}`}</span>
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
    </>
  );
}
