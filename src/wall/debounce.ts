/**
 * Trailing debounce: `bump()` (re)arms a timer; `fn` runs once, `delayMs` after
 * the last bump. Used to refit terminals only after their card's size has
 * settled — refitting per-frame during the 300ms grid glide rewraps xterm's
 * buffer and the ConPTY at every transient width, which permanently garbles
 * the text (both reflows are lossy).
 */
export function trailingDebounce(fn: () => void, delayMs: number): { bump: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    bump() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; fn(); }, delayMs);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
