import type { RefObject } from "react";
import { useTerminalStore } from "./terminalStore";
import { layerTransform, type Camera } from "./transform";
import { TerminalWindow } from "./TerminalWindow";

export function TerminalOverlay({
  layerRef,
  cameraRef,
}: {
  layerRef: RefObject<HTMLDivElement | null>;
  cameraRef: RefObject<Camera>;
}) {
  const terminals = useTerminalStore((s) => s.terminals);
  return (
    <div className="terminal-overlay">
      {/* Pan/zoom only touches this layer's transform (set imperatively via rAF
          in WallView); cameraRef is always current so re-renders stay consistent. */}
      <div
        ref={layerRef}
        className="terminal-layer"
        style={{ transform: layerTransform(cameraRef.current) }}
      >
        {terminals.map((t) => (
          <TerminalWindow key={t.id} terminal={t} cameraRef={cameraRef} />
        ))}
      </div>
    </div>
  );
}
