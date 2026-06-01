import { Tldraw, useEditor, createShapeId } from "tldraw";
import "tldraw/tldraw.css";
import "./App.css";
import { TerminalShapeUtil } from "./wall/TerminalShape";
import { TerminalOverlay } from "./wall/TerminalOverlay";

const customShapeUtils = [TerminalShapeUtil];

function WallUi() {
  const editor = useEditor();
  const addTerminal = () => {
    const { x, y } = editor.getViewportPageBounds().center;
    editor.createShape({
      id: createShapeId(),
      type: "terminal",
      x: x - 210,
      y: y - 130,
      props: { w: 420, h: 260, presetId: "plain", label: "Terminal", cwd: "", started: false },
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
