# Cursor Preset + Boot Recipe (CNVS Package C) — Design

**Date:** 2026-07-15
**Status:** Approved
**Roadmap:** `docs/cnvs-parity-roadmap.md` § Package C

## Goal

Two features closing CNVS parity gaps:

- **C1:** run Cursor's CLI agent (and Gemini CLI) as first-class presets
  alongside Claude Code and Codex.
- **C2:** replay a wall's working setup — the dev-server commands its
  terminals were started with — via an explicit "▶ Boot recipe" control.

Ships to all tiers (mirrors Packages A/B). Branch `V1.0.0`, commit per task.

## Decisions made in brainstorm

1. **Presets:** Cursor **and** Gemini (CNVS markets "Claude, GPT, Gemini,
   Cursor"; Gemini is ~10 extra lines).
2. **Boot flow:** keep today's automatic terminal respawn on wall open
   (preset command only). Saved startup commands **never** auto-run; they run
   only via the Boot recipe UI or voice.
3. **Recipe capture:** auto-capture — the `--run` command a terminal was
   opened with persists as its recipe entry; entries are editable in the
   popover.
4. **Voice:** run-only (`run_boot_recipe`). No voice editing in v1.
5. **Recipe model:** per-terminal `run` field on `SavedTerminal` — the
   popover is a view over saved terminals; no separate recipe storage, no
   name matching, nothing destructive.

## C1 — Cursor + Gemini presets

### New defaults (`src/wall/presets.ts`)

Append to `DEFAULT_PRESETS`:

```ts
{ id: "cursor", label: "Cursor", icon: "▸", command: "agent" },
{ id: "gemini", label: "Gemini", icon: "◈", command: "gemini" },
```

- Cursor CLI installs natively on Windows
  (`irm 'https://cursor.com/install?win32=true' | iex`); binary is `agent`
  (renamed from `cursor-agent`). **Verify the actual binary name on this
  machine at build time**; if it differs, adjust the one-word command. If the
  CLI isn't installed, ship the preset anyway — the shell's "not recognized"
  error is the honest surface, and presets stay user-editable in
  Settings → Agents.
- Gemini CLI: `gemini` (npm `@google/gemini-cli`), Windows-native.
- Neither gets Claude's `--append-system-prompt-file "$env:VIBE_AGENT_GUIDE"`
  — that flag is Claude Code-specific. Both still receive vibectl via the
  per-PTY injected env (`VIBECTL_URL`/`VIBECTL_TOKEN`/`VIBE_AGENT_GUIDE`).

### Migration for existing installs

`loadPresets()` (`src/store/persistence.ts`) returns stored `presets.json`
as-is, so existing users would never see the new presets. Add a pure
`mergeNewDefaults(stored: Preset[]): Preset[]` beside `upgradeLegacyPresets`
that appends any `DEFAULT_PRESETS` entry whose `id` is absent, wired into
`loadPresets` with the same identity-compare + re-save pattern. Known
tradeoff: a user who deleted a default preset gets it back once per new
default; user edits to existing presets are untouched.

### Tier colors (`src/wall/presetTier.ts`)

- `cursor` → `var(--ok)` (green)
- `gemini` → `#8a68c9` (muted violet literal; token set has no purple and
  codex owns `--info`)

### Dictation

`send_to_agent` / `vibectl send` already type via `sendToSession` (bracketed
paste + 200ms delayed Enter — `SUBMIT_DELAY_MS`). Verify submit lands in the
Cursor and Gemini TUIs during build verification; tune only if broken.

### Copy

- Hint pill: add one "Try: open a Cursor terminal"-style hint.
- README preset list.
- `open_terminal`'s description lists presets dynamically — no change needed.

## C2 — Boot recipe

### Data model

- `SavedTerminal` (`src/store/types.ts`): add `run?: string` — the recipe
  command.
- `TerminalCard` (`src/wall/cardStore.ts`): add persisted `run?: string`,
  **separate from** the runtime-only `command`. `addTerminal(presetId, run)`
  sets both: `command` spawns it now, `run` records the recipe entry.
- Wall save mapper (`WallView.tsx` doSave): include `run` in the saved
  terminal fields.
- Wall load: restored cards carry `run` but never `command` → respawn
  behavior is exactly today's (preset only; no surprise dev servers).
- Shared spaces: `run` rides `WallDoc.terminals` through `spaceSync`
  untouched — teammates receive the recipe with the space (desired).
- Old docs without `run` load fine (optional field).

### UI — `src/wall/BootRecipe.tsx`

- A small glass pill button `▶ Boot recipe`, bottom-left of the wall
  (tools island is bottom-center, launch menu top-center; bottom-left is
  free and matches CNVS). Always visible while a wall is open.
- Popover lists **every terminal on the wall**: tier dot + name + editable
  command input (empty = not in the recipe) + per-row ▶ run button.
- Footer: **Run recipe** — runs all non-empty entries.
- Edits write through `cardStore.update` → existing save debounce persists.
- Styling: desktop-software (VS Code/iTerm), quiet chrome, warm amber
  accents; no SaaS look.

### Run semantics

- Running an entry = `sendToSession(id, cmd, true)` into the terminal's live
  shell at its own cwd. No respawn; nothing destructive.
- Dead/missing session → inline error on that row; other rows still run.

### Pure logic — `src/wall/recipe.ts`

Extract testable helpers so `BootRecipe.tsx` stays a thin view:

- `recipeEntries(cards)` → `{ id, name, cmd }[]` (terminals with non-empty
  `run`).
- A run-all helper that takes a `send(id, cmd) => boolean` function and
  returns a result summary (ran / failed per entry) — used by both the
  popover footer and the voice command for its spoken reply.

### Voice

One new Vibe command in `WallView.tsx`:

- `run_boot_recipe` — runs all entries; replies like
  "Ran 2 commands: npm run dev in Dev, …", "This space has no boot recipe.",
  or names the rows that failed.

## Testing

- Vitest colocated: `mergeNewDefaults` cases in `presets.test.ts`;
  `recipe.test.ts` for entry listing + run-all summary (including dead
  sessions).
- `run_boot_recipe` routing case in `src/vibe/eval.live.test.ts`
  (self-skips without `GROQ_API_KEY`).
- Real-app verification in a **separate** dev instance (`npm run app`;
  never touch the user's running instance): presets in launch menu with
  correct dots; open a terminal with `--run` via vibectl; close + reopen the
  wall → no auto-run; popover shows the entry; ▶ types it into the shell.
  Dictation submit into `agent`/`gemini` TUIs if installed (check at build
  time; skip with a note if not). Clean up dev-instance spaces
  (`%APPDATA%/com.admin.vibe-space-dev/spaces/*.json`) afterwards.
- `npx tsc --noEmit -p tsconfig.json` + `npx vitest run` before each commit
  (check `$?` directly, don't pipe). `graphify update .` after code changes.

## Out of scope

- Voice editing of recipe entries.
- Recipe steps that spawn new terminals (the recipe only targets saved
  terminals).
- Install detection / guided install for Cursor or Gemini CLIs.
- Tier gating of presets or recipe.

## Completion

Update `docs/cnvs-parity-roadmap.md` (Package C → DONE, with a "what exists
now" summary like A/B have) and the assistant memory `project_cnvs_parity.md`.
