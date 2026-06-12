/**
 * BrowserWindow registers its reposition function here so WallView's camera
 * rAF (and anything else that moves the world) can nudge the native webview
 * without holding a React reference to the component.
 */
let syncFn: (() => void) | null = null;

export function setBrowserSyncHandler(fn: (() => void) | null): void {
  syncFn = fn;
}

/** No-op when no browser is open. */
export function syncBrowserRect(): void {
  syncFn?.();
}
