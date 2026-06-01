import { track } from "@tldraw/state-react";
import { useEditor } from "tldraw";
import type { TerminalShape } from "./TerminalShape";
import { worldRectToScreen } from "./transform";
import { TerminalWindow } from "./TerminalWindow";

// track() wraps the component in a reactive context. Any signal reads inside
// (editor.getCamera(), editor.getCurrentPageShapes()) are auto-tracked, so the
// component re-renders whenever the camera or shapes change.
export const TerminalOverlay = track(function TerminalOverlay() {
  const editor = useEditor();

  const camera = editor.getCamera();
  const terminals = editor
    .getCurrentPageShapes()
    .filter((s): s is TerminalShape => s.type === "terminal");

  return (
    <div className="terminal-overlay">
      {terminals.map((shape) => {
        const screen = worldRectToScreen(
          { x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h },
          camera
        );
        // World-sized content, CSS-scaled by zoom. Keeps the xterm grid fixed
        // during zoom (no reflow) — only translate/scale change.
        return (
          <div
            key={shape.id}
            className="terminal-window"
            style={{
              transform: `translate(${screen.left}px, ${screen.top}px) scale(${camera.z})`,
              transformOrigin: "top left",
              width: shape.props.w,
              height: shape.props.h,
            }}
          >
            <TerminalWindow shape={shape} editor={editor} />
          </div>
        );
      })}
    </div>
  );
});
