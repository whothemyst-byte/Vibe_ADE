import { useState } from "react";
import "./App.css";
import { StartPage } from "./start/StartPage";
import { WallView } from "./wall/WallView";

type View = { kind: "start" } | { kind: "wall"; id: string };

export default function App() {
  const [view, setView] = useState<View>({ kind: "start" });
  return view.kind === "start" ? (
    <StartPage onOpen={(id) => setView({ kind: "wall", id })} />
  ) : (
    <WallView
      wallId={view.id}
      onExit={() => setView({ kind: "start" })}
      onSwitch={(id) => setView({ kind: "wall", id })}
    />
  );
}
