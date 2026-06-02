import { Tldraw, useEditor, createShapeId } from "tldraw";
import "tldraw/tldraw.css";
import "./App.css";
import { TerminalShapeUtil } from "./wall/TerminalShape";
import { TerminalOverlay } from "./wall/TerminalOverlay";
import { findSpawnPoint, type Rect } from "./wall/transform";

const customShapeUtils = [TerminalShapeUtil];
const TERMINAL_SIZE = { w: 420, h: 260 };

function WallUi() {
  const editor = useEditor();
  const addTerminal = () => {
    const vp = editor.getViewportPageBounds();
    const viewport: Rect = { x: vp.x, y: vp.y, w: vp.w, h: vp.h };
    const obstacles: Rect[] = editor
      .getCurrentPageShapes()
      .map((s) => editor.getShapePageBounds(s))
      .filter((b): b is NonNullable<typeof b> => !!b)
      .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
    const { x, y } = findSpawnPoint(viewport, obstacles, TERMINAL_SIZE);
    editor.createShape({
      id: createShapeId(),
      type: "terminal",
      x,
      y,
      props: { w: TERMINAL_SIZE.w, h: TERMINAL_SIZE.h, presetId: "plain", label: "Terminal", cwd: "", started: false },
    });
  };
  return (
    <button className="add-terminal" onPointerDown={addTerminal}>
      + Terminal
    </button>
  );
}

export default function App() {
  return (
    <div className="wall-root">
      <Tldraw colorScheme="dark" shapeUtils={customShapeUtils}>
        <WallUi />
        <TerminalOverlay />
      </Tldraw>
    </div>
  );
}
