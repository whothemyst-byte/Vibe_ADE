# Cursor Preset + Boot Recipe (CNVS Package C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Cursor + Gemini as first-class agent presets, and a per-wall "▶ Boot recipe" that replays each terminal's saved startup command on demand (never automatically).

**Architecture:** C1 appends two entries to `DEFAULT_PRESETS` plus a `mergeNewDefaults` migration so existing `presets.json` files pick them up. C2 adds an optional `run` field to `SavedTerminal`/`TerminalCard` (auto-captured from `open_terminal --run`, persisted in the WallDoc, never executed on wall load), a pure `src/wall/recipe.ts` module, a bottom-left popover (`BootRecipe.tsx`) and one Vibe voice command (`run_boot_recipe`). Commands replay via the proven `sendToSession` bracketed-paste + delayed-Enter path.

**Tech Stack:** React + zustand + vitest (colocated tests), Tauri PTY layer (untouched), Groq eval suite (`eval.live.test.ts`).

**Spec:** `docs/superpowers/specs/2026-07-15-cursor-preset-boot-recipe-design.md`

## Global Constraints

- Branch: work lands directly on `V1.0.0`; one commit per task.
- Before every commit: `npx tsc --noEmit -p tsconfig.json` and `npx vitest run` must pass. Do NOT pipe vitest output (`| tail`) — it masks the exit code; check `$?` directly.
- NEVER restart or kill the user's running Vibe Space instance (Claude may run inside its terminal). App verification uses a SEPARATE dev instance: `npm run app` (window title "Tauri App", app-data dir `com.admin.vibe-space-dev`).
- Programmatic typing into agent TUIs goes through `sendToSession` only (bracketed paste + 200ms delayed Enter).
- Saved startup commands must NEVER auto-run on wall open — only via the Boot recipe UI or voice.
- UI language is desktop-software (VS Code/iTerm), warm amber brand (`--accent` #d79a3d), never blue accents.
- After code changes land: `graphify update .` (AST-only, free).
- All features ship to all tiers — no tier gating anywhere in this package.
- Working directory for all commands: `C:\Users\admin\Desktop\Quansynd\vibe-space`.

---

## Task Overview

1. **Cursor + Gemini presets** — `DEFAULT_PRESETS`, tier colors, eval-stub copy, test updates.
2. **Preset migration** — `mergeNewDefaults` so existing installs see the new presets.
3. **Hint pill** — "Try open a Cursor terminal"-style hints for agent presets.
4. **Recipe data model + pure logic** — `run` field end-to-end (capture → save → load), `src/wall/recipe.ts` + tests.
5. **Boot recipe popover** — `BootRecipe.tsx` + CSS, mounted bottom-left in `WallView`.
6. **Voice + eval + README** — `run_boot_recipe` Vibe command, eval routing case, README copy.
7. **Real-app verification + roadmap/memory close-out.**

---

### Task 1: Cursor + Gemini presets

**Files:**
- Modify: `src/wall/presets.ts:15-19` (DEFAULT_PRESETS)
- Modify: `src/wall/presetTier.ts`
- Modify: `src/vibe/eval.live.test.ts:39` (static preset list in the `open_terminal` stub description)
- Test: `src/wall/presets.test.ts`, `src/wall/presetTier.test.ts`

**Interfaces:**
- Produces: `DEFAULT_PRESETS` now contains ids `["plain", "claude", "codex", "cursor", "gemini"]`; `presetTierColor("cursor") === "var(--ok)"`, `presetTierColor("gemini") === "#8a68c9"`. Later tasks (hints, README) rely on labels `Cursor` and `Gemini`.

Background: presets are plain `{ id, label, icon, command }` records; the PTY spawns a shell and types `command` into it. Cursor's CLI is Windows-native now (installed via `irm 'https://cursor.com/install?win32=true' | iex`); its binary is invoked as `agent` (renamed from `cursor-agent`). If the CLI isn't installed the shell prints "not recognized" — that is the intended surface; no install detection.

- [ ] **Step 1: Update the failing tests first**

In `src/wall/presets.test.ts`, replace the first test of the `presets` describe block:

```ts
  it("ships plain + claude + codex + cursor + gemini defaults; plain has no command", () => {
    expect(DEFAULT_PRESETS.map((p) => p.id)).toEqual(["plain", "claude", "codex", "cursor", "gemini"]);
    expect(DEFAULT_PRESETS[0].command).toBeUndefined();
  });

  it("cursor and gemini launch their CLIs", () => {
    expect(DEFAULT_PRESETS.find((p) => p.id === "cursor")?.command).toBe("agent");
    expect(DEFAULT_PRESETS.find((p) => p.id === "gemini")?.command).toBe("gemini");
  });
```

Also in `presets.test.ts`, the `findPresetByPhrase` no-match test uses "gemini" as its unknown word — that now matches. Change it:

```ts
  it("returns undefined for no match (caller reports the error)", () => {
    expect(findPresetByPhrase(DEFAULT_PRESETS, "aider")).toBeUndefined();
  });
```

In `src/wall/presetTier.test.ts`, extend the first test:

```ts
  it("maps known presets to brand token colors", () => {
    expect(presetTierColor("plain")).toBe("var(--text-faint)");
    expect(presetTierColor("claude")).toBe("var(--accent)");
    expect(presetTierColor("codex")).toBe("var(--info)");
    expect(presetTierColor("cursor")).toBe("var(--ok)");
    expect(presetTierColor("gemini")).toBe("#8a68c9");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/wall/presets.test.ts src/wall/presetTier.test.ts`
Expected: FAIL — id-list mismatch, cursor/gemini commands undefined, tier colors falling back to `var(--text-muted)`.

- [ ] **Step 3: Implement**

In `src/wall/presets.ts`, replace `DEFAULT_PRESETS`:

```ts
export const DEFAULT_PRESETS: Preset[] = [
  { id: "plain", label: "Plain shell", icon: "▷" },
  { id: "claude", label: "Claude Code", icon: "✦", command: CLAUDE_COMMAND },
  { id: "codex", label: "Codex", icon: "◆", command: "codex" },
  // Cursor CLI's Windows-native binary is `agent` (renamed from cursor-agent).
  { id: "cursor", label: "Cursor", icon: "▸", command: "agent" },
  { id: "gemini", label: "Gemini", icon: "◈", command: "gemini" },
];
```

In `src/wall/presetTier.ts`, add two cases before `default`:

```ts
    case "cursor": return "var(--ok)";
    case "gemini": return "#8a68c9"; // token set has no purple; codex owns --info
```

In `src/vibe/eval.live.test.ts`, update the `open_terminal` stub's static description (line ~39) to:

```ts
  stub("open_terminal", "Spawn a new agent terminal on this wall. Available presets: Claude Code, Codex, Cursor, Gemini, Plain shell. Omit preset for a plain shell.", {
```

(The real app builds this description dynamically from the preset store — only the eval stub is static.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wall/presets.test.ts src/wall/presetTier.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
git add src/wall/presets.ts src/wall/presets.test.ts src/wall/presetTier.ts src/wall/presetTier.test.ts src/vibe/eval.live.test.ts
git commit -m "feat: Cursor + Gemini agent presets"
```

---

### Task 2: Preset migration for existing installs

**Files:**
- Modify: `src/wall/presets.ts` (new export beside `upgradeLegacyPresets`)
- Modify: `src/store/persistence.ts:42-53` (`loadPresets`)
- Test: `src/wall/presets.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_PRESETS` from Task 1.
- Produces: `mergeNewDefaults(presets: Preset[]): Preset[]` — appends any default preset whose `id` is missing; returns the input array **by identity** when nothing is missing (callers detect "changed" and re-save).

Background: `loadPresets()` returns the stored `presets.json` as-is, so users who saved presets before this version would never see cursor/gemini. Known tradeoff (accepted in spec): a user who deliberately deleted a default preset gets it back once.

- [ ] **Step 1: Write the failing tests**

Append to `src/wall/presets.test.ts` (add `mergeNewDefaults` to the import from `./presets`):

```ts
describe("mergeNewDefaults", () => {
  it("appends defaults missing from a stored list, after the user's entries", () => {
    const stored = [
      { id: "plain", label: "Plain shell", icon: "▷" },
      { id: "claude", label: "Claude Code", icon: "✦", command: "claude --model opus" },
    ];
    const merged = mergeNewDefaults(stored);
    expect(merged.map((p) => p.id)).toEqual(["plain", "claude", "codex", "cursor", "gemini"]);
    expect(merged[1]).toBe(stored[1]); // user edits untouched
  });

  it("returns the same array by identity when nothing is missing (= no re-save)", () => {
    expect(mergeNewDefaults(DEFAULT_PRESETS)).toBe(DEFAULT_PRESETS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wall/presets.test.ts`
Expected: FAIL with "mergeNewDefaults is not a function" (or import error).

- [ ] **Step 3: Implement**

Add to `src/wall/presets.ts` (below `upgradeLegacyPresets`):

```ts
/** Appends default presets missing from a stored list — new app versions ship
    new agents, and a presets.json saved before then must still surface them.
    Returns the input by identity when nothing is missing, letting the caller
    detect "changed" via `!==` / length. Deliberate deletions of a default come
    back once per new default (accepted tradeoff; user edits are untouched). */
export function mergeNewDefaults(presets: Preset[]): Preset[] {
  const have = new Set(presets.map((p) => p.id));
  const missing = DEFAULT_PRESETS.filter((d) => !have.has(d.id));
  return missing.length ? [...presets, ...missing] : presets;
}
```

In `src/store/persistence.ts`, wire it into `loadPresets` — change the import (line 5) and the load path:

```ts
import { DEFAULT_PRESETS, mergeNewDefaults, upgradeLegacyPresets, type Preset } from "../wall/presets";
```

```ts
export async function loadPresets(): Promise<Preset[]> {
  const s = await invoke<string | null>("presets_load");
  if (s) {
    const stored = JSON.parse(s) as Preset[];
    const upgraded = mergeNewDefaults(upgradeLegacyPresets(stored));
    if (upgraded.some((p, i) => p !== stored[i])) await savePresets(upgraded);
    return upgraded;
  }
  // First run: write the defaults so the user has a presets.json to edit.
  await invoke("presets_save", { json: JSON.stringify(DEFAULT_PRESETS, null, 2) });
  return DEFAULT_PRESETS;
}
```

(The existing `upgraded.some((p, i) => p !== stored[i])` check already catches appended entries: for indexes past `stored.length`, `stored[i]` is `undefined` and the comparison is true.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wall/presets.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
git add src/wall/presets.ts src/wall/presets.test.ts src/store/persistence.ts
git commit -m "feat: surface new default presets to existing installs"
```

---

### Task 3: Hint pill includes the new agent presets

**Files:**
- Modify: `src/vibe/hints.ts:12`
- Modify: `src/vibe/HintPill.tsx:19-22`
- Test: `src/vibe/hints.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_PRESETS` (Task 1) — specifically that agent presets have a `command` and plain does not.
- Produces: nothing later tasks use; copy-only.

Background: the pill currently builds "Try open a X terminal" hints from `presetLabels.slice(0, 2)` and `HintPill` passes ALL preset labels — so only "Plain shell" and "Claude Code" ever appear. Pass only agent presets (those with a `command`) and widen the slice so Cursor/Gemini rotate in.

- [ ] **Step 1: Write the failing test**

Append to `src/vibe/hints.test.ts`:

```ts
  it("rotates in every agent preset it is given (Cursor, Gemini included)", () => {
    const hints = buildHints([], ["Claude Code", "Codex", "Cursor", "Gemini"]);
    expect(hints.some((h) => h.includes("Cursor"))).toBe(true);
    expect(hints.some((h) => h.includes("Gemini"))).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/vibe/hints.test.ts`
Expected: FAIL — `slice(0, 2)` drops Cursor and Gemini.

- [ ] **Step 3: Implement**

In `src/vibe/hints.ts`, change the preset loop:

```ts
  for (const p of presetLabels.slice(0, 4)) {
    hints.push(`Try "open a ${p} terminal"`);
  }
```

In `src/vibe/HintPill.tsx`, pass agent presets only (plain-shell hints aren't interesting):

```ts
  const hints = buildHints(
    terminalsOf(cards).map((t) => t.name),
    DEFAULT_PRESETS.filter((p) => p.command).map((p) => p.label)
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/vibe/hints.test.ts`
Expected: PASS (existing three tests too — they pass agent-preset labels already).

- [ ] **Step 5: Full check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
git add src/vibe/hints.ts src/vibe/hints.test.ts src/vibe/HintPill.tsx
git commit -m "feat: hint pill suggests Cursor/Gemini terminals"
```

---

### Task 4: Boot recipe data model + pure logic

**Files:**
- Modify: `src/store/types.ts:13-16` (`SavedTerminal`)
- Modify: `src/wall/cardStore.ts:3-17` (`TerminalCard`)
- Modify: `src/wall/WallView.tsx:116-118` (save mapper) and `src/wall/WallView.tsx:438-450` (`addTerminal`)
- Create: `src/wall/recipe.ts`
- Test: `src/wall/recipe.test.ts`

**Interfaces:**
- Produces (Tasks 5 and 6 consume exactly these):
  - `TerminalCard.run?: string` — persisted boot-recipe command; `SavedTerminal.run?: string` mirrors it in the WallDoc.
  - `recipeEntries(cards: Card[]): RecipeEntry[]` where `RecipeEntry = { id: string; name: string; cmd: string }` — terminals with a non-empty trimmed `run`, in grid order.
  - `runRecipe(entries: RecipeEntry[], send: (id: string, cmd: string) => boolean): { ran: RecipeEntry[]; failed: RecipeEntry[] }`.
  - `summarizeRun(r: { ran: RecipeEntry[]; failed: RecipeEntry[] }): string` — spoken/inline summary, e.g. `Ran 1 command: npm run dev in Dev.`, `This space has no boot recipe.`, and a `Could not reach <names> (no live session).` suffix for failures.

Background — the critical invariant: `TerminalCard.command` is runtime-only (it spawns the shell NOW and is deliberately not saved, so reopening a wall never silently relaunches dev servers — a Package B decision). The new `run` field is the opposite: persisted but never executed automatically. `addTerminal(presetId, run)` sets **both** — `command` spawns it now, `run` records the recipe entry. The wall-load path (`WallView.tsx:204-210`) spreads `...t` from `SavedTerminal`, so `run` restores with zero changes there, and `command` stays absent on restore.

- [ ] **Step 1: Write the failing tests**

Create `src/wall/recipe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { recipeEntries, runRecipe, summarizeRun } from "./recipe";
import type { Card } from "./cardStore";

const term = (id: string, name: string, run?: string): Card => ({
  kind: "terminal", id, name, x: 0, y: 0, w: 100, h: 100, presetId: "plain", cwd: "C:\\w", run,
});

describe("recipeEntries", () => {
  it("keeps only terminals with a non-empty trimmed run command, in order", () => {
    const cards: Card[] = [
      term("a", "Ada", "npm run dev"),
      term("b", "Bo"),
      term("c", "Cy", "   "),
      { kind: "browser", id: "br", url: "http://x", x: 0, y: 0, w: 1, h: 1 },
      term("d", "Dee", " cargo watch "),
    ];
    expect(recipeEntries(cards)).toEqual([
      { id: "a", name: "Ada", cmd: "npm run dev" },
      { id: "d", name: "Dee", cmd: "cargo watch" },
    ]);
  });
});

describe("runRecipe", () => {
  const entries = [
    { id: "a", name: "Ada", cmd: "npm run dev" },
    { id: "b", name: "Bo", cmd: "cargo watch" },
  ];

  it("routes every entry through send and splits ran/failed", () => {
    const sent: string[] = [];
    const r = runRecipe(entries, (id, cmd) => { sent.push(`${id}:${cmd}`); return id === "a"; });
    expect(sent).toEqual(["a:npm run dev", "b:cargo watch"]);
    expect(r.ran.map((e) => e.id)).toEqual(["a"]);
    expect(r.failed.map((e) => e.id)).toEqual(["b"]);
  });
});

describe("summarizeRun", () => {
  it("reports an empty recipe", () => {
    expect(summarizeRun({ ran: [], failed: [] })).toBe("This space has no boot recipe.");
  });

  it("names each command and its terminal", () => {
    const s = summarizeRun({ ran: [{ id: "a", name: "Ada", cmd: "npm run dev" }], failed: [] });
    expect(s).toBe("Ran 1 command: npm run dev in Ada.");
  });

  it("pluralizes and appends failures", () => {
    const s = summarizeRun({
      ran: [
        { id: "a", name: "Ada", cmd: "npm run dev" },
        { id: "d", name: "Dee", cmd: "cargo watch" },
      ],
      failed: [{ id: "b", name: "Bo", cmd: "x" }],
    });
    expect(s).toBe("Ran 2 commands: npm run dev in Ada, cargo watch in Dee. Could not reach Bo (no live session).");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/wall/recipe.test.ts`
Expected: FAIL — `./recipe` module does not exist.

- [ ] **Step 3: Implement the data model + module**

`src/store/types.ts` — extend `SavedTerminal`:

```ts
export type SavedTerminal = {
  id: string; x: number; y: number; w: number; h: number; presetId: string; cwd: string;
  name?: string;
  /** Boot-recipe command. Replayed only via the Boot recipe UI/voice — never on wall load. */
  run?: string;
};
```

`src/wall/cardStore.ts` — extend `TerminalCard` (below the existing `command` field):

```ts
  /** Boot-recipe command (persisted, unlike `command`): what this terminal's
      dev server/watcher is started with. Never executed automatically; the
      Boot recipe UI or `run_boot_recipe` replays it into the live shell. */
  run?: string;
```

`src/wall/WallView.tsx` — `addTerminal` records the recipe entry (line ~448):

```ts
      presetId, cwd, command: run, run,
```

`src/wall/WallView.tsx` — `buildDoc`'s terminal mapper persists it, dropping blank strings left by popover edits (line ~116):

```ts
      terminals: terminalsOf(cards).map(({ id, x, y, w, h, presetId, cwd, name, run }) => ({
        id, x, y, w, h, presetId, cwd, name, run: run?.trim() ? run : undefined,
      })),
```

Create `src/wall/recipe.ts`:

```ts
import { terminalsOf, type Card } from "./cardStore";

export type RecipeEntry = { id: string; name: string; cmd: string };

/** Terminals with a non-empty boot-recipe command, in grid order. */
export function recipeEntries(cards: Card[]): RecipeEntry[] {
  return terminalsOf(cards)
    .filter((t) => (t.run ?? "").trim() !== "")
    .map((t) => ({ id: t.id, name: t.name, cmd: (t.run ?? "").trim() }));
}

/** Runs every entry through `send`; entries whose terminal has no live session land in `failed`. */
export function runRecipe(
  entries: RecipeEntry[],
  send: (id: string, cmd: string) => boolean
): { ran: RecipeEntry[]; failed: RecipeEntry[] } {
  const ran: RecipeEntry[] = [];
  const failed: RecipeEntry[] = [];
  for (const e of entries) (send(e.id, e.cmd) ? ran : failed).push(e);
  return { ran, failed };
}

/** One-line summary for the popover footer and Vibe's spoken reply. */
export function summarizeRun(r: { ran: RecipeEntry[]; failed: RecipeEntry[] }): string {
  if (!r.ran.length && !r.failed.length) return "This space has no boot recipe.";
  const parts: string[] = [];
  if (r.ran.length) {
    const n = r.ran.length === 1 ? "1 command" : `${r.ran.length} commands`;
    parts.push(`Ran ${n}: ${r.ran.map((e) => `${e.cmd} in ${e.name}`).join(", ")}.`);
  }
  if (r.failed.length) {
    parts.push(`Could not reach ${r.failed.map((e) => e.name).join(", ")} (no live session).`);
  }
  return parts.join(" ");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/wall/recipe.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
git add src/store/types.ts src/wall/cardStore.ts src/wall/WallView.tsx src/wall/recipe.ts src/wall/recipe.test.ts
git commit -m "feat: persist per-terminal boot-recipe commands (never auto-run)"
```

---

### Task 5: Boot recipe popover UI

**Files:**
- Create: `src/wall/BootRecipe.tsx`
- Modify: `src/App.css` (append after the `.tool-key` block, ~line 55)
- Modify: `src/wall/WallView.tsx` (import + mount after `<ToolsIsland …/>`, line ~819)

**Interfaces:**
- Consumes: `TerminalCard.run`, `recipeEntries` / `runRecipe` / `summarizeRun` (Task 4); `sendToSession(id, text, submit): boolean` from `./sessions`; `presetTierColor` (Task 1); `useBlocksBrowser` from `./browserVisibility` (native browser overlay must hide behind popovers — same pattern as `LaunchMenu`).
- Produces: `<BootRecipe />` — self-contained, reads the card store directly, no props.

There are no component tests in this codebase (vitest covers pure modules only) — this task's checks are tsc + the full suite + the Task 7 visual verification. All logic beyond wiring lives in `recipe.ts`, already tested.

- [ ] **Step 1: Create the component**

Create `src/wall/BootRecipe.tsx`:

```tsx
import { useState } from "react";
import { terminalsOf, useCardStore } from "./cardStore";
import { presetTierColor } from "./presetTier";
import { useBlocksBrowser } from "./browserVisibility";
import { recipeEntries, runRecipe, summarizeRun } from "./recipe";
import { sendToSession } from "./sessions";

/**
 * Bottom-left "▶ Boot recipe" pill + popover: view and edit each terminal's
 * saved startup command, and replay them into the live shells on demand.
 * Commands persist per terminal in the WallDoc but NEVER run on wall load —
 * this popover (or the run_boot_recipe voice command) is the only trigger.
 */
export function BootRecipe() {
  const cards = useCardStore((s) => s.cards);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useBlocksBrowser(open);
  const terminals = terminalsOf(cards);

  const runAll = () => {
    const result = runRecipe(recipeEntries(cards), (id, cmd) => sendToSession(id, cmd, true));
    setNotice(summarizeRun(result));
  };
  const runOne = (id: string, cmd: string) => {
    const ok = sendToSession(id, cmd.trim(), true);
    setNotice(ok ? null : "No live session for that terminal.");
  };

  if (!terminals.length) return null;
  return (
    <div className="boot-recipe">
      {open && (
        <div className="boot-recipe-pop">
          {terminals.map((t) => (
            <div className="boot-recipe-row" key={t.id}>
              <span className="launch-ic" style={{ background: presetTierColor(t.presetId) }} />
              <span className="boot-recipe-name">{t.name}</span>
              <input
                className="boot-recipe-cmd"
                placeholder="startup command…"
                value={t.run ?? ""}
                onChange={(e) => useCardStore.getState().update(t.id, { run: e.target.value })}
                spellCheck={false}
              />
              <button
                className="boot-recipe-run"
                title={`Run in ${t.name}`}
                disabled={!(t.run ?? "").trim()}
                onClick={() => runOne(t.id, t.run ?? "")}
              >
                ▶
              </button>
            </div>
          ))}
          <div className="boot-recipe-foot">
            {notice && <span className="boot-recipe-notice">{notice}</span>}
            <button className="boot-recipe-all" onClick={runAll} disabled={!recipeEntries(cards).length}>
              Run recipe
            </button>
          </div>
        </div>
      )}
      <button className="boot-recipe-pill" onClick={() => { setNotice(null); setOpen((o) => !o); }}>
        ▶ Boot recipe
      </button>
    </div>
  );
}
```

Notes for the implementer:
- Card-store `update` already accepts any partial `TerminalCard` patch — `{ run }` type-checks once Task 4 landed. Edits flow through the existing card-store save debounce in `WallView`; no explicit save call.
- `useBlocksBrowser(open)` is required: the wall browser is a NATIVE webview that would otherwise paint over the popover.

- [ ] **Step 2: Add the styles**

Append to `src/App.css` after the `.tool-key` rule block (keep the existing terse one-line-per-property-group style of neighboring rules):

```css
.boot-recipe { position: absolute; bottom: 14px; left: 14px; z-index: 300; }
.boot-recipe-pill {
  background: var(--glass); backdrop-filter: blur(10px); color: var(--text-muted);
  border: 1px solid var(--rule); border-radius: var(--radius); cursor: pointer;
  padding: 7px 12px; font-size: 11.5px; font-weight: 600; font-family: var(--font-ui);
  box-shadow: var(--shadow); transition: color .14s;
}
.boot-recipe-pill:hover { color: var(--text); }
.boot-recipe-pop {
  position: absolute; bottom: 100%; left: 0; margin-bottom: 8px; width: 340px;
  background: var(--glass); backdrop-filter: blur(10px); border: 1px solid var(--rule);
  border-radius: var(--radius-sm); padding: 6px; box-shadow: var(--shadow);
  display: flex; flex-direction: column; gap: 2px;
}
.boot-recipe-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; }
.boot-recipe-name {
  font-size: 12.5px; color: var(--text); width: 64px; flex: none;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.boot-recipe-cmd {
  flex: 1; min-width: 0; background: var(--surface-2); color: var(--text);
  border: 1px solid var(--rule); border-radius: 6px; padding: 5px 8px;
  font-size: 12px; font-family: var(--font-mono);
}
.boot-recipe-cmd::placeholder { color: var(--text-faint); }
.boot-recipe-cmd:focus { outline: none; border-color: var(--accent-dim); }
.boot-recipe-run {
  background: transparent; color: var(--text-muted); border: none; cursor: pointer;
  font-size: 11px; padding: 4px 6px; border-radius: 6px; flex: none;
}
.boot-recipe-run:hover:not(:disabled) { background: rgba(243, 238, 229, .06); color: var(--text); }
.boot-recipe-run:disabled { color: var(--text-faint); cursor: default; }
.boot-recipe-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  padding: 6px 6px 2px; border-top: 1px solid var(--rule); margin-top: 4px;
}
.boot-recipe-notice { font-size: 11.5px; color: var(--text-muted); flex: 1; }
.boot-recipe-all {
  background: var(--accent); color: var(--on-accent); border: none; cursor: pointer;
  border-radius: var(--radius-sm); padding: 6px 12px; font-size: 11.5px; font-weight: 600;
  font-family: var(--font-ui);
}
.boot-recipe-all:hover:not(:disabled) { background: var(--accent-hover); }
.boot-recipe-all:disabled { background: var(--surface-2); color: var(--text-faint); cursor: default; }
```

- [ ] **Step 3: Mount it in WallView**

In `src/wall/WallView.tsx`, add the import near the other wall components (after the `ToolsIsland` import, line ~25):

```ts
import { BootRecipe } from "./BootRecipe";
```

and render it after `<ToolsIsland activeType={activeType} onSelect={selectTool} />` (line ~819):

```tsx
      <ToolsIsland activeType={activeType} onSelect={selectTool} />
      <BootRecipe />
```

- [ ] **Step 4: Full check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
git add src/wall/BootRecipe.tsx src/App.css src/wall/WallView.tsx
git commit -m "feat: boot recipe popover (edit + replay startup commands)"
```

---

### Task 6: `run_boot_recipe` voice command + eval case + README

**Files:**
- Modify: `src/wall/WallView.tsx` (new `useVibeCommand` block; imports)
- Modify: `src/vibe/eval.live.test.ts` (stub + routing case)
- Modify: `README.md:34-38`

**Interfaces:**
- Consumes: `recipeEntries` / `runRecipe` / `summarizeRun` (Task 4), `sendToSession` (already imported in `WallView.tsx`), `useVibeCommand` from `../vibe/commands` (already imported).
- Produces: Vibe command `run_boot_recipe` (no parameters) — returns `summarizeRun`'s string as the spoken reply.

- [ ] **Step 1: Write the failing eval test**

In `src/vibe/eval.live.test.ts`, add to `fakeRegistry()` (after the `send_to_agent` stub):

```ts
  stub("run_boot_recipe", "Run this space's boot recipe: replay each terminal's saved startup command (e.g. dev servers, watchers).", undefined, "Ran 1 command: npm run dev in Dev.");
```

and add a routing case inside the `describe.runIf(KEY)` block:

```ts
  it("runs the boot recipe", async () => {
    await runAgent("run the boot recipe", liveChat);
    expect(calls.map((c) => c.name)).toContain("run_boot_recipe");
  });
```

- [ ] **Step 2: Run the eval test (needs GROQ_API_KEY)**

Run (PowerShell): `$env:GROQ_API_KEY = (Get-Content .env | Select-String 'GROQ_API_KEY' | ForEach-Object { ($_ -split '=', 2)[1] }); npx vitest run src/vibe/eval.live.test.ts`
Expected: the new case fails right now only in the sense that routing succeeds against the stub — this suite tests the LLM's tool choice, not app code, so it may already PASS. If `GROQ_API_KEY` is absent the suite self-skips: note that and rely on Step 4's registration.

- [ ] **Step 3: Register the command in WallView**

In `src/wall/WallView.tsx`, add the recipe module import (near the other `./` imports, line ~34):

```ts
import { recipeEntries, runRecipe, summarizeRun } from "./recipe";
```

Add the command after the existing `send_to_agent` `useVibeCommand` block (~line 590, next to its siblings):

```ts
  useVibeCommand({
    name: "run_boot_recipe",
    description:
      "Run this space's boot recipe: replay each terminal's saved startup command (e.g. dev servers, watchers). Use when the user asks to run/start the boot recipe or restart the saved dev servers.",
    parameters: { type: "object", properties: {} },
    run: () => {
      const result = runRecipe(
        recipeEntries(useCardStore.getState().cards),
        (id, cmd) => sendToSession(id, cmd, true)
      );
      return summarizeRun(result);
    },
  });
```

- [ ] **Step 4: Update the README**

In `README.md`, update the capability list (lines 34-38) — preset names and the recipe:

```markdown
It can: dictate prompts to agent terminals by name, open Claude Code / Codex /
Cursor / Gemini / plain terminals, close or focus them, run the boot recipe
(replay each terminal's saved startup command — never run automatically), change
the wall background or apply a theme (Ember, Midnight, Parchment, Moss, Plum,
Slate), zoom to fit, switch or CREATE walls (it asks where, or opens the folder
picker), open the task board, create/move tasks, and answer questions. If it
needs missing info it asks and listens for your answer. Say **"go to sleep"**
to silence the wake word (click it or press the hotkey to wake it). Pick its
speaking voice in Settings → Vibe.
```

- [ ] **Step 5: Full check + commit**

```bash
npx tsc --noEmit -p tsconfig.json
npx vitest run
git add src/wall/WallView.tsx src/vibe/eval.live.test.ts README.md
git commit -m "feat: run_boot_recipe voice command"
```

---

### Task 7: Real-app verification + close-out

**Files:**
- Modify: `docs/cnvs-parity-roadmap.md` (Package C status)
- Modify: `C:\Users\admin\.claude\projects\C--Users-admin-Desktop-Quansynd\memory\project_cnvs_parity.md` (assistant memory — not committed to this repo)

No new code. This validates the whole package in a real app instance, then flips the roadmap status. NEVER touch the user's running Vibe Space instance — everything below happens in a separate dev instance (`npm run app`, window "Tauri App", app-data `com.admin.vibe-space-dev`).

- [ ] **Step 1: Check which agent CLIs exist on this machine**

Run (PowerShell): `Get-Command agent, cursor-agent, gemini -ErrorAction SilentlyContinue | Select-Object Name, Source`
- If `cursor-agent` exists but `agent` does not: change the cursor preset's `command` in `src/wall/presets.ts` AND the expectation in `presets.test.ts` to `cursor-agent`, re-run `npx vitest run src/wall/presets.test.ts`, and amend copy nowhere else (label stays "Cursor"). Commit as `fix: cursor preset uses installed binary name`.
- If neither exists: the preset ships as speced (`agent`); note in the summary that TUI dictation couldn't be live-tested.

- [ ] **Step 2: Launch the dev instance and verify presets**

```powershell
npm run app   # run_in_background; wait for the "Tauri App" window
powershell -File scripts/screenshot.ps1
```

Open a space, click the launch-menu caret (top center), screenshot. Expected: Plain shell / Claude Code / Codex / Cursor / Gemini rows, with green (Cursor) and violet (Gemini) dots. Use `.dev/click2.ps1` for window-relative clicks.

- [ ] **Step 3: Verify recipe capture → persistence → no auto-run → replay**

1. In the dev instance's space, open a plain terminal WITH a command via the control CLI from any dev-instance PTY: `vibectl terminal --preset "plain" --run "ping -t 127.0.0.1"` (a safe long-runner; check `vibectl --help`/agent-guide.md for exact flag names if this errors).
2. Screenshot: command is running in the new terminal.
3. Leave the space (back to start page), reopen it. Expected: the terminal respawns as an idle shell — the ping is NOT running (the no-auto-run invariant).
4. Click `▶ Boot recipe` (bottom-left). Expected: popover lists the terminal with `ping -t 127.0.0.1` in its input.
5. Click **Run recipe**. Expected: the command types into the shell and runs; footer notice reads "Ran 1 command: …".
6. Edit the command in the popover to `echo hello`, leave + reopen the space, verify the edit persisted.

- [ ] **Step 4: Verify dictation into the new TUIs (if installed per Step 1)**

Open a Cursor (and/or Gemini) terminal from the launch menu. From a dev-instance PTY: `vibectl send <AgentName> "say hi"`. Expected: prompt lands AND submits (the 200ms delayed-Enter pattern). If the prompt lands but does not submit, record the symptom in the summary — tuning `SUBMIT_DELAY_MS` is a follow-up decision, not a silent change (it is global to all agents).

- [ ] **Step 5: Clean up the dev instance**

Close the dev-instance window (kills its PTYs). Then remove test terminals it saved:

```powershell
Get-ChildItem "$env:APPDATA\com.admin.vibe-space-dev\spaces\*.json"
```

Delete the test space JSONs created during verification (or edit out the test terminals if the space pre-existed). Verify no stray `ping` processes: `Get-Process ping -ErrorAction SilentlyContinue`.

- [ ] **Step 6: Update roadmap + memory + graph**

In `docs/cnvs-parity-roadmap.md`: set Package C's row in the §1 table to **DONE** (with today's date), and replace §4's header line with a "Built and verified …" paragraph in the style of §§2-3, summarizing: cursor/gemini presets + `mergeNewDefaults`, `SavedTerminal.run` + BootRecipe popover + `run_boot_recipe`, and the no-auto-run invariant. Update the assistant memory file `project_cnvs_parity.md` to match (C done, D pending). Run `graphify update .`.

- [ ] **Step 7: Commit**

```bash
git add docs/cnvs-parity-roadmap.md
git commit -m "docs: Package C (Cursor preset + boot recipe) verified and done"
```

Do not push — the user says when to push to the `Vibe_ADE` remote.

