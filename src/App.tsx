import { useState } from "react";
import "./App.css";
import { StartPage } from "./start/StartPage";
import { WallView } from "./wall/WallView";
import { TaskBoard } from "./tasks/TaskBoard";

type View = { kind: "start" } | { kind: "wall"; id: string } | { kind: "tasks"; from: View };

export default function App() {
  const [view, setView] = useState<View>({ kind: "start" });

  if (view.kind === "start") {
    return (
      <StartPage
        onOpen={(id) => setView({ kind: "wall", id })}
        onTasks={() => setView({ kind: "tasks", from: { kind: "start" } })}
      />
    );
  }
  if (view.kind === "tasks") {
    return (
      <TaskBoard
        onBack={() => setView(view.from)}
        onOpenWall={(id) => setView({ kind: "wall", id })}
      />
    );
  }
  return (
    <WallView
      wallId={view.id}
      onExit={() => setView({ kind: "start" })}
      onSwitch={(id) => setView({ kind: "wall", id })}
      onTasks={() => setView({ kind: "tasks", from: view })}
    />
  );
}
