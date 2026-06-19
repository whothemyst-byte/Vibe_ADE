import type { RefObject } from "react";
import { useCardStore } from "./cardStore";
import { layerTransform, type Camera } from "./transform";
import { TerminalWindow } from "./TerminalWindow";
import { BrowserWindow } from "./BrowserWindow";
import { FileViewerWindow } from "./FileViewerWindow";

export function TerminalOverlay({
  layerRef,
  cameraRef,
}: {
  layerRef: RefObject<HTMLDivElement | null>;
  cameraRef: RefObject<Camera>;
}) {
  const cards = useCardStore((s) => s.cards);
  return (
    <div className="terminal-overlay">
      {/* Pan/zoom only touches this layer's transform (set imperatively via rAF
          in WallView); cameraRef is always current so re-renders stay consistent. */}
      <div
        ref={layerRef}
        className="terminal-layer"
        style={{ transform: layerTransform(cameraRef.current) }}
      >
        {cards.map((c) =>
          c.kind === "terminal" ? (
            <TerminalWindow key={c.id} terminal={c} cameraRef={cameraRef} />
          ) : c.kind === "browser" ? (
            <BrowserWindow key={c.id} card={c} cameraRef={cameraRef} />
          ) : c.kind === "file" ? (
            <FileViewerWindow key={c.id} card={c} cameraRef={cameraRef} />
          ) : null  /* design card rendered in Task 8 */
        )}
      </div>
    </div>
  );
}
