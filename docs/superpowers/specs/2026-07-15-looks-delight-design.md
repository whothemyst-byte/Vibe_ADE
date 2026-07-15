# Looks & Delight (CNVS Package D) — Design

**Date:** 2026-07-15
**Status:** Approved
**Roadmap:** `docs/cnvs-parity-roadmap.md` § Package D

## Goal

Close the visual-polish gap with CNVS in four sub-features, built in order:

- **D1:** a bundled library of 8 illustrated pixel-art wall scenes.
- **D2:** quieter window chrome + an accent glow on working agents.
- **D4:** a voice-summonable music/focus wall card with EQ visualization.
- **D3:** a click-to-jump minimap of the card grid.

Ships to all tiers (mirrors Packages A–C). Branch `V1.0.0`, commit per task.

## Decisions made in brainstorm

1. **Scope:** all four sub-features, one spec, build order D1 → D2 → D4 → D3.
2. **D1 artwork:** generated in-session — procedural pixel-art scenes rendered
   by a script (no external image model, no sourced packs, no licensing risk).
3. **D1 tiers:** all scenes free — wallpapers are demo-appeal and brand
   surface; no Pro gating.
4. **D2 footer:** NO footer data changes and NO PTY/TUI scraping. D2 is a
   CSS-only pass: working glow + chrome quieting. The footer keeps its
   reliable "Working Xs / Cooked for Xs" line.
5. **D4 audio source:** curated free internet-radio streams whose terms permit
   third-party players (verified during the build via the Radio Browser
   directory), plus a paste-any-stream-URL field. NOT SomaFM (their terms
   restrict commercial apps).

## D1 — Illustrated scene library

### Assets

8 scenes, warm-amber Quansynd palette (`#d79a3d` + warm neutrals — never
blue-led; cool hues only as small accents inside a warm scene). Rendered
procedurally by a Node script (`scripts/render-scenes.mjs`): each scene is
drawn at 480×270 with deterministic pixel-art primitives (gradient skies,
dithering, silhouettes, stars, glow dots), upscaled nearest-neighbor to
1920×1080, and encoded as WebP ≤ 500KB into `public/themes/scenes/<id>.webp`.
The script is committed so scenes can be re-rendered and tuned; the WebPs are
committed too (build output, but tiny and stable).

Subjects (final look tuned at build time, names indicative):

| id | name | mood |
|---|---|---|
| `amber-dunes` | Amber Dunes | desert dusk, layered dunes |
| `meadow-night` | Meadow Night | Stardew-like night meadow, fireflies |
| `campfire` | Campfire | forest clearing, warm firelight |
| `harvest` | Harvest | golden field, farmhouse silhouette |
| `lantern-harbor` | Lantern Harbor | docks at night, lantern reflections |
| `canyon-dusk` | Canyon Dusk | mesa layers, first stars |
| `ember-city` | Ember City | warm-lit skyline (amber, not neon) |
| `tea-room` | Tea Room | cozy interior, window light |

### Theme wiring (`src/settings/themes.ts`)

New `SCENE_THEMES: Theme[]` — one entry per scene,
`background: { kind: "image", url: "/themes/scenes/<id>.webp" }`, and a
per-scene `accent` hand-picked from the artwork's own palette (all must pass
the existing readability contract — `readableTextColor` drives `--on-accent`).
`THEMES` becomes `[...APPEARANCE_THEMES, ...SCENE_THEMES, ...VIDEO_THEMES]`.
`isThemeActive` already matches image themes by `url`; `accentForBackground`
picks up scene accents with zero changes.

### Picker (`src/settings/SettingsModal.tsx` ThemesPane)

New "Scenes" `set-group` between the appearance grid and "Video themes",
mapping `SCENE_THEMES` through the existing `ThemeCard`. `ThemeCard` gains an
image preview branch (`theme.background.kind === "image"` → `<img>` in the
existing `theme-preview` span) — today it only renders color swatches and
video previews.

### Voice

Zero work: the `set_theme` Vibe command in `WallView.tsx` lists and matches
over `THEMES`, so "switch to meadow night" works as soon as the entries exist.

## D2 — Chrome quieting + working glow

CSS-only (plus one constant), touching the card chrome shared by terminal /
browser / file windows:

- **Working glow:** `StatusFooter` already stamps `data-working="true|false"`
  on the card wrapper each tick. Add
  `.terminal-window[data-working="true"]` styling: 1px accent-tinted border +
  soft accent `box-shadow` with a slow ~3s pulse (CSS keyframes on
  box-shadow opacity; no JS, no re-renders). Uses `--accent`, so it recolors
  with the wall theme.
- **Chrome quieting** (the "desktop software, not SaaS" pass):
  - `HEADER_H` 28 → 24 (`src/wall/transform.ts`) + matching CSS.
  - Thinner, lower-contrast card borders; slightly smaller/muted title
    typography ("Name · Agent" stays).
  - Maximize/close buttons ghosted (low opacity) until card hover.
  - Same treatment applied to browser and file card headers so the wall
    stays uniform.
- **No footer changes.** `agentStatus.ts` and `StatusFooter.tsx` logic
  untouched.

