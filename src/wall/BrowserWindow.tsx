import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { HEADER_H, worldRectToScreen, type Camera } from "./transform";
import { useCardStore, type BrowserCard } from "./cardStore";
import { BackIcon, CloseIcon, ReloadIcon } from "./icons";
import { nearestSlotIndex } from "./gridLayout";
import { setBrowserSyncHandler, syncBrowserRect } from "./browserSync";
import { useBrowserBlockers } from "./browserVisibility";
import { BROWSER_ID, closeBrowser, openBrowser } from "./browserActions";
import * as client from "../browser/client";

function BrowserWindowInner({
  card,
  cameraRef,
}: {
  card: BrowserCard;
  cameraRef: RefObject<Camera>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [urlInput, setUrlInput] = useState(card.url);
  const [title, setTitle] = useState("Browser");
  const [error, setError] = useState<string | null>(null);
  const blockers = useBrowserBlockers((s) => s.count);
  /** Hide reasons beyond blockers (currently: while dragging the card). */
  const hiddenRef = useRef(false);

  // One native-webview lifecycle per mount: create hidden, position, reveal.
  // Unmount (card closed or wall exited) destroys it; the URL lives in the doc.
  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let lastSent = "";

    const bodyRect = () => {
      const c = useCardStore.getState().cards.find((x) => x.id === BROWSER_ID);
      if (!c) return null;
      return worldRectToScreen(
        { x: c.x, y: c.y + HEADER_H, w: c.w, h: c.h - HEADER_H },
        cameraRef.current
      );
    };

    const sync = () => {
      if (disposed) return;
      const body = bodyRect();
      if (!body) return;
      const offscreen =
        body.left + body.width < 0 ||
        body.top + body.height < 0 ||
        body.left > window.innerWidth ||
        body.top > window.innerHeight;
      const visible =
        !offscreen && useBrowserBlockers.getState().count === 0 && !hiddenRef.current;
      const z = cameraRef.current.z;
      const msg = JSON.stringify([body, visible, z]);
      if (msg === lastSent) return; // skip no-op IPC
      lastSent = msg;
      void client
        .browserSetRect({ x: body.left, y: body.top, w: body.width, h: body.height }, z)
        .then(() => client.browserSetVisible(visible))
        .catch(() => {}); // self-corrects on the next camera tick
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
      });
    };
    setBrowserSyncHandler(schedule);

    let unNav: (() => void) | null = null;
    void (async () => {
      unNav = await client.onBrowserNav((url) => {
        if (disposed) return;
        useCardStore.getState().update(BROWSER_ID, { url });
        setUrlInput(url);
        setError(null);
        // The title settles after load; best-effort fetch shortly after.
        window.setTimeout(() => {
          void client
            .browserStatus()
            .then((s) => {
              if (!disposed) setTitle(s.title || url);
            })
            .catch(() => {});
        }, 600);
      });
      if (disposed) return;
      const body = bodyRect();
      try {
        await client.browserOpen(
          card.url,
          body
            ? { x: body.left, y: body.top, w: body.width, h: body.height }
            : { x: 0, y: 0, w: 800, h: 600 },
          cameraRef.current.z
        );
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : String(e));
        return;
      }
      sync(); // position with the settled grid rect, then reveal
    })();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      setBrowserSyncHandler(null);
      unNav?.();
      void client.browserClose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reposition when the grid moves the card or an overlay opens/closes.
  useEffect(() => {
    syncBrowserRect();
  }, [card.x, card.y, card.w, card.h, blockers]);

  const commitUrl = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    setError(null);
    void openBrowser(urlInput).catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    );
  };

  const close = (e: ReactPointerEvent) => {
    e.stopPropagation();
    closeBrowser();
  };

  // Same drag-to-reorder gesture as TerminalWindow; the webview is hidden for
  // the duration so the chrome can move freely above the canvas.
  const beginDrag = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("input,button")) return;
    e.stopPropagation();
    hiddenRef.current = true;
    syncBrowserRect();
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
      if (el) el.style.transform = `translate(${card.x}px, ${card.y}px)`;
      const { cards, moveToIndex } = useCardStore.getState();
      const slot = nearestSlotIndex(
        { x: nx + card.w / 2, y: ny + card.h / 2 },
        cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
      );
      const from = cards.findIndex((c) => c.id === BROWSER_ID);
      if (slot !== -1 && slot !== from) moveToIndex(BROWSER_ID, slot);
      hiddenRef.current = false;
      syncBrowserRect();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={wrapRef}
      className="terminal-window"
      style={{ transform: `translate(${card.x}px, ${card.y}px)`, width: card.w, height: card.h }}
    >
      <div className="terminal-header" style={{ height: HEADER_H }} onPointerDown={beginDrag}>
        <button
          className="browser-nav-btn"
          title="Back"
          onPointerDown={(e) => {
            e.stopPropagation();
            void client.browserBack();
          }}
        >
          <BackIcon />
        </button>
        <button
          className="browser-nav-btn"
          title="Reload"
          onPointerDown={(e) => {
            e.stopPropagation();
            void client.browserReload();
          }}
        >
          <ReloadIcon />
        </button>
        <input
          className={`browser-urlbar${error ? " browser-error" : ""}`}
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={commitUrl}
          onPointerDown={(e) => e.stopPropagation()}
          spellCheck={false}
          title={error ?? title}
        />
        <button className="terminal-close" title="Close" onPointerDown={close}>
          <CloseIcon />
        </button>
      </div>
      {/* The native webview paints above this body; the hint shows through
          before the first load and whenever the webview is hidden. */}
      <div className="terminal-body" style={{ top: HEADER_H, bottom: 0 }}>
        <div className="browser-body-hint">{error ?? "loading…"}</div>
      </div>
    </div>
  );
}

// Same shallow-compare rationale as TerminalWindow.
export const BrowserWindow = memo(BrowserWindowInner);
