# Command Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Ctrl+K` searchable command palette on the wall view covering launch, navigation, canvas-tool, and window actions.

**Architecture:** A pure action registry (`buildActions`) is assembled in `WallView` from callbacks it already owns and passed to a dumb overlay component (`CommandPalette`). Fuzzy ranking is a standalone pure module. No new global state; palette open/close is local `useState` in `WallView`.

**Tech Stack:** React 19 + TypeScript, zustand (read-only snapshots), vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-03-command-palette-and-mobile-simulator-design.md` (Part 1).

## Amendments (2026-07-16, pre-execution)

Written 2026-07-03; Packages B–D landed since. The registry additionally covers
everything invocable that shipped in between:

- **Launch**: "Open music player" (`openMusic`, Package D) and "Run boot recipe"
  (Package C — only listed when `recipeEntries(cards)` is non-empty; replays via
  the caller, which uses the same `sendToSession` path as the vibe command).
- **Windows**: "Close music player" and "Next station" when the music card is open.
- **Themes** (new section): one "Theme: <name>" action per `THEMES` entry
  (includes the 8 Package-D scenes); WallView wires it to its existing `changeBg`.
- Cursor/Gemini presets need no registry change — presets are injected from
  `usePresetStore`, so Task 2's fixtures stay minimal.
- The minimap is auto-show only (no manual toggle exists), so it has no action.
- Task 4's WallView line numbers are stale; anchors re-verified 2026-07-16:
  state ~line 84, `changeBg` ~468, `focus_terminal` command ~638-666,
  `selectTool` ~841, `<Toolbar>` ~856, `<ToolsIsland>` ~892.

## Global Constraints

- Repo: `vibe-space/` (its own git repo, branch `V1.0.0`). All paths below are relative to the repo root.
- Tests are colocated: `foo.ts` → `foo.test.ts` in the same directory. Run with `npx vitest run <path>`.
- Overlays that cover the canvas MUST call `useBlocksBrowser(open)` (`src/wall/browserVisibility.ts`) so the native browser webview hides beneath them.
- Match existing style: 2-space indent, double quotes, no semicolon omission, doc comments explain constraints not mechanics.
- The "Simulator" launch action from the spec is added by the separate simulator plan, not this one.
- After each commit, run `graphify update .` is NOT required per-task; run it once at the end of the plan.

---

### Task 1: Fuzzy scorer and ranking

**Files:**
- Create: `src/palette/fuzzy.ts`
- Test: `src/palette/fuzzy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `fuzzyScore(query: string, text: string): number | null`, `scoreCandidate(query: string, label: string, keywords: string[]): number | null`, `rankActions<T extends { label: string; keywords: string[] }>(query: string, actions: T[]): T[]` — Task 3 calls `rankActions`.

- [ ] **Step 1: Write the failing test**

Create `src/palette/fuzzy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fuzzyScore, rankActions, scoreCandidate } from "./fuzzy";

describe("fuzzyScore", () => {
  it("matches subsequences and rejects non-matches", () => {
    expect(fuzzyScore("bro", "Browser")).not.toBeNull();
    expect(fuzzyScore("xyz", "Browser")).toBeNull();
  });

  it("empty query matches everything with zero score", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(fuzzyScore("CLAUDE", "claude code")).not.toBeNull();
  });

  it("scores word starts above mid-word hits", () => {
    // "Settings" starts with s; in "Tasks" the s is mid-word.
    expect(fuzzyScore("s", "Settings")!).toBeGreaterThan(fuzzyScore("s", "Tasks")!);
  });

  it("scores consecutive runs above scattered hits", () => {
    // "br" in "Browser": word start (3) + consecutive (2) = 5.
    // "br" in "Bar chart": word start (3) + scattered (1) = 4.
    expect(fuzzyScore("br", "Browser")!).toBeGreaterThan(fuzzyScore("br", "Bar chart")!);
  });
});

describe("scoreCandidate", () => {
  it("falls back to keywords when the label misses", () => {
    expect(scoreCandidate("terminal", "Plain shell", ["terminal"])).not.toBeNull();
  });

  it("ranks a label hit above an equal keyword hit", () => {
    const viaLabel = scoreCandidate("terminal", "terminal", [])!;
    const viaKeyword = scoreCandidate("terminal", "Plain shell", ["terminal"])!;
    expect(viaLabel).toBeGreaterThan(viaKeyword);
  });
});

describe("rankActions", () => {
  const A = (label: string, keywords: string[] = []) => ({ label, keywords });

  it("returns everything in registry order for an empty query", () => {
    const list = [A("Tasks"), A("Teams")];
    expect(rankActions("", list)).toEqual(list);
  });

  it("sorts matches by score, ties by registry order", () => {
    const label = A("Terminal");
    const keyword = A("Plain shell", ["terminal"]);
    expect(rankActions("terminal", [keyword, label])[0]).toBe(label);
  });

  it("drops non-matching actions", () => {
    expect(rankActions("zz", [A("Tasks")])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/palette/fuzzy.test.ts`
