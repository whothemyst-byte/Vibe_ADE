import {
  memo,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { HEADER_H, type Camera } from "./transform";
import { useCardStore, type FileCard } from "./cardStore";
import { CloseIcon, FileIcon } from "./icons";
import { nearestSlotIndex } from "./gridLayout";
import { closeFile } from "./fileActions";
import { readTextFile } from "../store/persistence";

function FileViewerWindowInner({
  card,
  cameraRef,
}: {
  card: FileCard;
  cameraRef: RefObject<Camera>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-read whenever the viewer is pointed at a different file.
  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    readTextFile(card.path)
      .then((text) => { if (!cancelled) setContent(text); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [card.path]);

  const close = (e: ReactPointerEvent) => {
    e.stopPropagation();
    closeFile();
  };

  // Same drag-to-reorder gesture as TerminalWindow.
  const beginDrag = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.stopPropagation();
    if (wrapRef.current) wrapRef.current.style.transition = "none";
    const z = cameraRef.current.z;
    const sx = e.clientX, sy = e.clientY;
    const ox = card.x, oy = card.y;
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
      const el = wrapRef.current;
      if (el) {
        el.style.transition = "";
        el.style.transform = `translate(${card.x}px, ${card.y}px)`;
      }
      const { cards, moveToIndex } = useCardStore.getState();
      const slot = nearestSlotIndex(
        { x: nx + card.w / 2, y: ny + card.h / 2 },
        cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
      );
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
      <div className="terminal-header" style={{ height: HEADER_H }} onPointerDown={beginDrag}>
        <span className="file-header-icon"><FileIcon /></span>
        <span className="terminal-title" title={card.path}>{card.name}</span>
        <button className="terminal-close" title="Close" onPointerDown={close}>
          <CloseIcon />
        </button>
      </div>
      <div className="terminal-body file-body" style={{ top: HEADER_H, bottom: 0 }}>
        {error ? (
          <div className="file-hint file-error">{error}</div>
        ) : content === null ? (
          <div className="file-hint">loading…</div>
        ) : (
          <pre className="file-pre">{content}</pre>
        )}
      </div>
    </div>
  );
}

// Same shallow-compare rationale as TerminalWindow.
export const FileViewerWindow = memo(FileViewerWindowInner);
