import { useEffect, useRef, useState } from "react";
import { Excalidraw, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { readDesignFile, writeDesignFile } from "../store/persistence";
import { resolveDesignPath, ensureDesignFile } from "./designFile";
import { serializeScene, parseScene, DEFAULT_BG, type SceneElement } from "./normalize";
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

type Initial = { elements: ExcalidrawElement[]; appState: Partial<AppState> };

const toEls = (e: SceneElement[]) =>
  restoreElements(e as unknown as ExcalidrawElement[], null);

export function DesignPage({ wallId, onBack }: { wallId: string; onBack: () => void }) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const storeRef = useRef(createDesignStore());
  const pathRef = useRef<string | null>(null);
  const loadedHash = useRef<string>("");
  const echo = useRef(makeEchoGuard());
  const bgRef = useRef<string>(DEFAULT_BG);
  const saverRef = useRef<Saver | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initial, setInitial] = useState<Initial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  function applyExternal(text: string) {
    const r = parseScene(text);
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    loadedHash.current = hashText(text);
    bgRef.current = r.viewBackgroundColor;
    const api = apiRef.current;
    if (api) applyExternalScene(api, toEls(r.elements), r.viewBackgroundColor);
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
      applyExternal(onDisk);
      flash("reloaded — agent updated this UI");
      return;
    }
    echo.current.markWritten(text);
    loadedHash.current = hashText(text);
    try {
      await writeDesignFile(path, text);
      setError(null);
    } catch (e) {
      loadedHash.current = ""; // the write didn't land; don't pretend it did
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
      setInitial({
        elements: toEls(r.elements),
        appState: {
          viewBackgroundColor: r.viewBackgroundColor,
          // UI mockups, not hand sketches: crisp strokes, sharp corners, clean type
          currentItemRoughness: 0,
          currentItemRoundness: "sharp",
          currentItemFontFamily: 2,
        },
      });
      const un = await watchDesignFile(path, async () => {
        const t = await readDesignFile(path).catch(() => null);
        if (t === null || cancelled) return;
        if (echo.current.isOwnEcho(t)) return;
        if (hashText(t) === loadedHash.current) return;
        applyExternal(t);
        flash("reloaded — agent updated this UI");
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
  }, [wallId]);

  function onChange(els: readonly ExcalidrawElement[], appState: AppState) {
    bgRef.current = appState.viewBackgroundColor ?? DEFAULT_BG;
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
      serializeScene(storeRef.current.get().elements as unknown as SceneElement[], bgRef.current),
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
      <DesignTopBar store={storeRef.current} onBack={handleBack} onReference={() => void reference()} />
      <DesignLeftBar store={storeRef.current} apiRef={apiRef} />

      <div className="design-canvas">
        {error && <div className="design-error">{error}</div>}
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
    </div>
  );
}