Expected: FAIL — cannot resolve `./fuzzy`.

- [ ] **Step 3: Write the implementation**

Create `src/palette/fuzzy.ts`:

```ts
/**
 * Case-insensitive subsequence scorer. Returns null when `query` is not a
 * subsequence of `text`; otherwise a score where word-boundary hits (+3) and
 * consecutive runs (+2) rank above scattered hits (+1). Empty query = 0 so it
 * matches everything without favoring anyone.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  let score = 0;
  let from = 0;
  let prevHit = -2;
  for (const ch of q) {
    const idx = t.indexOf(ch, from);
    if (idx === -1) return null;
    const atWordStart = idx === 0 || t[idx - 1] === " ";
    score += atWordStart ? 3 : idx === prevHit + 1 ? 2 : 1;
    prevHit = idx;
    from = idx + 1;
  }
  return score;
}

/** Best of the label and keyword scores; keyword hits are docked one point so
 *  an equal label hit always outranks them. */
export function scoreCandidate(
  query: string,
  label: string,
  keywords: string[]
): number | null {
  let best = fuzzyScore(query, label);
  for (const k of keywords) {
    const s = fuzzyScore(query, k);
    if (s === null) continue;
    const docked = s - 1;
    if (best === null || docked > best) best = docked;
  }
  return best;
}

/** Filters and sorts by score (desc), ties broken by original registry order. */
export function rankActions<T extends { label: string; keywords: string[] }>(
  query: string,
  actions: T[]
): T[] {
  if (!query.trim()) return actions;
  return actions
    .map((a, i) => ({ a, i, s: scoreCandidate(query, a.label, a.keywords) }))
    .filter((x): x is { a: T; i: number; s: number } => x.s !== null)
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map((x) => x.a);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/palette/fuzzy.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/palette/fuzzy.ts src/palette/fuzzy.test.ts
git commit -m "feat(palette): fuzzy scorer and action ranking"
```


### Task 2: Action registry

**Files:**
- Create: `src/palette/actions.ts`
- Test: `src/palette/actions.test.ts`

**Interfaces:**
- Consumes: `Preset` (`src/wall/presets.ts`), `WallMeta` (`src/store/types.ts`), `Card`/`terminalsOf` (`src/wall/cardStore.ts`), `TOOLS`/`ToolDef` (`src/wall/tools.ts`).
- Produces: `PaletteAction`, `PaletteDeps`, `buildActions(d: PaletteDeps): PaletteAction[]` — Task 3 renders `PaletteAction[]`; Task 4 builds `PaletteDeps` in WallView.

- [ ] **Step 1: Write the failing test**

