import { useEffect, useRef, useState } from "react";
import { Excalidraw, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, AppState, BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { readDesignFile, writeDesignFile } from "../store/persistence";
import { resolveDesignPath, ensureDesignFile } from "./designFile";
import { serializeScene, parseScene, DEFAULT_BG, type SceneElement, type SceneFiles } from "./normalize";
import { hashText, makeEchoGuard } from "./echoGuard";
import { watchDesignFile } from "./watch";
import { referenceInActiveTerminal } from "./reference";
import { createDesignStore, type StoreElement } from "./designStore";
import { applyExternalScene } from "./commit";
import { makeSaver, type Saver } from "./saver";
import { DesignTopBar } from "./DesignTopBar";
import { DesignLeftBar } from "./DesignLeftBar";
import { DesignRightPanel } from "./DesignRightPanel";
import { DesignZoomIsland } from "./DesignZoomIsland";
import { fitAll, fitSelection } from "./viewport";
import { DesignShortcuts } from "./DesignShortcuts";

type Initial = { elements: ExcalidrawElement[]; appState: Partial<AppState>; files: BinaryFiles };

const toEls = (e: SceneElement[]) =>
  restoreElements(e as unknown as ExcalidrawElement[], null);

const toFiles = (f: SceneFiles) => f as BinaryFiles;
const fileList = (f: SceneFiles) => Object.values(f) as BinaryFileData[];

export function DesignPage({ wallId, onBack }: { wallId: string; onBack: () => void }) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const storeRef = useRef(createDesignStore());
  const pathRef = useRef<string | null>(null);
  const loadedHash = useRef<string>("");
  const echo = useRef(makeEchoGuard());
  const bgRef = useRef<string>(DEFAULT_BG);
  const filesRef = useRef<BinaryFiles>({});
  const saverRef = useRef<Saver | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initial, setInitial] = useState<Initial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  /** Cleared per load; see the initial fit in onChange. */
  const didFit = useRef(false);
  const [framed, setFramed] = useState(false);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  /** Adopt an on-disk scene. Returns false — without claiming the content as
   *  loaded — on a parse failure or before the canvas has mounted, so a watcher
   *  event landing mid-mount can't leave the guard believing stale content is
   *  current. */
  function applyExternal(text: string): boolean {
    const r = parseScene(text);
    if (!r.ok) { setError(r.error); return false; }
    const api = apiRef.current;
    if (!api) return false;
    setError(null);
    loadedHash.current = hashText(text);
    bgRef.current = r.viewBackgroundColor;
    filesRef.current = toFiles(r.files);
    applyExternalScene(api, toEls(r.elements), r.viewBackgroundColor, fileList(r.files));
    return true;
  }

  /** Saver write-through: skips no-ops, yields to newer on-disk agent edits,
   *  owns echo-guard + loaded-hash bookkeeping. Rethrows write failures so
   *  the saver keeps the payload dirty and retries. */
  async function writeThrough(text: string) {
    const path = pathRef.current;
    if (!path) return;
    if (hashText(text) === loadedHash.current) return;
    const onDisk = await readDesignFile(path).catch(() => null);
    if (onDisk !== null && hashText(onDisk) !== loadedHash.current && !echo.current.isOwnEcho(onDisk)) {
      if (applyExternal(onDisk)) flash("reloaded — agent updated this UI");
      return;
    }
    echo.current.markWritten(text);
    try {
      await writeDesignFile(path, text);
      // Only now does loadedHash describe what is actually on disk. Claiming it
      // before the write lands opens a window where the watcher event for the
      // *previous* write reads the older content, sees a hash it doesn't
      // recognise, and reverts the canvas as if an agent had edited it.
      loadedHash.current = hashText(text);
      setError(null);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    const saver = makeSaver(writeThrough);
    saverRef.current = saver;
    const flushNow = () => { void saver.flush(); };
    window.addEventListener("blur", flushNow);
    window.addEventListener("beforeunload", flushNow);
    void (async () => {
      const path = await resolveDesignPath(wallId);
      if (!path) { if (!cancelled) setError("This space has no project folder."); return; }
      pathRef.current = path;
      await ensureDesignFile(path);
      const text = await readDesignFile(path).catch((e) => { setError(String(e)); return null; });
      if (text === null || cancelled) return;
      const r = parseScene(text);
      if (!r.ok) { setError(r.error); return; }
      loadedHash.current = hashText(text);
      bgRef.current = r.viewBackgroundColor;
      filesRef.current = toFiles(r.files);
      didFit.current = false;
      setFramed(false);
      setInitial({
        files: toFiles(r.files),
        elements: toEls(r.elements),
        appState: {
          viewBackgroundColor: r.viewBackgroundColor,
          // UI mockups, not hand sketches: crisp strokes, sharp corners, clean type
          currentItemRoughness: 0,
          currentItemRoundness: "sharp",
          currentItemFontFamily: 2,
          objectsSnapModeEnabled: true,
        },
      });
      const un = await watchDesignFile(path, async () => {
        const t = await readDesignFile(path).catch(() => null);
        if (t === null || cancelled) return;
        if (echo.current.isOwnEcho(t)) return;
        if (hashText(t) === loadedHash.current) return;
        if (applyExternal(t)) flash("reloaded — agent updated this UI");
      });
      if (cancelled) un(); else stop = un;
    })();
    return () => {
      cancelled = true;
      stop?.();
      window.removeEventListener("blur", flushNow);
      window.removeEventListener("beforeunload", flushNow);
      void saver.flush();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [wallId, reloadKey]);

  // Capture phase + stopPropagation keeps Excalidraw's own "?" help dialog
  // closed; typing targets are exempt.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return;
      const api = apiRef.current;
      if (e.key === "?") {
        e.preventDefault(); e.stopPropagation();
        setShowShortcuts((v) => !v);
      } else if (e.key === "Escape") {
        setShowShortcuts(false); // no preventDefault: Escape still deselects on canvas
      } else if (e.shiftKey && e.code === "Digit1" && api) {
        e.preventDefault(); e.stopPropagation();
        fitAll(api);
      } else if (e.shiftKey && e.code === "Digit2" && api) {
        e.preventDefault(); e.stopPropagation();
        fitSelection(api, storeRef.current.get().selectedIds);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  function onChange(els: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) {
    bgRef.current = appState.viewBackgroundColor ?? DEFAULT_BG;
    filesRef.current = files;
    // The design file carries no camera, so Excalidraw always opens at the
    // scene origin at 100% — a design drawn anywhere else was off-screen every
    // time the page was reopened. Frame it once per load, and keep the canvas
    // hidden until that lands (see .is-framing) so the design never appears
    // unfitted and then snaps. It waits for a measured viewport because
    // fitting earlier frames against Excalidraw's pre-measurement window size
    // rather than the canvas column.
    if (!didFit.current && appState.width > 0) {
      didFit.current = true;
      const api = apiRef.current;
      if (api && els.length) fitAll(api, { animate: false });
      setFramed(true);
    }
    storeRef.current.set({
      elements: els as unknown as readonly StoreElement[],
      selectedIds: appState.selectedElementIds as Record<string, boolean>,
      zoom: appState.zoom.value,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      width: appState.width,
      height: appState.height,
      activeType: (appState as { activeTool?: { type?: string } }).activeTool?.type ?? "selection",
      snapOn: (appState as { objectsSnapModeEnabled?: boolean }).objectsSnapModeEnabled ?? true,
    });
    // serialization happens at debounce-fire time, not per frame
    saverRef.current?.schedule(() =>
      serializeScene(
        storeRef.current.get().elements as unknown as SceneElement[],
        bgRef.current,
        filesRef.current,
      ),
    );
  }

  async function reference() {
    const path = pathRef.current;
    if (!path) return;
    const how = await referenceInActiveTerminal(path);
    flash(how === "sent" ? "added to the focused terminal" : "no terminal focused — path copied");
  }

  function handleBack() {
    void saverRef.current?.flush();
    onBack();
  }

  return (
    <div className="design-page">
      <DesignTopBar store={storeRef.current} apiRef={apiRef} onBack={handleBack} onReference={() => void reference()} />
      <DesignLeftBar store={storeRef.current} apiRef={apiRef} />

      <div className={initial && !framed ? "design-canvas is-framing" : "design-canvas"}>
        {error && (
          <div className="design-error">
            <span>{error}</span>
            {/* Without the canvas mounted there is nothing else to act on — an
                agent mid-write is the usual cause, so offer a re-read. */}
            {!initial && (
              <button
                className="design-error-retry"
                onClick={() => { setError(null); setReloadKey((k) => k + 1); }}
              >
                Try again
              </button>
            )}
          </div>
        )}
        {initial && (
          <Excalidraw
            excalidrawAPI={(api) => { apiRef.current = api; }}
            initialData={initial}
            theme="dark"
            onChange={onChange}
            UIOptions={{
              canvasActions: {
                changeViewBackgroundColor: false,
                clearCanvas: false,
                loadScene: false,
                saveToActiveFile: false,
                toggleTheme: false,
                export: false,
                saveAsImage: false,
              },
            }}
          />
        )}
        <DesignZoomIsland store={storeRef.current} apiRef={apiRef} />
        {toast && <div className="design-toast">{toast}</div>}
      </div>

      <DesignRightPanel store={storeRef.current} apiRef={apiRef} />
      {showShortcuts && <DesignShortcuts onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}
