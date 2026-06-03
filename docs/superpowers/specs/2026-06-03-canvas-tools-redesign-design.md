# Vibe Walls — Custom Canvas & Tools Redesign

**Date:** 2026-06-03
**Status:** Approved design, ready for implementation plan
**Repo:** `vibe-walls/` (Tauri 2 + React 18 + Excalidraw 0.18.1)

## Problem

The wall view embeds a stock `<Excalidraw>` with all of its default chrome visible: the
top-centre shape toolbar, the hamburger menu, search, the Library button, and the
zoom/undo footer. That stock UI is instantly recognisable as "an Excalidraw app" and
clashes with the warm-amber editorial brand already applied to the rest of Vibe Walls
(start page, terminals, launch control, taskboard). The canvas and its tools are the one
surface that still looks generic — "everything looks the same."

This is the previously-deferred "custom tool-rail" item. Drawing is treated as a **core**
capability of a wall (people sketch, annotate, draw arrows linking terminals), so the full
tool set stays — it is rebuilt as our own chrome rather than stripped.

## Goals

- Replace Excalidraw's stock chrome with our own, in the Quansynd warm/amber, desktop-software
  design language (dense, small radii, amber for state only — never decoration).
- Keep the **full** drawing tool set and Excalidraw's full editing feature set.
- No change to canvas behaviour, persistence, terminals, camera sync, or the PTY backend.

## Non-Goals

- The Vibe mascot overlay (separate open item, not in scope here).
- Any change to terminal windows, taskboard, start page, or backgrounds.
- New drawing capabilities beyond what Excalidraw already provides.

## Layout

All controls float over the Excalidraw canvas inside `.wall-root` (absolute-positioned, as
the existing CNVS pill and launch control already are).

| Zone | Control | Change |
|------|---------|--------|
| Top-left | CNVS pill — back · wall switcher · ⚙ background · ▦ taskboard | unchanged |
| Top-centre | `+ Terminal ▾` launch control | **moved up** from bottom-centre |
| Bottom-centre | **Glass tools island** — our custom drawing toolbar | **new** (replaces stock toolbar) |
| Left | Shape properties panel (stroke/fill/width/opacity/font) | Excalidraw-native, **reskinned** |
| Bottom-left | Zoom + undo/redo | Excalidraw-native footer, **reskinned** |

### Glass tools island (bottom-centre)

A single rounded glass slab floating just off the bottom edge — `var(--glass)` background,
`backdrop-filter: blur`, `var(--rule)` border, `var(--shadow)`. Holds the full tool set as
square keys, in this order:

`select · hand · rectangle · diamond · ellipse · arrow · line · draw · text · image · eraser · frame`

- Keys are `var(--surface-2)` with `var(--text-muted)` glyphs.
- **Active tool** fills `var(--accent)` (amber) with dark glyph.
- Hover lifts (`translateY(-1px)`) and brightens to `var(--text)`.
- Small radius on keys (`var(--radius-sm)`), tight gaps — reads as app chrome, not a web pill.
- Tooltips on hover show the tool name + its single-key shortcut (mono).

### Properties panel (left) — reskinned native

Excalidraw renders its own properties panel on the left when a tool or shape is active. We
**keep** it (so we retain the complete editing feature set) and override its CSS to the warm
glass language: `var(--glass)` surface, `var(--rule)` borders, `var(--accent)` for the
active swatch/selection, mono section labels, small radii. No structural replacement — a
scoped CSS layer only.

### Zoom / undo footer (bottom-left) — reskinned native

Excalidraw's native zoom percentage and undo/redo footer is kept and restyled to match
(warm glass, small radius). It sits bottom-left, clear of the bottom-centre island.

## What is removed / hidden

Hidden via Excalidraw `UIOptions` where supported, and a scoped CSS layer for the rest:

- Stock top-centre shape toolbar (replaced by our island).
- Hamburger menu, search, Library button, help and encryption footer.

> **Export image is deferred.** Hiding the hamburger removes Excalidraw's native
> image export. A replacement (Tauri save-dialog + a Rust write command) is real new
> scope the redesign doesn't require, so it is intentionally out of scope for this pass.
> Thumbnail export (used for wall cards) is unaffected — it runs independently in `doSave`.

## Technical Approach

### Driving tools from our island

- Our island is a React component rendered as a sibling of `<Excalidraw>` inside
  `WallView`, like the existing `LaunchMenu`.
- Selecting a tool calls `excalidrawAPI.setActiveTool({ type })`. The `type` values are the
  Excalidraw tool names (`selection`, `hand`, `rectangle`, `diamond`, `ellipse`, `arrow`,
  `line`, `freedraw`, `text`, `image`, `eraser`, `frame`).
- Active-tool state is read from `appState.activeTool.type` inside the existing `onChange`
  handler in `WallView`, and passed to the island so the active key highlights. This keeps the
  island in sync when the tool changes via keyboard shortcut or auto-revert to selection.

### Hiding native chrome

- Pass `UIOptions` to `<Excalidraw>` to disable the canvas/menu actions we can disable there.
- Add a **scoped CSS override layer** (new file, e.g. `src/wall/excalidraw-skin.css`) that:
  1. hides the native top toolbar, menu, search, library, help/footer;
  2. reskins the native properties panel and zoom/undo footer to the theme tokens.
- All overrides target Excalidraw's published class names and are scoped under `.wall-root`
  so they never leak to other views. Driven entirely off the existing `theme.css` tokens.

### Moving `+ Terminal` to the top

- `LaunchMenu` placement moves from bottom-centre to top-centre (CSS only). Its split
  one-click + caret-menu behaviour is unchanged. The dropdown opens **downward** now (it
  currently opens upward from the bottom).

## Components & Files

| File | Change |
|------|--------|
| `src/wall/ToolsIsland.tsx` | **new** — the glass drawing toolbar; calls `setActiveTool`, takes `activeTool` prop |
| `src/wall/WallView.tsx` | render `ToolsIsland`; read `activeTool` in `onChange`; pass `UIOptions` to `<Excalidraw>` |
| `src/wall/LaunchMenu.tsx` | unchanged logic; menu now opens downward |
| `src/wall/excalidraw-skin.css` | **new** — scoped hide + reskin layer for native Excalidraw chrome |
| `src/App.css` | move `.launch` to top-centre; add `.tools-island` styles |
| `src/theme.css` | unchanged (reuse existing tokens) |

## Design Language Guardrails

This is **desktop software**, not a web product. Hold the line:

- Thin, dense chrome; small radii (`--radius-sm` / 6–8px) on interactive keys.
- Flat warm surfaces; glass blur only on floating chrome; amber **only** for active/selection
  state, never as fill or decoration.
- Mono (`--font-mono`) for tool names, shortcuts, and labels.
- Micro-transitions (~120–150ms); no slide/fade entrance animations.
- Reference set: VS Code, iTerm2, Linear desktop — not SaaS dashboards or landing pages.

## Testing / Verification

- App launches; a wall opens with the new layout: `+ Terminal` top-centre, glass tools island
  bottom-centre, no stock Excalidraw top toolbar / hamburger / library visible.
- Every tool key activates the matching Excalidraw tool; drawing each shape works; the active
  key highlights amber and follows keyboard shortcuts.
- Properties panel and zoom/undo footer appear in the reskinned warm style; full editing
  controls (colour, fill, width, opacity, font, layers) still function.
- Existing behaviour unaffected: terminals spawn/drag/persist, camera sync, background, save.
- The skin CSS does not leak into start page / taskboard views.