Create `src/palette/actions.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildActions, type PaletteDeps } from "./actions";
import type { Card } from "../wall/cardStore";

function deps(overrides?: Partial<PaletteDeps>): PaletteDeps {
  return {
    presets: [
      { id: "plain", label: "Plain shell", icon: "▷" },
      { id: "claude", label: "Claude Code", icon: "✦", command: "claude" },
    ],
    walls: [
      { id: "w1", name: "alpha", path: "", updatedAt: 0, isCurrent: false },
      { id: "w2", name: "beta", path: "", updatedAt: 0, isCurrent: false },
    ],
    currentWallId: "w1",
    cards: [],
    launchPreset: vi.fn(),
    launchBrowser: vi.fn(),
    openTasks: vi.fn(),
    openTeams: vi.fn(),
    openDesign: vi.fn(),
    openSettings: vi.fn(),
    openExplorer: vi.fn(),
    exitWall: vi.fn(),
    switchWall: vi.fn(),
    selectTool: vi.fn(),
    focusTerminal: vi.fn(),
    closeBrowser: vi.fn(),
    ...overrides,
  };
}

const terminal = (id: string, name: string): Card => ({
  kind: "terminal", id, name, x: 0, y: 0, w: 1, h: 1, presetId: "plain", cwd: "",
});
const browser: Card = { kind: "browser", id: "wall-browser", url: "https://x.dev", x: 0, y: 0, w: 1, h: 1 };

describe("buildActions", () => {
  it("creates one launch action per preset plus the browser", () => {
    const d = deps();
    const a = buildActions(d);
    const launch = a.filter((x) => x.section === "Launch");
    expect(launch.map((x) => x.id)).toEqual(["launch:plain", "launch:claude", "launch:browser"]);
    launch[1].run();
    expect(d.launchPreset).toHaveBeenCalledWith("claude");
  });

  it("offers switching to every wall except the current one", () => {
    const d = deps();
    const ids = buildActions(d).map((x) => x.id);
    expect(ids).toContain("nav:switch:w2");
    expect(ids).not.toContain("nav:switch:w1");
  });

  it("exposes all 12 canvas tools with their shortcut hints", () => {
    const tools = buildActions(deps()).filter((x) => x.section === "Tools");
    expect(tools).toHaveLength(12);
    expect(tools[0].shortcut).toBe("V");
  });

  it("adds focus actions for open terminals and close-browser only when open", () => {
    const bare = buildActions(deps());
    expect(bare.some((x) => x.id === "win:close-browser")).toBe(false);

    const d = deps({ cards: [terminal("t1", "Ada"), browser] });
    const a = buildActions(d);
    const focus = a.find((x) => x.id === "win:focus:t1");
    expect(focus?.label).toBe("Focus Ada");
    focus!.run();
    expect(d.focusTerminal).toHaveBeenCalledWith("t1");
    expect(a.some((x) => x.id === "win:close-browser")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/palette/actions.test.ts`
Expected: FAIL — cannot resolve `./actions`.

- [ ] **Step 3: Write the implementation**

Create `src/palette/actions.ts`:

```ts
import type { Preset } from "../wall/presets";
import type { WallMeta } from "../store/types";
import { terminalsOf, type Card } from "../wall/cardStore";
import { TOOLS, type ToolDef } from "../wall/tools";

export type PaletteSection = "Launch" | "Navigate" | "Tools" | "Windows";

export type PaletteAction = {
  id: string;
  label: string;
  /** Extra search terms beyond the label. */
  keywords: string[];
  section: PaletteSection;
  /** Display-only hint (e.g. a canvas tool's single key). */
  shortcut?: string;
  run: () => void;
};

/** Everything the registry needs, passed explicitly so it stays a pure function. */
export type PaletteDeps = {
  presets: Preset[];
  walls: WallMeta[];
  currentWallId: string;
  cards: Card[];
  launchPreset: (presetId: string) => void;
  launchBrowser: () => void;
  openTasks: () => void;
  openTeams: () => void;
  openDesign: () => void;
  openSettings: () => void;
  openExplorer: () => void;
  exitWall: () => void;
  switchWall: (id: string) => void;
  selectTool: (tool: ToolDef) => void;
  focusTerminal: (id: string) => void;
  closeBrowser: () => void;
};

export function buildActions(d: PaletteDeps): PaletteAction[] {
  const actions: PaletteAction[] = [];

  for (const p of d.presets) {
    actions.push({
      id: `launch:${p.id}`,
      label: `New ${p.label} terminal`,
      keywords: ["launch", "open", "terminal", p.label],
      section: "Launch",
      run: () => d.launchPreset(p.id),
    });
  }
  actions.push({
    id: "launch:browser",
    label: "Open browser",
    keywords: ["launch", "web", "browser"],
    section: "Launch",
    run: d.launchBrowser,
  });

  actions.push(
    { id: "nav:tasks", label: "Open Taskboard", keywords: ["navigate", "tasks", "board"], section: "Navigate", run: d.openTasks },
    { id: "nav:teams", label: "Open Teams", keywords: ["navigate", "teams", "org", "collab"], section: "Navigate", run: d.openTeams },
    { id: "nav:design", label: "Open UI Design", keywords: ["navigate", "design", "figma", "canvas"], section: "Navigate", run: d.openDesign },
    { id: "nav:settings", label: "Open Settings", keywords: ["navigate", "settings", "background", "theme", "preferences"], section: "Navigate", run: d.openSettings },
    { id: "nav:explorer", label: "Open File Explorer", keywords: ["navigate", "files", "folder", "explorer"], section: "Navigate", run: d.openExplorer },
    { id: "nav:exit", label: "Back to all spaces", keywords: ["navigate", "exit", "start", "home", "spaces"], section: "Navigate", run: d.exitWall },
  );
  for (const w of d.walls) {
    if (w.id === d.currentWallId) continue;
    actions.push({
      id: `nav:switch:${w.id}`,
      label: `Switch to ${w.name}`,
      keywords: ["navigate", "switch", "space", "wall", w.name],
      section: "Navigate",
      run: () => d.switchWall(w.id),
    });
  }

  for (const t of TOOLS) {
    actions.push({
      id: `tool:${t.type}`,
      label: `Tool: ${t.label}`,
      keywords: ["tool", "canvas", "draw", t.label],
      section: "Tools",
      shortcut: t.shortcut,
      run: () => d.selectTool(t),
    });
  }

  for (const t of terminalsOf(d.cards)) {
    actions.push({
      id: `win:focus:${t.id}`,
      label: `Focus ${t.name}`,
      keywords: ["window", "focus", "terminal", "agent", t.name],
      section: "Windows",
      run: () => d.focusTerminal(t.id),
    });
  }
  if (d.cards.some((c) => c.kind === "browser")) {
    actions.push({
      id: "win:close-browser",
      label: "Close browser",
      keywords: ["window", "close", "browser"],
      section: "Windows",
      run: d.closeBrowser,
    });
  }

  return actions;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/palette/actions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/palette/actions.ts src/palette/actions.test.ts
git commit -m "feat(palette): action registry built from wall state"
```


