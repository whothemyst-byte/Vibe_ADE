import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Start watching `path`; `cb` fires when that exact file changes on disk.
 *  The returned fn stops the event listener and the backend watcher. */
export async function watchDesignFile(path: string, cb: () => void): Promise<UnlistenFn> {
  await invoke("design_watch", { path });
  const un = await listen<string>("design-changed", (e) => {
    if (e.payload === path) cb();
  });
  return async () => {
    un();
    await invoke("design_unwatch").catch(() => {});
  };
}
