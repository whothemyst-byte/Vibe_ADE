import { useEffect, useRef } from "react";
import { Editor } from "@tldraw/editor";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { TerminalShape } from "./TerminalShape";
import { HEADER_H } from "./transform";
import { spawnPty, writePty, resizePty, killPty, onPtyData, onPtyExit } from "../pty/client";

export function TerminalWindow({ shape, editor }: { shape: TerminalShape; editor: Editor }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const { started, w, h } = shape.props;

  // Boot xterm + PTY once the terminal is started.
  useEffect(() => {
    if (!started || !bodyRef.current) return;
    const term = new Terminal({ fontSize: 13, fontFamily: "ui-monospace, monospace", theme: { background: "#0b0e14" } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(bodyRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const id = shape.id;
    const unlisteners: Array<() => void> = [];
    let disposed = false;

    spawnPty({
      id,
      shell: "powershell.exe",
      cwd: shape.props.cwd || undefined,
      rows: term.rows,
      cols: term.cols,
    });

    const dataSub = term.onData((d) => {
      writePty(id, new TextEncoder().encode(d));
    });

    onPtyData(id, (bytes) => term.write(bytes)).then((u) => {
      if (disposed) u();
      else unlisteners.push(u);
    });
    onPtyExit(id, () => term.write("\r\n[process exited]\r\n")).then((u) => {
      if (disposed) u();
      else unlisteners.push(u);
    });

    return () => {
      disposed = true;
      dataSub.dispose();
      unlisteners.forEach((u) => u());
      killPty(id);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // Re-boot only when the started flag flips for this shape id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, shape.id]);

  // Refit on world-size change (NOT on zoom — zoom is a CSS scale only).
  useEffect(() => {
    if (!started || !fitRef.current || !termRef.current) return;
    fitRef.current.fit();
    resizePty(shape.id, termRef.current.rows, termRef.current.cols);
  }, [w, h, started, shape.id]);

  const start = () =>
    editor.updateShape({ id: shape.id, type: "terminal", props: { started: true } });

  if (!started) {
    return (
      <button className="terminal-start" onPointerDown={(e) => { e.stopPropagation(); start(); }}>
        &#9655; Start
      </button>
    );
  }
  return <div ref={bodyRef} className="terminal-body" style={{ top: HEADER_H }} />;
}
