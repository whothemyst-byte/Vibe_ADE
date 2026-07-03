# Command Palette + Mobile Simulator — Design

**Date:** 2026-07-03
**Status:** Approved

Two features for the Vibe Space wall:

1. **Command Palette** — a `Ctrl+K` searchable quick menu covering every action in the app.
2. **Mobile Simulator card** — an Android/iOS device running natively inside the space, usable as a target for Flutter (or any other) app builds.

## Decisions made during brainstorming

- **iOS on Windows:** a true iOS Simulator only exists on macOS. Android gets the **real official Android Emulator** (free, accurate). iOS gets a **pixel-accurate device-frame preview** of the app's web build, clearly labeled "UI preview — real iOS needs macOS".
- **SDK setup:** the user does not have the Android SDK; the simulator card includes a **guided first-run setup wizard** that installs everything (cmdline-tools, platform-tools, emulator, one system image, scrcpy).
- **App workflow:** *device only.* The emulator is just a running Android device; any `flutter run`, `adb install`, React Native, etc. from any terminal card targets it automatically. No per-framework build logic.
- **Embedding:** emulator runs headless; **scrcpy** mirrors it and its window is **reparented (Win32 `SetParent`)** into the space, positioned exactly like the existing native browser webview.
- **Palette scope:** everything — launch actions, navigation, canvas tools, window actions.

---

## Part 1 — Command Palette

### UX

- `Ctrl+K` anywhere in the wall view opens a centered overlay: a text input above a filtered action list. Also reachable from a small toolbar button.
- Type to fuzzy-filter; `↑`/`↓` move selection; `Enter` runs; `Esc` closes. Opening the palette calls `useBlocksBrowser(open)` so the native webview(s) hide beneath it, same as the settings modal and launch menu.
- Each row shows: icon/glyph, label, section tag, and (for canvas tools) the single-key shortcut.

### Action registry

New `src/palette/actions.ts` exporting a flat list built per-render from WallView state:

```ts
type PaletteAction = {
  id: string;
  label: string;
  keywords: string[];   // extra search terms
  section: "Launch" | "Navigate" | "Tools" | "Windows";
  shortcut?: string;    // display only
  run: () => void;
};
```

| Section | Actions |
|---|---|
| Launch | one per terminal preset (from `usePresetStore`), Browser, Simulator |
| Navigate | Tasks, Teams, Design, Settings, File Explorer, Back to Start, Switch wall → one action per wall (from `loadIndex()`) |
| Tools | the 12 `TOOLS` entries from `src/wall/tools.ts`, running `setActiveTool` |
| Windows | "Focus <agent name>" per open terminal card (via `focusSession`), "Close browser" / "Close simulator" when open |

`WallView` already owns every callback needed (`onLaunch`, `onTasks`, `onTeams`, `onDesign`, `onExit`, `onSwitch`, gear/explorer state, card store). The palette receives the built registry as a prop; it holds no app logic itself.

### Components

- `src/palette/CommandPalette.tsx` — overlay UI, keyboard handling, selection state.
- `src/palette/fuzzy.ts` — scoring: case-insensitive subsequence match with word-prefix and consecutive-run bonuses; ties broken by section order. No external library.
- Hotkey registration in `WallView` using the same matcher pattern as `VibeAgent.tsx` (`matchesHotkey`). `Ctrl+K` is checked before Excalidraw sees the event (capture phase), and ignored while focus is inside an input/textarea/xterm.

### Testing

Vitest unit tests (matching existing `*.test.ts` style): `fuzzy.test.ts` (ordering, prefix bonus, no-match), `actions.test.ts` (registry built correctly from given presets/cards/walls; run callbacks invoked).

---

## Part 2 — Mobile Simulator card

### UX

- Launching "Simulator" (palette or Launch menu) opens a **device picker**:
  - **Android — full emulator:** Pixel 8 (phone) and Pixel Tablet profiles.
  - **iOS — UI preview:** iPhone 15 and iPhone SE frames, badged "UI preview — real iOS needs macOS".
- The card is a normal grid card (like the browser): header with device name, rotate, Android nav (back / home / recents via `adb shell input keyevent`), close button. Body is the device screen.
- One simulator card per wall (singleton, same pattern as `BROWSER_ID`). Card position/size and chosen device persist in the wall doc; the card restores on wall load in a "tap to boot" state (no auto-boot).

