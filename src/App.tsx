import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import "./App.css";

export default function App() {
  return (
    <div className="wall-root">
      <Tldraw colorScheme="system" persistenceKey={undefined} />
    </div>
  );
}
