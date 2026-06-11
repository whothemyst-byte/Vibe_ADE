import { memo, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { HEADER_H, FOOTER_H, type Camera } from "./transform";
import { useTerminalStore, type TerminalState } from "./terminalStore";
import { usePresetStore } from "./presetStore";
import { resolvePreset } from "./presets";
import { StatusFooter } from "./StatusFooter";
import { CloseIcon } from "./icons";
import { ensureSession, detachSession, destroySession, fitSession, getActivityRef } from "./sessions";

function TerminalWindowInner({
  terminal,
  cameraRef,
}: {
  terminal: TerminalState;
  cameraRef: RefObject<Camera>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const update = useTerminalStore((s) => s.update);
  const remove = useTerminalStore((s) => s.remove);
  const { id, w, h, cwd } = terminal;
  const presets = usePresetStore((s) => s.presets);
  const preset = resolvePreset(presets, terminal.presetId);
  const activityRef = getActivityRef(id);

  // The session (xterm + PTY) lives in sessions.ts and survives unmounts; this
  // effect only parents its host element into this card's body.
  useEffect(() => {
    if (!bodyRef.current) return;
    ensureSession({ id, cwd: cwd || undefined, command: preset.command, container: bodyRef.current });
    return () => detachSession(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    fitSession(id);
  }, [w, h, id]);

  const close = (e: ReactPointerEvent) => {
    e.stopPropagation();
    destroySession(id);
    remove(id);
  };

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
        <span className="terminal-status-dot" />
        <span className="terminal-title">{terminal.name} &middot; {preset.label}</span>
        <button className="terminal-close" title="Close" onPointerDown={close}>
          <CloseIcon />
        </button>
      </div>
      <div ref={bodyRef} className="terminal-body" style={{ top: HEADER_H, bottom: FOOTER_H }} />
      <StatusFooter activityRef={activityRef} wrapRef={wrapRef} />
      <div className="terminal-resize" onPointerDown={beginResize} />
    </div>
  );
}

// Shallow compare is correct: the store's update() replaces only the changed
// terminal's object, so untouched windows keep referential equality and skip rendering.
export const TerminalWindow = memo(TerminalWindowInner);
