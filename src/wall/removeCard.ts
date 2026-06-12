import { useCardStore } from "./cardStore";

/** Matches the .card-closing opacity transition in App.css. */
const FADE_MS = 160;

/**
 * Fades a card's DOM node out, then removes it from the store (unmounting
 * runs the card's own teardown). Falls back to immediate removal when the
 * node isn't rendered (tests, walls that aren't open).
 */
export function removeCardWithFade(id: string, beforeRemove?: () => void): void {
  const el =
    typeof document !== "undefined" ? document.querySelector(`[data-card-id="${id}"]`) : null;
  if (!el) {
    beforeRemove?.();
    useCardStore.getState().remove(id);
    return;
  }
  el.classList.add("card-closing");
  window.setTimeout(() => {
    beforeRemove?.();
    useCardStore.getState().remove(id);
  }, FADE_MS);
}
