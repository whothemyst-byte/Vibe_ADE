import { useEffect, useRef, useState, type ReactElement } from "react";
import "./App.css";
import { StartPage } from "./start/StartPage";
import { WallView } from "./wall/WallView";
import { TaskBoard } from "./tasks/TaskBoard";
import { VibeAgent } from "./vibe/VibeAgent";
import { useVibeCommand } from "./vibe/commands";
import { useVibeContext } from "./vibe/context";
import { loadIndex, saveIndex, pickFolder } from "./store/persistence";
import type { WallMeta } from "./store/types";
import { SignedIn, SignedOut, ClerkLoaded, ClerkLoading } from "@clerk/clerk-react";
import { LoginPage } from "./auth/LoginPage";

type View = { kind: "start" } | { kind: "wall"; id: string } | { kind: "tasks"; from: View };

export default function App() {
  const [view, setView] = useState<View>({ kind: "start" });

  const wallsRef = useRef<WallMeta[]>([]);
  useEffect(() => {
    void loadIndex().then((i) => { wallsRef.current = i; });
  }, [view]);
  useVibeContext("app", () => {
    const where =
      view.kind === "start" ? "start page"
      : view.kind === "tasks" ? "task board"
      : `space "${wallsRef.current.find((w) => w.id === view.id)?.name ?? "unknown"}"`;
    const names = wallsRef.current.map((w) => w.name).join(", ") || "none yet";
    return `current view: ${where}; existing spaces: ${names}`;
  });

  useVibeCommand({
    name: "go_to_start_page",
    description: "Navigate to the start page (the space picker).",
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
    name: "open_space",
    description: "Open a space (canvas workspace) by its name.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Space name, e.g. 'design'" } },
      required: ["name"],
    },
    run: async (args) => {
      const wanted = String(args.name ?? "").toLowerCase();
      const index = await loadIndex();
      const wall = index.find((w) => w.name.toLowerCase().includes(wanted));
      if (!wall) {
        const names = index.map((w) => w.name).join(", ") || "none";
        return `Error: no space matches "${args.name}". Existing spaces: ${names}.`;
      }
      setView({ kind: "wall", id: wall.id });
      return `Opened the space "${wall.name}".`;
    },
  });
  useVibeCommand({
    name: "create_space",
    description:
      "Create a NEW space (canvas workspace) in a folder and open it. If the user did not say where, ask where to create it — they can answer with a full folder path or ask you to open the folder picker.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            "Absolute folder path (e.g. C:\\Users\\admin\\Projects\\demo), or 'picker' to open the native folder picker",
        },
        name: { type: "string", description: "Optional space name; defaults to the folder name" },
      },
      required: ["location"],
    },
    run: async (args) => {
      let path = String(args.location ?? "").trim();
      const wantsPicker = !path || /\b(pick|picker|choose|browse|dialog|select)\b/i.test(path);
      if (wantsPicker) {
        const picked = await pickFolder();
        if (!picked) return "Error: the folder picker was closed without choosing a folder.";
        path = picked;
      } else if (!/^[a-zA-Z]:[\\/]/.test(path)) {
        return `Error: "${path}" is not a full Windows path. Ask the user for one (like C:\\Users\\admin\\Projects) or pass location "picker" to let them choose in a dialog.`;
      }
      const basename = path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || "wall";
      const name = String(args.name ?? "").trim() || basename;
      const index = await loadIndex();
      const meta: WallMeta = { id: crypto.randomUUID(), name, path, updatedAt: Date.now(), isCurrent: true };
      await saveIndex([...index.map((w) => ({ ...w, isCurrent: false })), meta]);
      setView({ kind: "wall", id: meta.id });
      return `Created and opened the space "${name}" at ${path}.`;
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
      <ClerkLoading>
        <div className="login-screen" />
      </ClerkLoading>
      <ClerkLoaded>
        <SignedOut>
          <LoginPage />
        </SignedOut>
        <SignedIn>
          {page}
          <VibeAgent />
        </SignedIn>
      </ClerkLoaded>
    </>
  );
}
