import { useCardStore, type BrowserCard } from "./cardStore";
import { browserNavigate } from "../browser/client";
import { CELL } from "./gridLayout";

export const BROWSER_ID = "wall-browser";
export const DEFAULT_URL = "https://www.google.com";

/** URLs already auto-opened this app run — restarts never re-open or hijack. */
const seenUrls = new Set<string>();

export function browserCard(): BrowserCard | undefined {
  return useCardStore.getState().cards.find((c): c is BrowserCard => c.kind === "browser");
}

/** Opens the browser card (the grid re-flows) or navigates the existing one. */
export async function openBrowser(url?: string): Promise<string> {
  const target = url?.trim() || browserCard()?.url || DEFAULT_URL;
  const withScheme = /^https?:\/\//i.test(target) ? target : `https://${target}`;
  if (browserCard()) {
    useCardStore.getState().update(BROWSER_ID, { url: withScheme });
    await browserNavigate(withScheme);
    return `Browser navigated to ${withScheme}.`;
  }
  useCardStore.getState().add({
    kind: "browser",
    id: BROWSER_ID,
    url: withScheme,
    x: 0,
    y: 0,
    w: CELL.w,
    h: CELL.h, // placeholder; the grid layout positions it
  });
  return `Opened the browser at ${withScheme}.`;
}

/** Removes the card; BrowserWindow's unmount destroys the native webview. */
export function closeBrowser(): string {
  if (!browserCard()) return "The browser is not open.";
  useCardStore.getState().remove(BROWSER_ID);
  return "Closed the browser.";
}

/** Once-per-URL auto-open, fed by the terminal output scanner. */
export function autoOpenFromTerminal(sessionId: string, url: string): void {
  if (seenUrls.has(url)) return;
  seenUrls.add(url);
  const { cards } = useCardStore.getState();
  if (!cards.some((c) => c.id === sessionId)) return; // terminal isn't on the open wall
  if (cards.some((c) => c.kind === "browser")) return; // never hijack an open browser
  void openBrowser(url);
}

export function _resetForTests(): void {
  seenUrls.clear();
}
