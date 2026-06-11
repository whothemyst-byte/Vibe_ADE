import { useState, type ReactElement } from "react";
import "./App.css";
import { StartPage } from "./start/StartPage";
import { WallView } from "./wall/WallView";
import { TaskBoard } from "./tasks/TaskBoard";
import { VibeAgent } from "./vibe/VibeAgent";
import { useVibeCommand } from "./vibe/commands";
import { loadIndex } from "./store/persistence";

type View = { kind: "start" } | { kind: "wall"; id: string } | { kind: "tasks"; from: View };

export default function App() {
  const [view, setView] = useState<View>({ kind: "start" });

  useVibeCommand({
    name: "go_to_start_page",
    description: "Navigate to the start page (the wall picker).",
    run: () => { setView({ kind: "start" }); return "Now on the start page."; },
  });
  useVibeCommand({
    name: "open_task_board",
    description: "Open the task board view.",
    run: () => {
      setView((v) => (v.kind === "tasks" ? v : { kind: "tasks", from: v }));
      return "Task board is open.";
    },
  });
  useVibeCommand({
    name: "open_wall",
    description: "Open a wall (canvas workspace) by its name.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Wall name, e.g. 'design'" } },
      required: ["name"],
    },
    run: async (args) => {
      const wanted = String(args.name ?? "").toLowerCase();
      const index = await loadIndex();
      const wall = index.find((w) => w.name.toLowerCase().includes(wanted));
      if (!wall) {
        const names = index.map((w) => w.name).join(", ") || "none";
        return `Error: no wall matches "${args.name}". Existing walls: ${names}.`;
      }
      setView({ kind: "wall", id: wall.id });
      return `Opened the wall "${wall.name}".`;
    },
  });

  let page: ReactElement;
  if (view.kind === "start") {
    page = (
      <StartPage
        onOpen={(id) => setView({ kind: "wall", id })}
        onTasks={() => setView({ kind: "tasks", from: { kind: "start" } })}
      />
    );
  } else if (view.kind === "tasks") {
    page = (
      <TaskBoard
        onBack={() => setView(view.from)}
        onOpenWall={(id) => setView({ kind: "wall", id })}
      />
    );
  } else {
    page = (
      <WallView
        wallId={view.id}
        onExit={() => setView({ kind: "start" })}
        onSwitch={(id) => setView({ kind: "wall", id })}
        onTasks={() => setView({ kind: "tasks", from: view })}
      />
    );
  }
  return (
    <>
      {page}
      <VibeAgent />
    </>
  );
}
