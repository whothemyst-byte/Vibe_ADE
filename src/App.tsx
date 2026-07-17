import { useEffect, useRef, useState, type ReactElement, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import "./App.css";
import { StartPage } from "./start/StartPage";
import { WallView } from "./wall/WallView";
import { TaskBoard } from "./tasks/TaskBoard";
import { VibeAgent } from "./vibe/VibeAgent";
import { useVibeCommand } from "./vibe/commands";
import { useVibeContext } from "./vibe/context";
import { loadIndex, saveIndex, pickFolder, openFolder } from "./store/persistence";
import type { WallMeta } from "./store/types";
import { SignedIn, SignedOut, ClerkLoaded, ClerkLoading } from "@clerk/clerk-react";
import { LoginPage } from "./auth/LoginPage";
import { TeamsBootstrap } from "./teams/TeamsBootstrap";
import { TeamsView } from "./teams/TeamsView";
import { DesignPage } from "./design/DesignPage";
import { TitleBar } from "./chrome/TitleBar";
import { ResizeHandles } from "./chrome/ResizeHandles";
import { initControlBridge } from "./control/bridge";

type View =
  | { kind: "start" }
  | { kind: "wall"; id: string }
  | { kind: "tasks"; from: View }
  | { kind: "teams"; from: View }
  | { kind: "design"; wallId: string; from: View };

/** Shown while Clerk loads. If it never finishes (offline, Clerk outage), the
 *  blank screen turns into an explanation with a retry instead of hanging. */
function AuthGateFallback() {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setStuck(true), 12_000);
    return () => window.clearTimeout(t);
  }, []);
  if (!stuck) return <div className="login-screen" />;
  return (
    <div className="login-screen auth-offline">
      <p>Can't reach the sign-in service. Check your connection and try again.</p>
      <button className="login-submit auth-offline-retry" onClick={() => window.location.reload()}>
        Retry
      </button>
    </div>
  );
}

export default function App() {
  const [view, setViewRaw] = useState<View>({ kind: "start" });

  // Every page swap goes through here: animate it as a view transition
  // (Chromium/WebView2) so the old page cross-fades out instead of vanishing.
  const setView = (next: SetStateAction<View>) => {
    if (typeof document.startViewTransition !== "function") { setViewRaw(next); return; }
    document.startViewTransition(() => { flushSync(() => setViewRaw(next)); });
  };

  useEffect(() => {
    const open = () => setView((v) => (v.kind === "teams" ? v : { kind: "teams", from: v }));
    window.addEventListener("vibe:open-teams", open);
    return () => window.removeEventListener("vibe:open-teams", open);
  }, []);

  // Agents' vibectl requests (canvas-control server) land here.
  useEffect(() => {
    const un = initControlBridge();
    return () => { void un.then((f) => f()); };
  }, []);

  const wallsRef = useRef<WallMeta[]>([]);
  useEffect(() => {
    void loadIndex().then((i) => { wallsRef.current = i; });
  }, [view]);

  useVibeContext("app", () => {
    const where =
      view.kind === "start" ? "start page"
      : view.kind === "tasks" ? "task board"
      : view.kind === "teams" ? "teams view"
      : view.kind === "design" ? "UI design canvas"
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
    name: "open_teams",
    description: "Open the Teams view (organization, members, and shared projects).",
    run: () => {
      setView((v) => (v.kind === "teams" ? v : { kind: "teams", from: v }));
      return "Teams view is open.";
    },
  });
  useVibeCommand({
    name: "open_ui",
    description: "Open the current space's UI design canvas (the Figma-like infinite canvas).",
    run: () => {
      if (view.kind !== "wall") return "Open a space first, then open its UI canvas.";
      setView({ kind: "design", wallId: view.id, from: view });
      return "Opened the UI canvas.";
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
  useVibeCommand({
    name: "open_folder",
    description:
      "Open a space's project folder in the OS file explorer. With no name, opens the currently open space's folder.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Optional space name; defaults to the currently open space" },
      },
    },
    run: async (args) => {
      const index = await loadIndex();
      const wanted = String(args.name ?? "").trim().toLowerCase();
      const target = wanted
        ? index.find((w) => w.name.toLowerCase() === wanted)
        : view.kind === "wall"
          ? index.find((w) => w.id === view.id)
          : undefined;
      if (!target) return wanted ? `Error: no space named "${args.name}".` : "Error: no space is open. Open one or pass a name.";
      await openFolder(target.path);
      return `Opened the folder for "${target.name}" (${target.path}).`;
    },
  });

  let page: ReactElement;
  if (view.kind === "start") {
    page = (
      <StartPage
        onOpen={(id) => setView({ kind: "wall", id })}
        onTasks={() => setView({ kind: "tasks", from: { kind: "start" } })}
        onTeams={() => setView({ kind: "teams", from: { kind: "start" } })}
      />
    );
  } else if (view.kind === "tasks") {
    page = (
      <TaskBoard
        onBack={() => setView(view.from)}
        onOpenWall={(id) => setView({ kind: "wall", id })}
        fromWallId={
          view.from.kind === "wall" ? view.from.id
          : view.from.kind === "design" ? view.from.wallId
          : undefined
        }
      />
    );
  } else if (view.kind === "teams") {
    page = <TeamsView onBack={() => setView(view.from)} onOpenWall={(id) => setView({ kind: "wall", id })} />;
  } else if (view.kind === "design") {
    page = <DesignPage wallId={view.wallId} onBack={() => setView(view.from)} />;
  } else {
    page = (
      <WallView
        wallId={view.id}
        onExit={() => setView({ kind: "start" })}
        onSwitch={(id) => setView({ kind: "wall", id })}
        onDesign={() => setView({ kind: "design", wallId: view.id, from: view })}
        onTasks={() => setView({ kind: "tasks", from: view })}
        onTeams={() => setView({ kind: "teams", from: view })}
      />
    );
  }
  return (
    <>
      <TitleBar />
      <ResizeHandles />
      <ClerkLoading>
        <AuthGateFallback />
      </ClerkLoading>
      <ClerkLoaded>
        <SignedOut>
          <LoginPage />
        </SignedOut>
        <SignedIn>
          {page}
          <VibeAgent />
          <TeamsBootstrap />
        </SignedIn>
      </ClerkLoaded>
    </>
  );
}
