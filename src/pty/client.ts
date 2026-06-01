import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const dataChannel = (id: string) => `pty://data/${id}`;
export const exitChannel = (id: string) => `pty://exit/${id}`;

export function spawnPty(args: {
  id: string;
  shell: string;
  cwd?: string;
  rows: number;
  cols: number;
}): Promise<void> {
  return invoke("pty_spawn", args);
}

export function writePty(id: string, data: Uint8Array): Promise<void> {
  return invoke("pty_write", { id, data: Array.from(data) });
}

export function resizePty(id: string, rows: number, cols: number): Promise<void> {
  return invoke("pty_resize", { id, rows, cols });
}

export function killPty(id: string): Promise<void> {
  return invoke("pty_kill", { id });
}

export function onPtyData(
  id: string,
  cb: (bytes: Uint8Array) => void
): Promise<UnlistenFn> {
  return listen<number[]>(dataChannel(id), (e) => cb(Uint8Array.from(e.payload)));
}

export function onPtyExit(id: string, cb: () => void): Promise<UnlistenFn> {
  return listen(exitChannel(id), () => cb());
}
