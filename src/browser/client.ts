import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const NAV_EVENT = "browser://nav";

export type BrowserRect = { x: number; y: number; w: number; h: number };

export function browserOpen(url: string, rect: BrowserRect, zoom: number): Promise<void> {
  return invoke("browser_open", { url, ...rect, zoom });
}
export function browserNavigate(url: string): Promise<void> {
  return invoke("browser_navigate", { url });
}
export function browserBack(): Promise<void> {
  return invoke("browser_back");
}
export function browserReload(): Promise<void> {
  return invoke("browser_reload");
}
export function browserSetRect(rect: BrowserRect, zoom: number): Promise<void> {
  return invoke("browser_set_rect", { ...rect, zoom });
}
export function browserSetVisible(visible: boolean): Promise<void> {
  return invoke("browser_set_visible", { visible });
}
export function browserClose(): Promise<void> {
  return invoke("browser_close");
}
export function browserRead(): Promise<{ title: string; text: string }> {
  return invoke("browser_read");
}
export function browserStatus(): Promise<{ title: string; canGoBack: boolean }> {
  return invoke("browser_status");
}
export function onBrowserNav(cb: (url: string) => void): Promise<UnlistenFn> {
  return listen<{ url: string }>(NAV_EVENT, (e) => cb(e.payload.url));
}
