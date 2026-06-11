import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const exitChannel = (id: string) => `pty://exit/${id}`;

/** Raw channel payloads arrive as ArrayBuffer on the fast path; some platforms
    may deliver plain number arrays. Normalize to Uint8Array for xterm. */
export function toBytes(msg: ArrayBuffer | number[]): Uint8Array {
  return msg instanceof ArrayBuffer ? new Uint8Array(msg) : Uint8Array.from(msg);
}

export function spawnPty(args: {
  id: string;
  shell: string;
  cwd?: string;
  rows: number;
  cols: number;
  command?: string;
  onData: (bytes: Uint8Array) => void;
}): Promise<void> {
  const { onData, ...rest } = args;
  const ch = new Channel<ArrayBuffer | number[]>();
  ch.onmessage = (msg) => onData(toBytes(msg));
  return invoke("pty_spawn", { ...rest, onData: ch });
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

export function onPtyExit(id: string, cb: () => void): Promise<UnlistenFn> {
  return listen(exitChannel(id), () => cb());
}
