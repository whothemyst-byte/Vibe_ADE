import {
  memo, useEffect, useRef, useState,
  type PointerEvent as ReactPointerEvent, type RefObject,
} from "react";
import { HEADER_H, type Camera } from "../wall/transform";
import { useCardStore, type DesignCard } from "../wall/cardStore";
import { CloseIcon, FileIcon } from "../wall/icons";
import { nearestSlotIndex } from "../wall/gridLayout";
import { readTextFile, writeDesignFile } from "../store/persistence";
import { parseDesign, type DesignDoc } from "./schema";
import { serializeDesign } from "./serialize";
import { hashText, makeEchoGuard, shouldReloadOnConflict } from "./echoGuard";
import { watchDesignFile } from "./watch";
import { closeDesign } from "./designCard";
import { FrameView } from "./render";

function DesignWindowInner({ card, cameraRef }: { card: DesignCard; cameraRef: RefObject<Camera> }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<DesignDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const loadedHash = useRef<string>("");
  const echo = useRef(makeEchoGuard());
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applyText(text: string) {
    const res = parseDesign(text);
    if (res.ok) { setDoc(res.doc); setError(null); loadedHash.current = hashText(text); }
    else setError(res.error); // keep last good render; show banner
  }

  // Initial load + live reload on external (agent) writes.
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    readTextFile(card.path).then((t) => { if (!cancelled) applyText(t); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    watchDesignFile(card.path, async () => {
      const t = await readTextFile(card.path).catch(() => null);
      if (t === null) return;
      if (echo.current.isOwnEcho(t)) return; // ignore our own save
      applyText(t);
    }).then((un) => { if (cancelled) un(); else stop = un; });
    return () => { cancelled = true; stop?.(); };
  }, [card.path]);

  function persist(next: DesignDoc) {
    const text = serializeDesign(next);
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(async () => {
      const onDisk = await readTextFile(card.path).catch(() => null);
      if (onDisk !== null && shouldReloadOnConflict(loadedHash.current, hashText(onDisk))) {
        applyText(onDisk); // agent changed it underneath us — agent wins
        setToast("reloaded — agent updated this design");
        setTimeout(() => setToast(null), 2200);
        return;
      }
      echo.current.markWritten(text);
      loadedHash.current = hashText(text);
      await writeDesignFile(card.path, text).catch((e) => setError(String(e)));
    }, 300);
  }

  function moveFrame(frameId: string, dx: number, dy: number) {
    setDoc((d) => {
      if (!d) return d;
      const next: DesignDoc = {
        ...d,
        frames: d.frames.map((f) =>
          f.id === frameId ? { ...f, x: Math.round(f.x + dx), y: Math.round(f.y + dy) } : f),
      };
      persist(next);
      return next;
    });
  }

  // Drag a frame by its title bar; delta is screen px / camera zoom.
  function beginFrameDrag(frameId: string, e: ReactPointerEvent) {
    e.stopPropagation();
    const z = cameraRef.current.z;
    let lx = e.clientX, ly = e.clientY;
    const onMove = (ev: PointerEvent) => {
      moveFrame(frameId, (ev.clientX - lx) / z, (ev.clientY - ly) / z);
      lx = ev.clientX; ly = ev.clientY;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const close = (e: ReactPointerEvent) => { e.stopPropagation(); closeDesign(); };

  // Drag-to-reorder the whole card (same gesture as FileViewerWindow).
  const beginCardDrag = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.stopPropagation();
    if (wrapRef.current) wrapRef.current.style.transition = "none";
    const z = cameraRef.current.z;
    const sx = e.clientX, sy = e.clientY, ox = card.x, oy = card.y;
    let nx = ox, ny = oy;
    const onMove = (ev: PointerEvent) => {
      nx = ox + (ev.clientX - sx) / z; ny = oy + (ev.clientY - sy) / z;
      const el = wrapRef.current; if (el) el.style.transform = `translate(${nx}px, ${ny}px)`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const el = wrapRef.current;
      if (el) { el.style.transition = ""; el.style.transform = `translate(${card.x}px, ${card.y}px)`; }
      const { cards, moveToIndex } = useCardStore.getState();
      const slot = nearestSlotIndex(
        { x: nx + card.w / 2, y: ny + card.h / 2 },
        cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })));
      const from = cards.findIndex((c) => c.id === card.id);
      if (slot !== -1 && slot !== from) moveToIndex(card.id, slot);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={wrapRef}
      className="terminal-window"
      data-card-id={card.id}
      style={{ transform: `translate(${card.x}px, ${card.y}px)`, width: card.w, height: card.h }}
    >
      <div className="terminal-header" style={{ height: HEADER_H }} onPointerDown={beginCardDrag}>
        <span className="file-header-icon"><FileIcon /></span>
        <span className="terminal-title" title={card.path}>{card.name}</span>
        <button className="terminal-close" title="Close" onPointerDown={close}><CloseIcon /></button>
      </div>
      <div
        className="terminal-body"
        style={{ top: HEADER_H, bottom: 0, position: "absolute", left: 0, right: 0, overflow: "auto", background: "#0e0c0a" }}
      >
        {error && <div className="file-hint file-error" style={{ position: "sticky", top: 0 }}>{error}</div>}
        {toast && <div className="file-hint" style={{ position: "sticky", top: 0 }}>{toast}</div>}
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          {doc?.frames.map((f) => (
            <div key={f.id}>
              <FrameView frame={f} tokens={doc.tokens} />
              {/* drag bar to move the frame (writes back to file) */}
              <div
                title={`Move ${f.name}`}
                onPointerDown={(e) => beginFrameDrag(f.id, e)}
                style={{ position: "absolute", left: f.x, top: f.y - 18, width: f.w,
                  height: 18, cursor: "grab", fontSize: 11, color: "#9a8f80",
                  display: "flex", alignItems: "center", padding: "0 6px" }}
              >{f.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const DesignWindow = memo(DesignWindowInner);
