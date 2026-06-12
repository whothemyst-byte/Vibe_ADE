import { memo, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { HEADER_H, FOOTER_H, type Camera } from "./transform";
import { useCardStore, type TerminalCard } from "./cardStore";
import { usePresetStore } from "./presetStore";
import { resolvePreset } from "./presets";
import { StatusFooter } from "./StatusFooter";
import { CloseIcon } from "./icons";
import { ensureSession, detachSession, destroySession, fitSession, getActivityRef } from "./sessions";
import { nearestSlotIndex } from "./gridLayout";
import { removeCardWithFade } from "./removeCard";

function TerminalWindowInner({
  terminal,
  cameraRef,
}: {
  terminal: TerminalCard;
  cameraRef: RefObject<Camera>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
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
    removeCardWithFade(id, () => destroySession(id));
  };

  // Dragging follows the cursor (DOM-only, no per-frame React work); on release
  // the terminal either snaps back or commits a grid reorder via moveToIndex,
  // which triggers WallView's layout pass.
  const beginDrag = (e: ReactPointerEvent) => {
    e.stopPropagation();
    // The cursor must lead 1:1 — suspend the re-flow glide for the gesture.
    if (wrapRef.current) wrapRef.current.style.transition = "none";
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
      // Snap the element back first; a reorder re-renders with new positions anyway.
      // Transition restored first so the snap-back (or re-flow) glides.
      const el = wrapRef.current;
      if (el) {
        el.style.transition = "";
        el.style.transform = `translate(${terminal.x}px, ${terminal.y}px)`;
      }
      const { cards, moveToIndex } = useCardStore.getState();
      const slot = nearestSlotIndex(
        { x: nx + terminal.w / 2, y: ny + terminal.h / 2 },
        cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
      );
      const from = cards.findIndex((c) => c.id === id);
      if (slot !== -1 && slot !== from) moveToIndex(id, slot);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={wrapRef}
      className="terminal-window"
      data-card-id={id}
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
    </div>
  );
}

// Shallow compare is correct: the store's update() replaces only the changed
// terminal's object, so untouched windows keep referential equality and skip rendering.
export const TerminalWindow = memo(TerminalWindowInner);