### Task 3: CommandPalette overlay component + styles

**Files:**
- Create: `src/palette/CommandPalette.tsx`
- Modify: `src/App.css` (append palette styles at the end)

**Interfaces:**
- Consumes: `rankActions` (Task 1), `PaletteAction` (Task 2), `useBlocksBrowser` (`src/wall/browserVisibility.ts`).
- Produces: `CommandPalette({ open, onClose, actions }: { open: boolean; onClose: () => void; actions: PaletteAction[] })` — Task 4 mounts it.

No unit test for this component (the project has no component-test setup — only pure-logic tests, which Tasks 1–2 cover). Verification is manual in Task 4.

- [ ] **Step 1: Write the component**

Create `src/palette/CommandPalette.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useBlocksBrowser } from "../wall/browserVisibility";
import { rankActions } from "./fuzzy";
import type { PaletteAction } from "./actions";

/**
 * Searchable quick menu. Dumb by design: it renders whatever actions it is
 * given and owns only query/selection state. `run()` side effects live with
 * the caller that built the registry.
 */
export function CommandPalette({
  open, onClose, actions,
}: { open: boolean; onClose: () => void; actions: PaletteAction[] }) {
  useBlocksBrowser(open);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSel(0);
      // Focus after the overlay mounts; rAF beats React's commit timing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const ranked = useMemo(() => rankActions(query, actions), [query, actions]);
  const clamped = Math.min(sel, Math.max(0, ranked.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${clamped}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [clamped, ranked]);

  if (!open) return null;

  const runAction = (a: PaletteAction) => {
    onClose();
    a.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => (ranked.length ? (s + 1) % ranked.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => (ranked.length ? (s - 1 + ranked.length) % ranked.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const a = ranked[clamped];
      if (a) runAction(a);
    }
  };

  return (
    <div className="palette-backdrop" onPointerDown={onClose}>
      <div className="palette" onPointerDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSel(0); }}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list" ref={listRef}>
          {ranked.length === 0 && <div className="palette-empty">No matching actions</div>}
          {ranked.map((a, i) => (
            <button
              key={a.id}
              data-idx={i}
              className={`palette-item${i === clamped ? " active" : ""}`}
              onPointerEnter={() => setSel(i)}
              onPointerDown={() => runAction(a)}
            >
              <span className="palette-label">{a.label}</span>
              {a.shortcut && <kbd className="palette-kbd">{a.shortcut}</kbd>}
              <span className="palette-tag">{a.section}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append styles to `src/App.css`**

The app's chrome uses the `--glass` / `--rule` / `--radius-sm` / `--shadow` custom properties (see `.launch-menu` around line 22 of `src/App.css`) — reuse them so the palette matches the launch menu's glass look. Append at the end of the file:

```css
/* ---- Command palette (Ctrl+K) ---- */
.palette-backdrop {
  position: fixed; inset: 0; z-index: 60;
  background: rgba(0, 0, 0, 0.35);
  display: flex; justify-content: center; align-items: flex-start;
}
.palette {
  margin-top: 14vh; width: min(520px, calc(100vw - 48px));
  background: var(--glass); backdrop-filter: blur(10px);
  border: 1px solid var(--rule); border-radius: var(--radius-sm);
  box-shadow: var(--shadow); overflow: hidden;
  display: flex; flex-direction: column;
}
.palette-input {
  border: 0; outline: 0; background: transparent; color: inherit;
  font: inherit; font-size: 15px; padding: 14px 16px;
  border-bottom: 1px solid var(--rule);
}
.palette-list { max-height: 46vh; overflow-y: auto; padding: 4px; }
.palette-empty { padding: 14px 16px; opacity: 0.6; font-size: 13px; }
.palette-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 8px 12px; border: 0; border-radius: calc(var(--radius-sm) - 4px);
  background: transparent; color: inherit; font: inherit; font-size: 13px;
  text-align: left; cursor: pointer;
}
.palette-item.active { background: rgba(255, 255, 255, 0.08); }
.palette-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.palette-kbd {
  font-size: 11px; opacity: 0.7; border: 1px solid var(--rule);
  border-radius: 4px; padding: 0 5px; line-height: 16px;
}
.palette-tag { font-size: 10px; opacity: 0.45; text-transform: uppercase; letter-spacing: 0.06em; }
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors (the component is not mounted anywhere yet — that's Task 4).

- [ ] **Step 4: Commit**

```bash
git add src/palette/CommandPalette.tsx src/App.css
git commit -m "feat(palette): CommandPalette overlay component"
```


### Task 4: Wire into WallView — hotkey, toolbar button, deps

**Files:**
- Modify: `src/wall/WallView.tsx` (imports; state near line ~90; `focusTerminalCard` helper next to `selectTool` ~line 689; the `focus_terminal` vibe command body ~line 535; JSX return block ~line 699)
- Modify: `src/wall/Toolbar.tsx` (add palette button)
- Modify: `src/wall/icons.tsx` (add `SearchIcon`)

**Interfaces:**
- Consumes: `buildActions`/`PaletteDeps` (Task 2), `CommandPalette` (Task 3). Existing WallView members: `addTerminal`, `openBrowser`, `closeBrowser`, `onTasks`, `onTeams`, `onDesign`, `onSwitch`, `setGearOpen`, `setExplorerOpen`, `exit`, `selectTool`, `apiRef`, `animateCamera`, `focusSession`, `fitCamera`, `FOCUS_MAX_ZOOM`, `loadIndex`, `useCardStore`.
- Produces: nothing new for later tasks — this is the integration.

- [ ] **Step 1: Add `SearchIcon` to `src/wall/icons.tsx`**

Follow the exact style of the neighboring icons in that file (16px stroke icons, e.g. `GearIcon` at line 80). Append near the other icon exports:

```tsx
export function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}
```

(Before writing, open `src/wall/icons.tsx` and copy the actual attribute pattern the existing icons use — width/height/stroke props must match the file's convention, not this snippet, if they differ.)

- [ ] **Step 2: Add the palette button to `src/wall/Toolbar.tsx`**

Add an `onPalette: () => void` prop and a button between the gear and explorer buttons:

```tsx
export function Toolbar({
  wallId, onBack, onSwitch, onGear, onExplorer, onDesign, onTasks, onTeams, onPalette,
}: { wallId: string; onBack: () => void; onSwitch: (id: string) => void; onGear: () => void; onExplorer: () => void; onDesign: () => void; onTasks: () => void; onTeams: () => void; onPalette: () => void }) {
```

and in the JSX after the gear button:

```tsx
      <button className="cnvs-btn" onClick={onPalette} title="Quick actions (Ctrl+K)"><SearchIcon /></button>
```

with `SearchIcon` added to the existing `./icons` import.

- [ ] **Step 3: Wire state, hotkey, helper, and mount in `src/wall/WallView.tsx`**

3a. Imports (top of file):

```tsx
import { CommandPalette } from "../palette/CommandPalette";
import { buildActions } from "../palette/actions";
import type { WallMeta } from "../store/types";
```

3b. State, next to `gearOpen`/`explorerOpen` (~line 88):

```tsx
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteWalls, setPaletteWalls] = useState<WallMeta[]>([]);
  const paletteOpenRef = useRef(false);
  paletteOpenRef.current = paletteOpen;
  // Wall list is only needed while the palette is up; snapshot it on open.
  useEffect(() => {
    if (paletteOpen) loadIndex().then(setPaletteWalls).catch(() => setPaletteWalls([]));
  }, [paletteOpen]);
```

3c. Hotkey — capture phase so Excalidraw never sees Ctrl+K; ignores typing surfaces except when the palette itself is open (so Ctrl+K toggles it closed from its own input). Place after the resize effect (~line 412):

```tsx
  // Ctrl+K opens the palette anywhere on the wall except while typing in a
  // terminal/input (shells own Ctrl+K); from the palette's own input it toggles closed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCtrlK = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === "k";
      if (!isCtrlK) return;
      if (paletteOpenRef.current) {
        e.preventDefault(); e.stopPropagation();
        setPaletteOpen(false);
        return;
      }
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable='true'], .xterm")) return;
      e.preventDefault(); e.stopPropagation();
      setPaletteOpen(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
```

3d. Extract the zoom-and-focus logic shared with the `focus_terminal` vibe command. Add next to `selectTool` (~line 689):

```tsx
  /** Zooms in on a terminal (capped like the vibe focus command) and gives it keyboard focus. */
  const focusTerminalCard = (id: string) => {
    const t = terminalsOf(useCardStore.getState().cards).find((t) => t.id === id);
    if (!t) return;
    const api = apiRef.current;
    const st = api?.getAppState() as AppStateLike | undefined;
    if (api && st) {
      const cam = fitCamera(
        { x: t.x, y: t.y, w: t.w, h: t.h },
        { w: st.width, h: st.height },
        48,
        FOCUS_MAX_ZOOM
      );
      animateCamera(cam);
    }
    focusSession(t.id);
  };
```

Then replace the body of the `focus_terminal` vibe command's `run` (lines ~535-557) so it reuses the helper — keep its name-matching and error message exactly as they are, and replace the `const api = ...` through `focusSession(t.id);` block with a single `focusTerminalCard(t.id);`.

3e. Mount the palette in the JSX return, after `<ToolsIsland …/>` (~line 739), and pass the new Toolbar prop:

```tsx
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={buildActions({
          presets,
          walls: paletteWalls,
          currentWallId: wallId,
          cards: useCardStore.getState().cards,
          launchPreset: (id) => { void addTerminal(id); },
          launchBrowser: () => { void openBrowser(); },
          openTasks: onTasks,
          openTeams: onTeams,
          openDesign: onDesign,
          openSettings: () => setGearOpen(true),
          openExplorer: () => setExplorerOpen(true),
          exitWall: () => { void exit(); },
          switchWall: onSwitch,
          selectTool,
          focusTerminal: focusTerminalCard,
          closeBrowser: () => { closeBrowser(); },
        })}
      />
```

(Reading cards via `useCardStore.getState()` instead of a subscription is deliberate: WallView must not re-render on card moves. The snapshot taken on the render that opens the palette is current enough.)

And extend the existing `<Toolbar … />` call with `onPalette={() => setPaletteOpen(true)}`.

- [ ] **Step 4: Type-check and run the full test suite**

Run: `npx tsc -p tsconfig.json --noEmit && npx vitest run`
Expected: no type errors; all suites pass (existing suites plus the two new palette suites).

- [ ] **Step 5: Manual verification (app is likely already running in dev)**

Do NOT restart any running vite/Tauri process. If Claude is running inside Vibe Space's own terminal, ask the user to verify after their next app restart instead. Checklist:
1. `Ctrl+K` on the wall opens the palette; `Esc` and backdrop click close it; `Ctrl+K` again toggles it closed.
2. Typing filters ("cla" surfaces "New Claude Code terminal"); Enter launches it.
3. "Focus <agent>" zooms to that terminal; "Tool: Rectangle" activates the tool; "Switch to <wall>" switches; "Open Settings" opens the modal.
4. With the browser card open, opening the palette hides the native webview (blocker) and "Close browser" works.
5. `Ctrl+K` while typing inside a terminal does NOT open the palette.

- [ ] **Step 6: Commit**

```bash
git add src/wall/WallView.tsx src/wall/Toolbar.tsx src/wall/icons.tsx
git commit -m "feat(palette): Ctrl+K command palette wired into the wall"
```


### Final: graph update

- [ ] Run `graphify update .` from the repo root (AST-only refresh of `graphify-out/`), then `git add graphify-out && git commit -m "chore: graphify update for command palette"` if it produced changes.

