import { useCardStore, type BrowserCard } from "./cardStore";
import { browserNavigate, browserSetVisible } from "../browser/client";
import { PENDING_RECT } from "./gridLayout";
import { removeCardWithFade } from "./removeCard";

export const BROWSER_ID = "wall-browser";
export const DEFAULT_URL = "https://www.google.com";

/** URLs already auto-opened this app run — restarts never re-open or hijack. */
const seenUrls = new Set<string>();

export function browserCard(): BrowserCard | undefined {
  return useCardStore.getState().cards.find((c): c is BrowserCard => c.kind === "browser");
}

/**
 * Omnibox semantics: explicit schemes pass through, host-like input
 * (a dot, localhost, or an IP) gets https://, anything else becomes a
 * Google search — typing "google" should search, not resolve as a host.
 */
export function toNavigableUrl(input: string): string {
  const t = input.trim();
  if (/^https?:\/\//i.test(t)) return t;
  const hostLike = !/\s/.test(t) && (/\./.test(t) || /^(localhost|\[::1\])(:\d+)?(\/|$)/i.test(t));
  if (hostLike) return `https://${t}`;
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`;
}

/** Opens the browser card (the grid re-flows) or navigates the existing one. */
export async function openBrowser(url?: string): Promise<string> {
  const target = url?.trim() || browserCard()?.url || DEFAULT_URL;
  const withScheme = toNavigableUrl(target);
  if (browserCard()) {
    useCardStore.getState().update(BROWSER_ID, { url: withScheme });
    await browserNavigate(withScheme);
    return `Browser navigated to ${withScheme}.`;
  }
  useCardStore.getState().add({
    kind: "browser",
    id: BROWSER_ID,
    url: withScheme,
    ...PENDING_RECT,
  });
  return `Opened the browser at ${withScheme}.`;
}

/** Removes the card; BrowserWindow's unmount destroys the native webview. */
export function closeBrowser(): string {
  if (!browserCard()) return "The browser is not open.";
  // The native webview can't fade — hide it at once; the chrome fades out.
  void browserSetVisible(false).catch(() => {});
  removeCardWithFade(BROWSER_ID);
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