### Android path (real emulator)

New Rust module `src-tauri/src/simulator/` with commands mirroring the browser module:

- `sim_setup_status()` — reports which pieces are installed (SDK dir, platform-tools, emulator, system image, AVD, scrcpy) by probing the configured SDK path.
- `sim_setup_run(installDir)` — drives the setup wizard steps, emitting progress events.
- `sim_boot(profile)` / `sim_shutdown()` — start `emulator -avd <name> -no-window`, poll `adb wait-for-device` + `sys.boot_completed`; on boot, spawn scrcpy attached to the emulator serial.
- `sim_set_rect(x, y, w, h)` / `sim_set_visible(bool)` — position/show the reparented scrcpy window; frontend syncs it on camera/card changes exactly like `syncBrowserRect`.
- `sim_key(event)` — `adb shell input keyevent` for back/home/recents/rotate.

**Reparenting:** after spawning scrcpy (`--window-borderless --window-title "vibe-sim-<id>"`), find its HWND by title, `SetParent` into the Tauri main window, strip WS_POPUP/apply WS_CHILD, then position via `sim_set_rect`. Mouse, keyboard, and clipboard flow through scrcpy natively.

**Process lifecycle:** closing the card or exiting the wall kills scrcpy and shuts the emulator down (`adb emu kill`). If either process dies unexpectedly, the card shows a "Simulator stopped — Relaunch" state (detected by process-exit events from Rust).

### First-run setup wizard

Shown in-card when `sim_setup_status()` reports anything missing:

1. **Location step:** pick install directory; default = drive with most free space; hard warning if < 12 GB free (the full download is ~10 GB). SDK path saved in settings (`settingsStore`).
2. **Download step:** with an explicit size disclosure and confirm, Rust downloads and unpacks, with per-step progress events:
   - Android cmdline-tools zip (Google, free)
   - `sdkmanager --licenses` (auto-accept), then `platform-tools`, `emulator`, one `system-images;android-35;google_apis;x86_64`
   - `avdmanager create avd` for each device profile (created lazily on first boot of that profile)
   - scrcpy release zip (~5 MB, Apache-2.0)
3. **Done step:** "Boot device".

Everything installed is free and official (Google Android SDK under its standard license, scrcpy Apache-2.0). No Android Studio required. Setup state machine lives in `src/simulator/setupState.ts` (frontend) so it is unit-testable; Rust only executes steps and reports progress/errors. Any step failure surfaces the error with a Retry that resumes from the failed step.

### iOS path (device-frame preview)

- Reuses the native-webview machinery (a second webview instance, generalized from the browser module) pointed at a **local dev-server URL** the user enters (e.g. from `flutter run -d web-server` in a terminal card).
- Webview sized to exact logical points for the chosen iPhone (e.g. 393×852 @3x for iPhone 15) with an iOS Safari user agent; the card draws the surrounding iPhone frame (bezel, notch/Dynamic Island, home indicator) in HTML/CSS.
- Persistent badge: "UI preview — real iOS needs macOS".
- No Apple software is downloaded or emulated; this is honest UI-preview framing, not an iOS runtime.

### Persistence & wall doc

`WallDoc` gains an optional `simulator: { profileId, gridIndex }` entry, mirroring the existing `browser` entry. Terminals/browser behavior unchanged.

### Testing

- Vitest: `setupState.test.ts` (wizard step transitions, resume-after-failure), device profile table test (dimensions/DPR sane), palette integration (Simulator action present).
- Manual end-to-end: full wizard on a clean machine path, `flutter run` from a terminal card landing on the embedded emulator, rotate/back/home, kill-and-relaunch recovery, iOS frame pointed at a Flutter web dev server.

---

## Out of scope

- Real iOS runtime (impossible on Windows), cloud device farms (not free).
- Per-framework build orchestration ("Run" buttons) — the device-only workflow covers Flutter/RN/native uniformly.
- Multiple simultaneous simulator cards; mirroring physical USB devices (scrcpy makes this a natural later add).
- Team/shared-space sync of the simulator card (local-only, like the browser card).
