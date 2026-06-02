import { useTerminalStore } from "./terminalStore";
import { worldRectToScreen, type Camera } from "./transform";
import { TerminalWindow } from "./TerminalWindow";

export function TerminalOverlay({ camera }: { camera: Camera }) {
  const terminals = useTerminalStore((s) => s.terminals);
  return (
    <div className="terminal-overlay">
      {terminals.map((t) => {
        const screen = worldRectToScreen({ x: t.x, y: t.y, w: t.w, h: t.h }, camera);
        return (
          <div
            key={t.id}
            className="terminal-window"
            style={{
              transform: `translate(${screen.left}px, ${screen.top}px) scale(${camera.z})`,
              transformOrigin: "top left",
              width: t.w,
              height: t.h,
            }}
          >
            <TerminalWindow terminal={t} zoom={camera.z} />
          </div>
        );
      })}
    </div>
  );
}