Verification is visual (dev instance + screenshots, idle vs working card);
the only testable logic change is the `HEADER_H` constant, covered by
existing transform tests.

## D4 — Music / focus card

### Card model

New card kind beside terminal/browser/file:

```ts
export type MusicCard = {
  kind: "music";
  id: string;
  /** Station id from STATIONS, or "custom". */
  stationId: string;
  /** Stream URL actually playing (custom URL when stationId === "custom"). */
  url: string;
  x: number; y: number; w: number; h: number;
};
```

Single instance per wall (like the browser card). Persisted in `WallDoc` as
`music?: SavedMusic` (`{ stationId, url, gridIndex }`), following the
`SavedBrowser` save/restore pattern in `WallView.tsx` exactly. Playback state
is runtime-only — reopening a wall restores the card **paused** (no surprise
audio, mirrors the boot-recipe "no silent relaunch" principle).

### Stations (`src/wall/stations.ts`)

A small curated list (3–5 entries: lofi / ambient / focus moods) of
free-to-relay internet-radio streams:

```ts
export type Station = { id: string; name: string; mood: string; url: string; attribution: string };
export const STATIONS: Station[] = [/* verified at build time */];
```

Candidate streams come from the open Radio Browser directory; each shipped
station's terms are verified during the build (stations whose broadcasters
permit third-party players). If fewer than 3 verifiable stations are found,
ship what passes + the custom-URL field — never ship an unverified stream.
Attribution strings render in the card UI.

### UI (`src/wall/MusicWindow.tsx`)

A grid card with the shared window chrome (header "Name · Music", close
button, D2 styling). Body: station name + mood, EQ bar visualization,
play/pause, volume slider, station switcher (cycles STATIONS), and a
custom-URL input. Audio via a plain `HTMLAudioElement`
(`crossOrigin = "anonymous"`).

**EQ bars:** Web Audio `AnalyserNode` fed from the audio element. Known
constraint: streams served without CORS headers make the analyser output
silence (all-zero bins) even while audio plays. Detection: after play, if
bins stay zero for ~2s, switch to a **simulated** visualization (randomized
smooth bars driven by playback state). Pure helper module
(`src/wall/eq.ts`): bin sampling, zero-detection, and the simulated
generator — vitest-tested; the canvas/DOM drawing stays in the component.

### Voice commands (WallView registry)

- `play_music` — opens the card if absent, plays (optional `mood`/`station`
  arg matched against STATIONS).
- `change_station` — next station or by name.
- `stop_music` — pause (card stays).
- `close_music` — remove the card.

Hint pill gains one rotating "Try 'play some music'" hint.

## D3 — Minimap

### Projection (`src/wall/minimap.ts`, pure + tested)

`minimapProject(cards, viewport, size)` → scaled rects: computes the bounding
box of all card rects ∪ the camera viewport rect (from
`excalidrawViewport`), fits it into the minimap box (fixed aspect, padding),
and returns card rects + viewport rect in minimap coordinates, plus the
inverse mapping `minimapToWorld(point)` for click-to-jump.

### Component (`src/wall/Minimap.tsx`)

Fixed bottom-right SVG (~180×120, above the wall, below modals; must not
collide with the tools island / hint pill / boot-recipe popover — exact
offsets at build time). Card rects colored by kind: terminals use
`presetTierColor(presetId)`, browser/file/music use muted token colors; the
viewport is an accent-stroked rect. Click (or drag) recenters the Excalidraw
camera on the clicked world point via the `excalidrawAPI` scroll update.
Re-renders from `useCardStore` subscription + the camera-change path WallView
already tracks (rAF-throttled).

### Visibility

- Hidden when the wall has no cards, or when the window is narrower than
  ~900px.
- Toggleable from the tools island (new icon button); preference persists in
  `settings.canvas` (default ON).

## Testing & verification

- **Pure logic (vitest, colocated):** `SCENE_THEMES` shape/uniqueness/accent
  readability (extend `themes.test.ts`), `stations.ts` shape + URL scheme,
  `eq.ts` zero-detection + simulator bounds, `minimap.ts` projection
  round-trips, `cardStore`/`WallDoc` music save-restore (extend existing
  tests).
- **Gates:** `npx tsc --noEmit -p tsconfig.json` + `npx vitest run` before
  every commit (check `$?` directly — piping masks the exit code).
- **Real-app verification:** separate dev instance (`npm run app`, never the
  running instance), driven by `.dev/click2.ps1` + `scripts/screenshot.ps1`:
  scene picker + accent recolor; working glow while an agent streams; music
  card playing (bars moving — real or simulated) + voice "play some music"
  via Windows TTS; minimap click-to-jump. Clean up dev-instance app data
  after (`%APPDATA%/com.admin.vibe-space-dev/spaces/*.json`).
- **After code changes:** `graphify update .`; update
  `docs/cnvs-parity-roadmap.md` § Package D status + the
  `project_cnvs_parity` memory when D lands.

## Out of scope

- Footer enrichment (model/context %/task counts) — revisit only if a stable
  machine-readable source appears (explicitly rejected for this cycle).
- Downloadable wallpaper packs, user wallpaper library management.
- Local-file music playback and playlists.
- Live-thumbnail minimap rendering; minimap on the start page.
- Pro gating of any D feature.

