import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { WallMeta, WallDoc } from "./types";
import { DEFAULT_PRESETS, type Preset } from "../wall/presets";
import type { Task } from "../tasks/taskStore";

export async function loadIndex(): Promise<WallMeta[]> {
  return JSON.parse(await invoke<string>("index_load"));
}
export function saveIndex(index: WallMeta[]): Promise<void> {
  return invoke("index_save", { json: JSON.stringify(index) });
}
export async function loadWall(id: string): Promise<WallDoc | null> {
  const s = await invoke<string | null>("wall_load", { id });
  return s ? (JSON.parse(s) as WallDoc) : null;
}
export function saveWall(id: string, doc: WallDoc): Promise<void> {
  return invoke("wall_save", { id, json: JSON.stringify(doc) });
}
export function deleteWall(id: string): Promise<void> {
  return invoke("wall_delete", { id });
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
export function importBackground(srcPath: string, destName: string): Promise<string> {
  return invoke("import_background", { srcPath, destName });
}

export async function loadPresets(): Promise<Preset[]> {
  const s = await invoke<string | null>("presets_load");
  if (s) return JSON.parse(s) as Preset[];
  // First run: write the defaults so the user has a presets.json to edit.
  await invoke("presets_save", { json: JSON.stringify(DEFAULT_PRESETS, null, 2) });
  return DEFAULT_PRESETS;
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
