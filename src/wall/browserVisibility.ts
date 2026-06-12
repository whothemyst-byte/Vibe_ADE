import { useEffect } from "react";
import { create } from "zustand";

/**
 * The native webview always paints above the DOM, so overlays that must
 * appear on top (settings modal, menus) register as blockers; the browser
 * hides itself while any are active.
 */
export const useBrowserBlockers = create<{ count: number }>(() => ({ count: 0 }));

export function useBlocksBrowser(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    useBrowserBlockers.setState((s) => ({ count: s.count + 1 }));
    return () => useBrowserBlockers.setState((s) => ({ count: s.count - 1 }));
  }, [active]);
}
