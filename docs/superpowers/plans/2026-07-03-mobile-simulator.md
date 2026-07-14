# Mobile Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Android/iOS simulator card living natively inside the wall: real headless Android Emulator mirrored via a reparented scrcpy window, plus an honest iPhone device-frame preview webview, with a guided first-run SDK setup wizard.

**Architecture:** A new Rust module `src-tauri/src/simulator/` mirrors the browser module's shape: Tauri commands + managed state, positioned over the canvas by frontend rect-sync. Android pixels come from scrcpy (spawned, window found by title, `SetParent`-ed into the main window, moved with `SetWindowPos`). iOS preview is a second native Tauri child webview with an iOS user agent. Frontend gets `src/simulator/` (client, profiles, wizard state machine) and a `SimulatorWindow` card in `src/wall/`.

**Tech Stack:** Tauri 2 (unstable feature already on), Rust `windows` crate (Win32), official Android SDK cmdline-tools + emulator, Temurin JRE 17 (sdkmanager/avdmanager need Java), scrcpy v3.x (Apache-2.0), React 19 + TS, vitest.

**Spec:** `docs/superpowers/specs/2026-07-03-command-palette-and-mobile-simulator-design.md` (Part 2).
**Depends on:** the command-palette plan being merged (Task 11 registers palette actions in `src/palette/actions.ts`).

## Global Constraints

- Repo: `vibe-space/` (own git repo, branch `V1.0.0`). Paths relative to repo root.
- Windows-only feature: all Win32/scrcpy/emulator code is `#[cfg(windows)]`; non-Windows builds of these commands return `Err("simulator requires Windows")`.
- No new heavyweight Rust deps: downloads use Windows' bundled `curl.exe`, archives use Windows' bundled `tar.exe`. Only new dep: `windows` crate (already transitively present via `windows-core`).
- The wall app may be running while you work — NEVER kill vite on port 1420 or restart the running Tauri app. Manual verification steps are executed by the user after their own restart.
- Frontend tests colocated (`foo.test.ts` beside `foo.ts`), run with `npx vitest run <path>`. Rust tests run with `cargo test` inside `src-tauri/` (compile-check with `cargo check`).
- Sizes/versions pinned in this plan: cmdline-tools `11076708`, system image `system-images;android-35;google_apis;x86_64`, scrcpy `v3.1`, Temurin JRE `17` (jre zip). If a URL 404s at implementation time, take the next-newer pinned version from the same official source and note it in the commit message.
- Match existing code style; overlays call `useBlocksBrowser`; native surfaces hide behind overlays via the blockers store.

---

### Task 1: Settings gains `simulator.sdkPath`

