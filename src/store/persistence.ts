import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import type { WallMeta, WallDoc } from "./types";
import { DEFAULT_PRESETS, mergeNewDefaults, upgradeLegacyPresets, type Preset } from "../wall/presets";
import { mergeSettings, type Settings } from "../settings/settings";
import type { Task } from "../tasks/taskStore";

export async function loadIndex(): Promise<WallMeta[]> {
  return JSON.parse(await invoke<string>("index_load"));
}
export function saveIndex(index: WallMeta[]): Promise<void> {
  return invoke("index_save", { json: JSON.stringify(index) });
}
export async function loadWall(id: string): Promise<WallDoc | null> {
  const s = await invoke<string | null>("space_load", { id });
  return s ? (JSON.parse(s) as WallDoc) : null;
}
export function saveWall(id: string, doc: WallDoc): Promise<void> {
  return invoke("space_save", { id, json: JSON.stringify(doc) });
}
export function deleteWall(id: string): Promise<void> {
  return invoke("space_delete", { id });
}
export function saveThumbnail(id: string, bytes: Uint8Array): Promise<void> {
  return invoke("thumb_save", { id, bytes: Array.from(bytes) });
}
export async function loadThumbnailUrl(id: string): Promise<string | null> {
  const bytes = await invoke<number[] | null>("thumb_load", { id });
  if (!bytes) return null;
  const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
  return URL.createObjectURL(blob);
}
export async function loadThumbnailBytes(id: string): Promise<Uint8Array | null> {
  const bytes = await invoke<number[] | null>("thumb_load", { id });
  return bytes ? new Uint8Array(bytes) : null;
}
export function importBackground(srcPath: string, destName: string): Promise<string> {
  return invoke("import_background", { srcPath, destName });
}

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
export function savePresets(presets: Preset[]): Promise<void> {
  return invoke("presets_save", { json: JSON.stringify(presets, null, 2) });
}

export async function loadSettings(): Promise<Settings> {
  const s = await invoke<string | null>("settings_load");
  return mergeSettings(s ? JSON.parse(s) : undefined);
}
export function saveSettings(settings: Settings): Promise<void> {
  return invoke("settings_save", { json: JSON.stringify(settings, null, 2) });
}

/** Open a folder's contents in the OS file explorer. */
export function openFolder(path: string): Promise<void> {
  return openPath(path);
}

/** True when `path` is an existing directory (used to filter dropped items). */
export function isDir(path: string): Promise<boolean> {
  return invoke<boolean>("is_dir", { path });
}

export type DirEntry = { name: string; path: string; is_dir: boolean };

/** List a directory's immediate children for the file-explorer tree. */
export function readDir(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("read_dir", { path });
}

/** Read a text file's contents for the in-app viewer (rejects files over 2 MB). */
export function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

/** Read a *.design.json with no size cap (designs may embed image data-URLs). */
export function readDesignFile(path: string): Promise<string> {
  return invoke<string>("read_design_file", { path });
}

/** Write a *.design.json (Rust enforces the extension and creates parent dirs). */
export function writeDesignFile(path: string, contents: string): Promise<void> {
  return invoke("write_design_file", { path, contents });
}

/** Folder picker for "New canvas". Returns the chosen absolute path or null. */
export async function pickFolder(): Promise<string | null> {
  const res = await open({ directory: true, multiple: false });
  return typeof res === "string" ? res : null;
}

export async function loadTasks(): Promise<Task[]> {
  return JSON.parse(await invoke<string>("tasks_load"));
}
export function saveTasks(tasks: Task[]): Promise<void> {
  return invoke("tasks_save", { json: JSON.stringify(tasks) });
}

/** File picker for a background image/video. Returns the absolute path or null. */
export async function pickBackgroundFile(): Promise<string | null> {
  const res = await open({
    multiple: false,
    filters: [{ name: "Media", extensions: ["png", "jpg", "jpeg", "gif", "webp", "mp4", "webm"] }],
  });
  return typeof res === "string" ? res : null;
}
