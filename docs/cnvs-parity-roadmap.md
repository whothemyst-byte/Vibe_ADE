# CNVS-Parity Roadmap — Packages B, C, D

**Purpose:** Hand this file to any new session or agent working on Vibe Space's
competitive roadmap. It carries the full context: who the competitor is, what
was found in their demo, what is already built (Package A), and exactly what
Packages B, C, and D must deliver.

**Last updated:** 2026-07-13

---

## 1. Context

### The competitor

**CNVS** (https://cnvs.dev) — "Command an army of agents with your voice."
Native macOS app (Swift), $199 one-time license with scarcity pricing tiers,
alpha live via early-access waitlist. Their product: an infinite canvas running
**Claude Code, Cursor Agent, and Codex** side-by-side as named agent terminals
(demo names: Marshall, Chase, Skye), driven almost entirely by voice.

Gap analysis was done 2026-07-13 from their 3m40s demo video
(`https://cnvs.dev/demo/cnvs-demo.mp4`) plus a site scrape.

### Vibe Space's position

Vibe Space (this repo) is a cross-platform Tauri app with: Excalidraw wall,
PTY terminals with named agents (Claude Code / Codex / plain presets), embedded
browser windows, file explorer, task board, themed walls with image/video
backgrounds, Clerk auth + Free/Pro/Team tiers, Supabase teams/presence, and the
Vibe voice companion (Vosk wake word + Groq STT/LLM/TTS).

**Differentiators CNVS does not have (protect these):** Team-tier collaboration
(orgs, presence, shared spaces) and cross-platform (they are macOS-only).
Business model differs too: they sell a lifetime license; we run tiered SaaS.

### Roadmap structure

Four work packages, each its own brainstorm → spec → plan → build cycle
(superpowers flow; specs in `docs/superpowers/specs/`, plans in
`docs/superpowers/plans/`):

| Package | Theme | Status |
|---|---|---|
| A | Voice → Agent dictation | **DONE** (2026-07-13) |
| B | Agent canvas control | **DONE** (2026-07-14) |
| C | Cursor preset + boot recipe | Not started |
| D | Looks & delight | Not started |

---

## 2. Package A — Voice → Agent Dictation (DONE — reference for style)

Built and verified 2026-07-13 on branch `V1.0.0`. Spec:
`docs/superpowers/specs/2026-07-13-voice-agent-dictation-design.md`. Plan:
`docs/superpowers/plans/2026-07-13-voice-agent-dictation.md`. Commits
`2150ab3..549d066` + submit fix `54e4b0e`.

What exists now (Packages B–D can build on all of it):

- `send_to_agent(agent_name, prompt)` Vibe command (WallView) — types a prompt
  into a named agent's terminal via `sendToSession` and auto-submits. Enter is
  sent 200ms after the paste as a separate PTY read — TUI agents swallow an
  Enter that arrives inside a bracketed-paste burst (`SUBMIT_DELAY_MS` in
  `src/wall/sessions.ts`). Keep this pattern for ANY programmatic typing into
  agent CLIs.
- Verbatim vs LLM-shaped dictation toggle: `settings.vibe.dictation`,
  pure router `routeVerbatim` in `src/wall/dictation.ts`.
- Spoken completion pings ("<Name> finished its task.") via `updatePending`
  polling the per-terminal `Activity` clock (`src/wall/agentStatus.ts`).
- Bottom-center hint pill (`src/vibe/HintPill.tsx`) — live transcript +
  rotating "Try …" hints; sits above the tools island (bottom: 64px, island is
  bottom: 14px / z-300, pill z-290). The pill owns caption text; VibePet only
  bubbles while sleeping.

**Testing conventions proven in A:** pure logic in small modules with vitest
colocated tests; live LLM routing cases in `src/vibe/eval.live.test.ts`
(self-skips without `GROQ_API_KEY`); UI verified in the real app via
`npm run app` + `scripts/screenshot.ps1` + `.dev/click2.ps1` (window-relative
clicks) — and the voice pipeline can be driven end-to-end by playing Windows
TTS through the speakers (the mic picks it up; this actually works).

## 3. Package B — Agent Canvas Control (DONE)

Built and verified 2026-07-14 on `V1.0.0`. Spec:
`docs/superpowers/specs/2026-07-13-agent-canvas-control-design.md`. Plan:
`docs/superpowers/plans/2026-07-14-agent-canvas-control.md`.

What exists now: a loopback control server (`src-tauri/src/control.rs`,
OS-assigned port, per-run 32-byte hex token, `X-Vibe-Token` header) forwards
`GET /state`, `POST /browser`, `POST /terminal`, `POST /send` to the webview bridge
(`src/control/bridge.ts` — allowlisted dispatch, NOT the whole Vibe registry).
A generated CLI bundle in `<app-data>/vibectl/` (`vibectl.cmd` →
`vibectl.ps1` via Invoke-RestMethod, plus `agent-guide.md`) is exposed to
every PTY through injected env (`VIBECTL_URL`, `VIBECTL_TOKEN`,
`VIBE_AGENT_GUIDE`, prepended `PATH` — `src-tauri/src/pty/actor.rs`).
`open_terminal` gained an optional `run` arg: the command rides
`SpawnConfig.command` (the preset warm-up path) into the fresh shell, and
`TerminalCard.command` is runtime-only so reopening a wall never silently
relaunches dev servers (explicit replay is Package C's boot recipe).
Agent-to-agent messaging (added 2026-07-14 after live testing): `vibectl send
<agent> "<msg>"` rides the send_to_agent path; `VIBE_AGENT_ID` (per-PTY env)
identifies the sender so delivered messages carry "reply with `vibectl send
<name>`" instructions. Vibe's system prompt embeds the exact vibectl command
when the user relays between agents ("ask Charlie to ask Ellie X") — agents
know nothing about vibectl or each other unless the dictated prompt says so.

Original scope notes follow.

**One line:** agents running in Vibe Space terminals can inspect and control
the wall themselves — open browser previews, spawn terminal nodes, read canvas
state — the deepest architectural piece of CNVS's moat.

### What CNVS does (observed in the demo)

- Every agent terminal gets an injected control layer: `cnvs` **MCP tools**
  plus a `$CNVSCTL` **shell CLI** plus an **agent-guide doc** (env var pointing
  to a markdown guide). Agents discover and use it unprompted.
- Backed by a **token-authenticated localhost control server** (custom header;
  the demo showed an HTTP 401 "missing or invalid CNVS control token" when the
  token wasn't set — auth is real, per-canvas or per-session token).
- Observed capabilities: inspect canvas state (`$CNVSCTL state --json`), open
  a browser preview node at a URL, and `cnvs_run_shell` — long-running
  processes (dev servers, watchers) auto-spawn a **separate terminal node** so
  the agent's own terminal stays free "for reasoning and edits".
- Result in the demo: the user says "open a browser preview and navigate to
  localhost:8000" to an agent — the agent does it via the control layer; dev
  servers started by agents appear as their own labeled terminal cards
  (`dev·static`).

### What Vibe Space needs (scope sketch — refine in brainstorm)

1. **Control server** in the Rust side (`src-tauri`): localhost HTTP listener
   on a random free port, bearer/custom-header token generated per app run.
   Endpoints ≈ `GET /state` (wall snapshot: terminals w/ names+presets,
   browser, theme), `POST /browser` (open/navigate), `POST /terminal` (spawn
   preset/shell node, optionally run a command), maybe `POST /note` (write on
   canvas). Bridge to the webview via Tauri events → existing card store
   actions (`openBrowser`, `addTerminal`, …). Existing `src/vibe/commands.ts`
   registry already exposes most needed actions — reuse the same underlying
   functions, NOT the LLM tool layer.
2. **CLI** (`vibectl` or `vibe-space-ctl`): tiny standalone binary or script
   shipped with the app; wraps the HTTP API. Env vars injected into every
   spawned PTY: control URL, token, and guide path (e.g. `VIBECTL_URL`,
   `VIBECTL_TOKEN`, `VIBE_AGENT_GUIDE`).
3. **Agent guide injection:** each PTY spawn exports the env vars; the guide
   markdown explains the CLI and rules (long-running processes → new terminal
   node). Optionally an MCP server config for Claude Code (`--mcp-config` or
   project `.mcp.json`) — decide in brainstorm whether MCP is v1 or CLI-only.
4. **Security:** token never written to disk unencrypted; localhost-only bind;
   per-run rotation. Browser-preview URLs restricted to http(s).
5. **Free/Pro consideration:** none — ship to all tiers (mirrors Package A
   decision), unless the user decides otherwise in brainstorm.

### Key existing code to reuse

- `src/wall/browserActions.ts` (`openBrowser`, auto-open from terminal URLs —
  `urlScanner` already auto-opens dev-server URLs printed in terminals; the
  control server complements this).
- `addTerminal` flow in `WallView.tsx` + `presetStore`/`presets.ts`.
- `src/wall/cardStore.ts` for state snapshots; `useVibeContext`'s wall snapshot
  builder is a ready-made "state" payload.
- Rust: `src-tauri/src/pty/` (spawn/inject env), `src-tauri/src/browser/`.

### Open questions for the brainstorm

- MCP server in v1, or CLI-only first (CLI is cheaper, works for all agents)?
- Should `run_shell`-style long-running detection be explicit (agent asks for a
  new node) or automatic (timeout heuristic)? CNVS appears to use explicit
  guidance ("use cnvs_run_shell for servers/watchers").
- Does the canvas-control token live per-wall or per-app-run?

## 4. Package C — Cursor Agent Preset + Boot Recipe

**One line:** run Cursor's CLI agent as a first-class preset alongside Claude
Code and Codex, and replay a wall's whole working setup (agents + servers +
layout) in one click.

### C1 — Cursor preset

- CNVS runs `cursor-agent` (Cursor's CLI, "Composer") in a terminal exactly
  like Claude/Codex. Vibe Space's preset system already supports arbitrary
  commands (`src/wall/presets.ts`, user-editable in Settings → Agents), so the
  core work is: add `cursor` to `DEFAULT_PRESETS` (command: `cursor-agent`,
  verify the actual binary name/install story on Windows), give it an icon
  color, and confirm dictation (`send_to_agent`) submits correctly into its
  TUI (Package A's `SUBMIT_DELAY_MS` pattern — test, may need tuning).
- Also consider Gemini CLI (`gemini`) — same mechanics, cheap to add; CNVS
  markets "Claude, GPT, Gemini, Cursor".
- Update: hint pill copy, eval stubs (`open_terminal` description lists
  presets dynamically already), README.

### C2 — Boot recipe

- CNVS shows a "▶ Boot recipe" control (bottom-left) that replays a canvas's
  startup: launch the agent terminals and dev servers that belong to this
  canvas.
- Vibe Space already persists terminal cards per wall (`WallDoc.terminals`
  with `presetId`, `cwd`, `name`) and respawns them on wall open — so half the
  feature exists. What's missing:
  1. **Commands beyond the preset:** record an optional per-terminal startup
     command (e.g. `npm run dev`) so a respawned terminal re-runs it.
  2. **Explicit recipe UI:** a "Boot recipe" popover listing what will launch
     (agents, servers), run/edit/skip entries, plus a one-click "Run recipe"
     after opening a wall (instead of implicit-only respawn).
  3. **Recipe editing by voice** ("add npm run dev to the boot recipe") via a
     Vibe command — optional, decide in brainstorm.
- Keep YAGNI: a recipe is per-wall, stored in the existing `WallDoc` — no new
  storage system.

### Open questions for the brainstorm

- Cursor CLI on Windows: exact binary + auth flow (needs checking at build
  time; if unavailable, ship the preset anyway — presets are just commands).
- Should respawn-on-open become opt-in once recipes exist (avoid surprise
  agent launches), or keep current behavior and add the recipe popover on top?

## 5. Package D — Looks & Delight

**One line:** close the visual-polish gap — illustrated wall scenes, quieter
window chrome with richer agent status, a minimap, and a voice-summonable
music/focus widget.

### D1 — Illustrated wallpaper library

- CNVS ships gorgeous full-bleed pixel-art scenes (Stardew-like night meadow)
  that give each canvas personality. Vibe Space already supports image/video
  wall backgrounds and the user already uses pixel-art scenes — what's missing
  is a **curated bundled library**: 6–10 Quansynd-brand illustrated scenes
  (warm amber palette — see `reference_quansynd_brand`: #d79a3d + warm
  neutrals; NOT blue) selectable from the theme picker, each paired with a
  matching accent so `accentForBackground`/`applyAccent` stays coherent.
- Generation route: pixel-art via the libresprite/pixel-art skills or an image
  model; ship as bundled assets (mind installer size — prefer ≤ ~500KB/scene
  JPEG/WebP).
- Tier note: `presetTier.ts` already gates some presets — decide whether some
  scenes are Pro-only (fits the existing tiers packaging).

### D2 — Window chrome + agent status footer

- CNVS terminals: frameless dark cards, tiny colored status dot + "Name ·
  Agent" title, close-only chrome, and an accent **glow on the active/working
  agent's border**. Footer shows model, context %, "Auto-run", background-task
  count.
- Vibe Space already has: glass cards, name + preset in the titlebar, status
  dot + "Working Xs / Cooked for Xs" (`agentStatus.ts`, `StatusFooter.tsx`).
  Gap: (a) working-state border glow on the card, (b) footer enrichment —
  whatever is cheaply parseable from the PTY stream (Claude Code prints
  context % in its own footer; don't scrape fragile UI — brainstorm what's
  reliably available), (c) overall chrome quieting pass (thinner borders,
  smaller titlebar) per the "desktop software, not SaaS" design rule.

### D3 — Minimap

- Small overview rect (bottom-right) showing card positions + viewport,
  click-to-jump. Excalidraw does not ship one; implement over the existing
  camera/`gridLayout` data (cards live outside the Excalidraw scene, so a
  custom canvas/SVG overlay is straightforward). Toggleable; hidden by
  default on small windows.

### D4 — Music / focus widget

- CNVS: a voice-summonable radio node (SomaFM "Groove Salad" style) with EQ
  visualization and mood buttons (Flat/Bass/Vocal/Bright). Pure delight; lands
  hard in demos.
- Vibe Space version: a wall card (`kind: "music"` in `cardStore`) streaming a
  free/legal source (SomaFM streams are free with attribution; verify ToS),
  Web Audio API `AnalyserNode` for the EQ bars, play/pause/volume + a few
  station moods. Vibe commands: "play some music", "change the station",
  "close the music player".
- Persist per wall like other cards.

### Suggested order within D

D1 (wallpapers, pure assets + picker) → D2 (chrome/status) → D4 (music widget)
→ D3 (minimap). D1 and D2 move the perceived quality most; D3 is the most
skippable if time is tight.

## 6. Working conventions (apply to every package)

- **Process:** superpowers flow — brainstorm (clarifying questions, one at a
  time, get design approval) → spec in `docs/superpowers/specs/` → plan in
  `docs/superpowers/plans/` (bite-sized TDD tasks, complete code in steps) →
  execute → verify in the real app.
- **Branch:** work lands directly on `V1.0.0` (this repo's convention), commit
  per task, push to the `Vibe_ADE` remote when the user says so.
- **Never restart the user's running Vibe Space instance** — Claude often runs
  inside its terminal. For app verification, launch a SEPARATE dev instance
  (`npm run app`, window title "Tauri App", its own app-data dir
  `com.admin.vibe-space-dev`), drive it with `.dev/click2.ps1` +
  `scripts/screenshot.ps1`, and CLEAN UP: kill spawned PTY shells, close the
  instance, and remove any test terminals it saved into
  `%APPDATA%/com.admin.vibe-space-dev/spaces/*.json`.
- **Voice can be tested hands-free:** Windows TTS through the speakers
  triggers the real wake word + pipeline (verified working 2026-07-13).
- **Programmatic typing into agent TUIs:** always via
  `sendToSession` — it handles bracketed paste and the delayed Enter.
- **Testing:** vitest colocated; pure logic extracted into small modules; LLM
  routing behavior added to `src/vibe/eval.live.test.ts` (needs
  `GROQ_API_KEY`, self-skips otherwise). Run `npx tsc --noEmit -p
  tsconfig.json` + `npx vitest run` before committing. Note: piping vitest
  output (`| tail`) masks its exit code — check `$?` separately.
- **Style:** follow `CLAUDE.md` (surgical changes, YAGNI, match existing
  style); UI language is desktop-software (VS Code/iTerm), not SaaS; brand is
  warm amber (#d79a3d) + warm neutrals, never blue.
- **After code changes:** run `graphify update .` (AST-only, free).
- **Memory:** the assistant's memory file `project_cnvs_parity.md` mirrors
  this roadmap's status — update both when a package's status changes.