**Files:**
- Modify: `src/settings/settings.ts` (type at line 3, defaults at line 9, `mergeSettings` at line 34)
- Test: `src/settings/settings.test.ts` (extend the existing file; if it doesn't exist, create it)

**Interfaces:**
- Consumes: existing `Settings`, `DEFAULT_SETTINGS`, `mergeSettings`.
- Produces: `Settings["simulator"]: { sdkPath: string }` — later tasks read `useSettingsStore.getState().settings.simulator.sdkPath` ("" = not set up).

- [ ] **Step 1: Write the failing test** (append to `src/settings/settings.test.ts`)

```ts
describe("simulator settings", () => {
  it("defaults sdkPath to empty and round-trips a saved value", () => {
    expect(mergeSettings({}).simulator).toEqual({ sdkPath: "" });
    expect(mergeSettings({ simulator: { sdkPath: "D:\\android-sdk" } }).simulator.sdkPath)
      .toBe("D:\\android-sdk");
    expect(mergeSettings({ simulator: { sdkPath: 42 } }).simulator.sdkPath).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/settings/settings.test.ts` → FAIL (`simulator` missing on type).

- [ ] **Step 3: Implement** in `src/settings/settings.ts`:

Add to the `Settings` type: `simulator: { sdkPath: string };`
Add to `DEFAULT_SETTINGS`: `simulator: { sdkPath: "" },`
Add to `mergeSettings` (following the existing per-section pattern):

```ts
  const sim = isRecord(r.simulator) ? r.simulator : {};
```
and in the returned object:
```ts
    simulator: {
      sdkPath: typeof sim.sdkPath === "string" ? sim.sdkPath : d.simulator.sdkPath,
    },
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/settings/settings.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/settings.ts src/settings/settings.test.ts
git commit -m "feat(simulator): sdkPath setting"
```

---

### Task 2: Device profiles table

**Files:**
- Create: `src/simulator/profiles.ts`
- Test: `src/simulator/profiles.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export type AndroidProfile = {
  kind: "android";
  id: "pixel8" | "pixelTablet";
  label: string;
  /** avdmanager --device id */
  deviceId: string;
  /** AVD name derived from id, e.g. vibe_pixel8 */
  avdName: string;
};
export type IosProfile = {
  kind: "ios";
  id: "iphone15" | "iphoneSE";
  label: string;
  /** CSS logical points of the screen. */
  width: number;
  height: number;
  dpr: number;
  userAgent: string;
  /** Frame chrome flags for the card renderer. */
  hasDynamicIsland: boolean;
};
export type DeviceProfile = AndroidProfile | IosProfile;
export const PROFILES: DeviceProfile[];
export function profileById(id: string): DeviceProfile | undefined;
```

- [ ] **Step 1: Failing test** (`src/simulator/profiles.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { PROFILES, profileById } from "./profiles";

describe("device profiles", () => {
  it("has 2 android + 2 ios profiles with unique ids", () => {
    expect(PROFILES.filter((p) => p.kind === "android")).toHaveLength(2);
    expect(PROFILES.filter((p) => p.kind === "ios")).toHaveLength(2);
    expect(new Set(PROFILES.map((p) => p.id)).size).toBe(PROFILES.length);
  });

  it("ios profiles carry sane portrait dimensions and an iOS user agent", () => {
    for (const p of PROFILES) {
      if (p.kind !== "ios") continue;
      expect(p.height).toBeGreaterThan(p.width);
      expect(p.dpr === 2 || p.dpr === 3).toBe(true);
      expect(p.userAgent).toContain("iPhone OS");
    }
  });

  it("android AVD names are shell-safe", () => {
    for (const p of PROFILES) {
      if (p.kind === "android") expect(p.avdName).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("looks up by id", () => {
    expect(profileById("iphone15")?.kind).toBe("ios");
    expect(profileById("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/simulator/profiles.test.ts` → FAIL.

- [ ] **Step 3: Implement** (`src/simulator/profiles.ts`)

```ts
export type AndroidProfile = {
  kind: "android";
  id: "pixel8" | "pixelTablet";
  label: string;
  deviceId: string;
  avdName: string;
};

export type IosProfile = {
  kind: "ios";
  id: "iphone15" | "iphoneSE";
  label: string;
  width: number;
  height: number;
  dpr: number;
  userAgent: string;
  hasDynamicIsland: boolean;
};

export type DeviceProfile = AndroidProfile | IosProfile;

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

export const PROFILES: DeviceProfile[] = [
  { kind: "android", id: "pixel8", label: "Pixel 8 — full emulator", deviceId: "pixel_8", avdName: "vibe_pixel8" },
  { kind: "android", id: "pixelTablet", label: "Pixel Tablet — full emulator", deviceId: "pixel_tablet", avdName: "vibe_pixeltablet" },
  { kind: "ios", id: "iphone15", label: "iPhone 15 — UI preview", width: 393, height: 852, dpr: 3, userAgent: IOS_UA, hasDynamicIsland: true },
  { kind: "ios", id: "iphoneSE", label: "iPhone SE — UI preview", width: 375, height: 667, dpr: 2, userAgent: IOS_UA, hasDynamicIsland: false },
];

export function profileById(id: string): DeviceProfile | undefined {
  return PROFILES.find((p) => p.id === id);
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/simulator/profiles.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/simulator/profiles.ts src/simulator/profiles.test.ts
git commit -m "feat(simulator): device profile table"
```


<!-- TASK 2 -->

### Task 3: Setup wizard state machine

**Files:**
- Create: `src/simulator/setupState.ts`
- Test: `src/simulator/setupState.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (Task 10's wizard UI drives this; Task 9's client feeds it events):

```ts
export const SETUP_STEPS = ["jre", "cmdlineTools", "platformTools", "emulator", "systemImage", "scrcpy"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
export type StepStatus = "pending" | "active" | "done" | "error";
export type SetupState = {
  statuses: Record<SetupStep, StepStatus>;
  message: string;        // last progress line for the active step
  error: string | null;   // set when any step errored
};
export function initialSetupState(done?: SetupStep[]): SetupState;
export type SetupEvent =
  | { kind: "progress"; step: SetupStep; message: string }
  | { kind: "stepDone"; step: SetupStep }
  | { kind: "failed"; step: SetupStep; error: string }
  | { kind: "retry" };
export function reduceSetup(s: SetupState, e: SetupEvent): SetupState;
export function setupComplete(s: SetupState): boolean;
```

- [ ] **Step 1: Failing test** (`src/simulator/setupState.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { initialSetupState, reduceSetup, setupComplete, SETUP_STEPS } from "./setupState";

describe("setup state machine", () => {
  it("starts all pending, honors already-done steps", () => {
    expect(initialSetupState().statuses.jre).toBe("pending");
    const s = initialSetupState(["jre", "cmdlineTools"]);
    expect(s.statuses.jre).toBe("done");
    expect(s.statuses.platformTools).toBe("pending");
  });

  it("progress marks the step active and stores the message", () => {
    const s = reduceSetup(initialSetupState(), { kind: "progress", step: "jre", message: "downloading…" });
    expect(s.statuses.jre).toBe("active");
    expect(s.message).toBe("downloading…");
  });

  it("stepDone → done; all done → complete", () => {
    let s = initialSetupState();
    for (const step of SETUP_STEPS) s = reduceSetup(s, { kind: "stepDone", step });
    expect(setupComplete(s)).toBe(true);
  });

  it("failed marks error; retry resets only the errored step", () => {
    let s = initialSetupState(["jre"]);
    s = reduceSetup(s, { kind: "failed", step: "cmdlineTools", error: "network down" });
    expect(s.statuses.cmdlineTools).toBe("error");
    expect(s.error).toBe("network down");
    s = reduceSetup(s, { kind: "retry" });
    expect(s.statuses.cmdlineTools).toBe("pending");
    expect(s.statuses.jre).toBe("done");
    expect(s.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/simulator/setupState.test.ts` → FAIL.

- [ ] **Step 3: Implement** (`src/simulator/setupState.ts`)

```ts
/** Ordered install steps; the Rust runner executes them in this order and
 *  reports back by name, so the two lists MUST stay in sync (see setup.rs). */
export const SETUP_STEPS = ["jre", "cmdlineTools", "platformTools", "emulator", "systemImage", "scrcpy"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
export type StepStatus = "pending" | "active" | "done" | "error";

export type SetupState = {
  statuses: Record<SetupStep, StepStatus>;
  message: string;
  error: string | null;
};

export function initialSetupState(done: SetupStep[] = []): SetupState {
  const statuses = Object.fromEntries(
    SETUP_STEPS.map((s) => [s, done.includes(s) ? "done" : "pending"])
  ) as Record<SetupStep, StepStatus>;
  return { statuses, message: "", error: null };
}

export type SetupEvent =
  | { kind: "progress"; step: SetupStep; message: string }
  | { kind: "stepDone"; step: SetupStep }
  | { kind: "failed"; step: SetupStep; error: string }
  | { kind: "retry" };

export function reduceSetup(s: SetupState, e: SetupEvent): SetupState {
  switch (e.kind) {
    case "progress":
      return { ...s, statuses: { ...s.statuses, [e.step]: "active" }, message: e.message };
    case "stepDone":
      return { ...s, statuses: { ...s.statuses, [e.step]: "done" }, message: "" };
    case "failed":
      return { ...s, statuses: { ...s.statuses, [e.step]: "error" }, error: e.error };
    case "retry": {
      const statuses = { ...s.statuses };
      for (const step of SETUP_STEPS) if (statuses[step] === "error") statuses[step] = "pending";
      return { statuses, message: "", error: null };
    }
  }
}

export function setupComplete(s: SetupState): boolean {
  return SETUP_STEPS.every((step) => s.statuses[step] === "done");
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/simulator/setupState.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/simulator/setupState.ts src/simulator/setupState.test.ts
git commit -m "feat(simulator): setup wizard state machine"
```


### Task 4: Rust module scaffold — SDK paths, probe, disk-free

**Files:**
- Create: `src-tauri/src/simulator/mod.rs`, `src-tauri/src/simulator/sdk.rs`, `src-tauri/src/simulator/commands.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod simulator;`, `.manage(simulator::SimState::default())`, and the new commands to `invoke_handler`)
- Modify: `src-tauri/Cargo.toml` (extend the `[target.'cfg(windows)'.dependencies]` section)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Rust: `SdkPaths::new(root: &Path)` with fields `adb`, `emulator`, `sdkmanager`, `avdmanager`, `scrcpy`, `java_home`; `setup_status(root: &Path) -> SetupStatus`; `SimState` (managed).
  - Tauri commands: `sim_setup_status(sdkRoot) -> SetupStatus { jre, cmdlineTools, platformTools, emulator, systemImage, scrcpy: bool, avds: Vec<String> }`, `sim_disk_free(path) -> u64` (bytes).

- [ ] **Step 1: Add Cargo deps**

In `src-tauri/Cargo.toml`, extend the windows-target section:

```toml
[target.'cfg(windows)'.dependencies]
webview2-com = "0.38"
windows-core = "0.61"
windows = { version = "0.61", features = [
  "Win32_Foundation",
  "Win32_UI_WindowsAndMessaging",
  "Win32_Storage_FileSystem",
] }
```

- [ ] **Step 2: Write the Rust unit test first** — in `src-tauri/src/simulator/sdk.rs` (bottom of the file you're about to create; write the test module first, stub the functions, watch it fail):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn setup_status_reflects_files_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let s = setup_status(root);
        assert!(!s.platform_tools && !s.scrcpy && s.avds.is_empty());

        fs::create_dir_all(root.join("platform-tools")).unwrap();
        fs::write(root.join("platform-tools/adb.exe"), b"x").unwrap();
        fs::create_dir_all(root.join("scrcpy")).unwrap();
        fs::write(root.join("scrcpy/scrcpy.exe"), b"x").unwrap();
        fs::create_dir_all(root.join("system-images/android-35/google_apis/x86_64")).unwrap();
        let s = setup_status(root);
        assert!(s.platform_tools && s.scrcpy && s.system_image);
        assert!(!s.emulator); // emulator/emulator.exe absent
    }
}
```

- [ ] **Step 3: Implement `sdk.rs`**

```rust
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Well-known locations inside the user-chosen SDK root. Everything the
/// feature runs lives under this one directory so uninstall = delete it.
pub struct SdkPaths {
    pub adb: PathBuf,
    pub emulator: PathBuf,
    pub sdkmanager: PathBuf,
    pub avdmanager: PathBuf,
    pub scrcpy: PathBuf,
    pub java_home: PathBuf,
}

impl SdkPaths {
    pub fn new(root: &Path) -> Self {
        Self {
            adb: root.join("platform-tools/adb.exe"),
            emulator: root.join("emulator/emulator.exe"),
            sdkmanager: root.join("cmdline-tools/latest/bin/sdkmanager.bat"),
            avdmanager: root.join("cmdline-tools/latest/bin/avdmanager.bat"),
            scrcpy: root.join("scrcpy/scrcpy.exe"),
            java_home: root.join("jre"),
        }
    }
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    pub jre: bool,
    pub cmdline_tools: bool,
    pub platform_tools: bool,
    pub emulator: bool,
    pub system_image: bool,
    pub scrcpy: bool,
    /// AVD names found in the standard .android/avd home.
    pub avds: Vec<String>,
}

pub fn setup_status(root: &Path) -> SetupStatus {
    let p = SdkPaths::new(root);
    let avd_home = dirs_avd_home();
    let avds = std::fs::read_dir(&avd_home)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .filter_map(|e| {
                    let n = e.file_name().to_string_lossy().to_string();
                    n.strip_suffix(".avd").map(|s| s.to_string())
                })
                .collect()
        })
        .unwrap_or_default();
    SetupStatus {
        jre: p.java_home.join("bin/java.exe").exists(),
        cmdline_tools: p.sdkmanager.exists(),
        platform_tools: p.adb.exists(),
        emulator: p.emulator.exists(),
        system_image: root.join("system-images/android-35/google_apis/x86_64").exists(),
        scrcpy: p.scrcpy.exists(),
        avds,
    }
}

/// %USERPROFILE%\.android\avd — where avdmanager puts AVDs by default.
pub fn dirs_avd_home() -> PathBuf {
    std::env::var_os("ANDROID_AVD_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let home = std::env::var_os("USERPROFILE").map(PathBuf::from).unwrap_or_default();
            home.join(".android/avd")
        })
}
```

(The test sets nothing in `%USERPROFILE%` — on CI-less local runs the real avd dir may exist; the first assertion `s.avds.is_empty()` would then be wrong. Guard it: in the test, set `ANDROID_AVD_HOME` to the tempdir first: `std::env::set_var("ANDROID_AVD_HOME", root.join("avd"));` as the first line. Include that line in the final test.)

- [ ] **Step 4: Implement `mod.rs`**

```rust
pub mod commands;
pub mod sdk;

use parking_lot::Mutex;
use std::process::Child;

/// Live simulator processes. Children are killed on drop of the app (Tauri
/// exits) or explicitly by sim_shutdown.
#[derive(Default)]
pub struct SimState(pub Mutex<SimInner>);

#[derive(Default)]
pub struct SimInner {
    pub emulator: Option<Child>,
    pub scrcpy: Option<Child>,
    /// scrcpy's reparented HWND as isize (Send-safe).
    pub scrcpy_hwnd: Option<isize>,
    pub serial: Option<String>,
}
```

- [ ] **Step 5: Implement `commands.rs` (status + disk-free only for now)**

```rust
use super::sdk::{setup_status, SetupStatus};
use super::SimState;
use std::path::Path;
use tauri::State;

#[tauri::command]
pub async fn sim_setup_status(sdk_root: String) -> Result<SetupStatus, String> {
    if sdk_root.trim().is_empty() {
        return Ok(SetupStatus::default());
    }
    Ok(setup_status(Path::new(&sdk_root)))
}

#[tauri::command]
pub async fn sim_disk_free(path: String) -> Result<u64, String> {
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
        let mut free: u64 = 0;
        unsafe {
            GetDiskFreeSpaceExW(&HSTRING::from(path.as_str()), Some(&mut free), None, None)
                .map_err(|e| e.to_string())?;
        }
        Ok(free)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("simulator requires Windows".into())
    }
}

// Silences "unused" until later tasks add process commands.
#[allow(dead_code)]
fn _touch(_: &State<'_, SimState>) {}
```

- [ ] **Step 6: Register in `lib.rs`**

Add `mod simulator;` to the module list (line 1-5), `.manage(simulator::SimState::default())` after the other `.manage(...)` calls (line ~36), and to `invoke_handler`:

```rust
            simulator::commands::sim_setup_status,
            simulator::commands::sim_disk_free,
```

- [ ] **Step 7: Build + test**

Run: `cd src-tauri && cargo test simulator && cargo check`
Expected: the sdk.rs test passes; whole crate compiles.
(Disk note: cargo builds are heavy on C:. Do NOT build sibling projects; this repo's `target/` only.)

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/simulator src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(simulator): rust scaffold - sdk probe + disk free"
```


### Task 5: Rust setup runner (downloads + installs)

**Files:**
- Create: `src-tauri/src/simulator/setup.rs`
- Modify: `src-tauri/src/simulator/mod.rs` (add `pub mod setup;`)
- Modify: `src-tauri/src/simulator/commands.rs` (add `sim_setup_run`)
- Modify: `src-tauri/src/lib.rs` (register `sim_setup_run`)

**Interfaces:**
- Consumes: `SdkPaths`, `setup_status` (Task 4).
- Produces: command `sim_setup_run(sdkRoot: String)` — runs all missing steps in `SETUP_STEPS` order, emitting events the frontend reduces with Task 3's machine:
  - `sim://setup` payload `{ kind: "progress", step, message }`
  - `sim://setup` payload `{ kind: "stepDone", step }`
  - `sim://setup` payload `{ kind: "failed", step, error }` (then returns Err)

Step names MUST match Task 3's `SETUP_STEPS`: `jre`, `cmdlineTools`, `platformTools`, `emulator`, `systemImage`, `scrcpy`.

- [ ] **Step 1: Implement `setup.rs`**

```rust
use super::sdk::{setup_status, SdkPaths};
use serde::Serialize;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Emitter};

const JRE_URL: &str = "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jre/hotspot/normal/eclipse";
const CMDLINE_TOOLS_URL: &str =
    "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip";
const SCRCPY_URL: &str =
    "https://github.com/Genymobile/scrcpy/releases/download/v3.1/scrcpy-win64-v3.1.zip";
const SYSTEM_IMAGE: &str = "system-images;android-35;google_apis;x86_64";

/// Google's published license hashes; writing them is the documented
/// non-interactive alternative to `sdkmanager --licenses`.
const LICENSES: &[(&str, &str)] = &[
    ("android-sdk-license", "24333f8a63b6825ea9c5514f83c2829b004d1fee"),
    ("android-sdk-preview-license", "84831b9409646a918e30573bab4c9c91346d8abd"),
];

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SetupEvent {
    Progress { step: String, message: String },
    StepDone { step: String },
    Failed { step: String, error: String },
}

fn emit(app: &AppHandle, e: SetupEvent) {
    let _ = app.emit("sim://setup", e);
}

fn progress(app: &AppHandle, step: &str, message: &str) {
    emit(app, SetupEvent::Progress { step: step.into(), message: message.into() });
}

/// Runs a command to completion; stderr+status folded into the error string.
fn run(mut cmd: Command) -> Result<(), String> {
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.status.success() {
        return Ok(());
    }
    Err(format!(
        "exit {}: {}",
        out.status,
        String::from_utf8_lossy(&out.stderr).chars().take(800).collect::<String>()
    ))
}

/// Windows ships curl.exe and a zip-capable tar.exe — no HTTP/zip crates needed.
fn download(url: &str, dest: &Path) -> Result<(), String> {
    let mut c = Command::new("curl.exe");
    c.args(["-L", "--fail", "--silent", "--show-error", "-o"]).arg(dest).arg(url);
    run(c)
}

fn unzip(zip: &Path, into: &Path) -> Result<(), String> {
    std::fs::create_dir_all(into).map_err(|e| e.to_string())?;
    let mut c = Command::new("tar.exe");
    c.arg("-xf").arg(zip).arg("-C").arg(into);
    run(c)
}

/// Finds the single directory a zip expanded to (Temurin/scrcpy zips wrap
/// everything in a versioned folder) and renames it to `final_name`.
fn promote_single_dir(parent: &Path, final_name: &str) -> Result<(), String> {
    let target = parent.join(final_name);
    if target.exists() {
        return Ok(());
    }
    let entries: Vec<_> = std::fs::read_dir(parent)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .collect();
    if entries.len() != 1 {
        return Err(format!("expected one extracted dir in {parent:?}, found {}", entries.len()));
    }
    std::fs::rename(entries[0].path(), &target).map_err(|e| e.to_string())
}

fn sdkmanager(root: &Path, args: &[&str]) -> Result<(), String> {
    let p = SdkPaths::new(root);
    let mut c = Command::new(&p.sdkmanager);
    c.arg(format!("--sdk_root={}", root.display()))
        .args(args)
        .env("JAVA_HOME", &p.java_home);
    run(c)
}

pub fn run_setup(app: &AppHandle, root: &Path) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let tmp = root.join("tmp");
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let status = setup_status(root);

    let step = |app: &AppHandle, name: &str, f: &dyn Fn() -> Result<(), String>| -> Result<(), String> {
        match f() {
            Ok(()) => {
                emit(app, SetupEvent::StepDone { step: name.into() });
                Ok(())
            }
            Err(e) => {
                emit(app, SetupEvent::Failed { step: name.into(), error: e.clone() });
                Err(e)
            }
        }
    };

    if !status.jre {
        step(app, "jre", &|| {
            progress(app, "jre", "Downloading Java runtime (~45 MB)…");
            let zip = tmp.join("jre.zip");
            download(JRE_URL, &zip)?;
            progress(app, "jre", "Unpacking…");
            let stage = tmp.join("jre-stage");
            unzip(&zip, &stage)?;
            promote_single_dir(&stage, "jre-final")?;
            std::fs::rename(stage.join("jre-final"), root.join("jre")).map_err(|e| e.to_string())
        })?;
    }
    if !status.cmdline_tools {
        step(app, "cmdlineTools", &|| {
            progress(app, "cmdlineTools", "Downloading Android command-line tools (~130 MB)…");
            let zip = tmp.join("cmdline-tools.zip");
            download(CMDLINE_TOOLS_URL, &zip)?;
            progress(app, "cmdlineTools", "Unpacking…");
            let stage = tmp.join("clt-stage");
            unzip(&zip, &stage)?;
            // Google requires the layout cmdline-tools/latest/…
            let latest = root.join("cmdline-tools/latest");
            std::fs::create_dir_all(latest.parent().unwrap()).map_err(|e| e.to_string())?;
            std::fs::rename(stage.join("cmdline-tools"), &latest).map_err(|e| e.to_string())?;
            // Pre-accept licenses so sdkmanager never prompts.
            let lic = root.join("licenses");
            std::fs::create_dir_all(&lic).map_err(|e| e.to_string())?;
            for (file, hash) in LICENSES {
                std::fs::write(lic.join(file), format!("\n{hash}\n")).map_err(|e| e.to_string())?;
            }
            Ok(())
        })?;
    }
    if !status.platform_tools {
        step(app, "platformTools", &|| {
            progress(app, "platformTools", "Installing platform-tools (adb)…");
            sdkmanager(root, &["platform-tools"])
        })?;
    }
    if !status.emulator {
        step(app, "emulator", &|| {
            progress(app, "emulator", "Installing the Android Emulator (~400 MB)…");
            sdkmanager(root, &["emulator"])
        })?;
    }
    if !status.system_image {
        step(app, "systemImage", &|| {
            progress(app, "systemImage", "Downloading the Android 15 system image (~1.6 GB)…");
            sdkmanager(root, &[SYSTEM_IMAGE])
        })?;
    }
    if !status.scrcpy {
        step(app, "scrcpy", &|| {
            progress(app, "scrcpy", "Downloading scrcpy (~15 MB)…");
            let zip = tmp.join("scrcpy.zip");
            download(SCRCPY_URL, &zip)?;
            let stage = tmp.join("scrcpy-stage");
            unzip(&zip, &stage)?;
            promote_single_dir(&stage, "scrcpy-final")?;
            std::fs::rename(stage.join("scrcpy-final"), root.join("scrcpy")).map_err(|e| e.to_string())
        })?;
    }
    let _ = std::fs::remove_dir_all(&tmp);
    Ok(())
}
```

- [ ] **Step 2: Add the command** (in `commands.rs`)

```rust
#[tauri::command]
pub async fn sim_setup_run(app: tauri::AppHandle, sdk_root: String) -> Result<(), String> {
    let root = std::path::PathBuf::from(sdk_root);
    // Blocking work (downloads, child processes) off the async runtime.
    tauri::async_runtime::spawn_blocking(move || super::setup::run_setup(&app, &root))
        .await
        .map_err(|e| e.to_string())?
}
```

Register `simulator::commands::sim_setup_run` in `lib.rs`'s `invoke_handler`.

- [ ] **Step 3: Compile** — `cd src-tauri && cargo check` → clean. (Network steps are verified end-to-end in Task 12; they can't be unit-tested meaningfully.)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/simulator src-tauri/src/lib.rs
git commit -m "feat(simulator): guided SDK/JRE/scrcpy setup runner"
```


### Task 6: Rust emulator lifecycle (AVD create, boot, shutdown, keys)

**Files:**
- Create: `src-tauri/src/simulator/emulator.rs`
- Modify: `src-tauri/src/simulator/mod.rs` (add `pub mod emulator;`)
- Modify: `src-tauri/src/simulator/commands.rs` (add `sim_boot`, `sim_shutdown`, `sim_key`)
- Modify: `src-tauri/src/lib.rs` (register the three commands)

**Interfaces:**
- Consumes: `SdkPaths`, `SimState` (Task 4); Task 7 attaches scrcpy after boot.
- Produces:
  - `sim_boot(sdkRoot, avdName, deviceId)` — creates the AVD if missing, boots headless, resolves the serial, stores emulator child + serial in `SimState`. Emits `sim://boot` `{ message }` progress lines and returns the serial.
  - `sim_shutdown()` — kills scrcpy child (if any), `adb emu kill`, clears state.
  - `sim_key(name)` — `back` | `home` | `recents` → adb keyevents 4 / 3 / 187.
  - Internal helper `adb(root, serial, args) -> Result<String, String>` reused by Task 7.

- [ ] **Step 1: Implement `emulator.rs`**

```rust
use super::sdk::{dirs_avd_home, SdkPaths};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const SYSTEM_IMAGE: &str = "system-images;android-35;google_apis;x86_64";
const BOOT_TIMEOUT: Duration = Duration::from_secs(300);

fn emit_boot(app: &AppHandle, message: &str) {
    let _ = app.emit("sim://boot", serde_json::json!({ "message": message }));
}

pub fn adb(root: &Path, serial: Option<&str>, args: &[&str]) -> Result<String, String> {
    let p = SdkPaths::new(root);
    let mut c = Command::new(&p.adb);
    if let Some(s) = serial {
        c.args(["-s", s]);
    }
    c.args(args);
    let out = c.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

fn ensure_avd(root: &Path, avd_name: &str, device_id: &str) -> Result<(), String> {
    if dirs_avd_home().join(format!("{avd_name}.avd")).exists() {
        return Ok(());
    }
    let p = SdkPaths::new(root);
    let mut c = Command::new(&p.avdmanager);
    c.args(["create", "avd", "--name", avd_name, "--package", SYSTEM_IMAGE, "--device", device_id])
        .env("JAVA_HOME", &p.java_home)
        .stdin(Stdio::piped());
    let mut child = c.spawn().map_err(|e| e.to_string())?;
    // avdmanager asks "create a custom hardware profile? [no]" — answer no.
    use std::io::Write;
    if let Some(stdin) = child.stdin.as_mut() {
        let _ = stdin.write_all(b"no\n");
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }
    Ok(())
}

fn spawn_emulator(root: &Path, avd_name: &str) -> Result<Child, String> {
    let p = SdkPaths::new(root);
    Command::new(&p.emulator)
        .args(["-avd", avd_name, "-no-window", "-no-boot-anim", "-no-snapshot"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())
}

/// First emulator serial in `adb devices` output (e.g. "emulator-5554").
fn find_serial(root: &Path) -> Option<String> {
    let out = adb(root, None, &["devices"]).ok()?;
    out.lines()
        .filter_map(|l| l.split_whitespace().next())
        .find(|s| s.starts_with("emulator-"))
        .map(|s| s.to_string())
}

/// Boots (or reuses) the AVD and blocks until Android reports boot complete.
pub fn boot(app: &AppHandle, root: &Path, avd_name: &str, device_id: &str) -> Result<(Child, String), String> {
    emit_boot(app, "Preparing virtual device…");
    ensure_avd(root, avd_name, device_id)?;
    emit_boot(app, "Starting emulator…");
    let child = spawn_emulator(root, avd_name)?;
    let started = Instant::now();
    let serial = loop {
        if let Some(s) = find_serial(root) {
            break s;
        }
        if started.elapsed() > BOOT_TIMEOUT {
            return Err("emulator never appeared in adb devices — check virtualization (WHPX/AEHD) is enabled".into());
        }
        std::thread::sleep(Duration::from_millis(500));
    };
    emit_boot(app, "Booting Android…");
    loop {
        let done = adb(root, Some(&serial), &["shell", "getprop", "sys.boot_completed"])
            .map(|s| s.trim() == "1")
            .unwrap_or(false);
        if done {
            break;
        }
        if started.elapsed() > BOOT_TIMEOUT {
            return Err("Android did not finish booting in time".into());
        }
        std::thread::sleep(Duration::from_millis(1000));
    }
    emit_boot(app, "Android is up.");
    Ok((child, serial))
}
```

- [ ] **Step 2: Add the commands** (in `commands.rs`)

```rust
#[tauri::command]
pub async fn sim_boot(
    app: tauri::AppHandle,
    state: State<'_, SimState>,
    sdk_root: String,
    avd_name: String,
    device_id: String,
) -> Result<String, String> {
    if state.0.lock().emulator.is_some() {
        return Err("simulator already running".into());
    }
    let app2 = app.clone();
    let (child, serial) = tauri::async_runtime::spawn_blocking(move || {
        super::emulator::boot(&app2, std::path::Path::new(&sdk_root), &avd_name, &device_id)
    })
    .await
    .map_err(|e| e.to_string())??;
    let mut inner = state.0.lock();
    inner.emulator = Some(child);
    inner.serial = Some(serial.clone());
    Ok(serial)
}

#[tauri::command]
pub async fn sim_shutdown(state: State<'_, SimState>, sdk_root: String) -> Result<(), String> {
    let (mut scrcpy, serial) = {
        let mut inner = state.0.lock();
        inner.scrcpy_hwnd = None;
        (inner.scrcpy.take(), inner.serial.take())
    };
    if let Some(c) = scrcpy.as_mut() {
        let _ = c.kill();
    }
    if let Some(serial) = serial {
        let _ = super::emulator::adb(std::path::Path::new(&sdk_root), Some(&serial), &["emu", "kill"]);
    }
    let mut inner = state.0.lock();
    if let Some(mut c) = inner.emulator.take() {
        // emu kill is graceful; this is the backstop.
        std::thread::sleep(std::time::Duration::from_millis(1500));
        let _ = c.kill();
    }
    Ok(())
}

#[tauri::command]
pub async fn sim_key(state: State<'_, SimState>, sdk_root: String, name: String) -> Result<(), String> {
    let code = match name.as_str() {
        "back" => "4",
        "home" => "3",
        "recents" => "187",
        _ => return Err(format!("unknown key {name}")),
    };
    let serial = state.0.lock().serial.clone().ok_or("simulator not running")?;
    super::emulator::adb(std::path::Path::new(&sdk_root), Some(&serial), &["shell", "input", "keyevent", code])
        .map(|_| ())
}
```

Register `sim_boot`, `sim_shutdown`, `sim_key` in `lib.rs`.

- [ ] **Step 3: Compile** — `cd src-tauri && cargo check` → clean.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/simulator src-tauri/src/lib.rs
git commit -m "feat(simulator): emulator boot/shutdown/key commands"
```


<!-- TASK 7 -->

<!-- TASK 8 -->

<!-- TASK 9 -->

<!-- TASK 10 -->

<!-- TASK 11 -->

<!-- TASK 12 -->
