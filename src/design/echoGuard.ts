/** FNV-1a 32-bit hash, returned as hex. Stable, fast, non-crypto. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export type EchoGuard = {
  markWritten(text: string): void;
  isOwnEcho(text: string): boolean;
};

/** Tracks the hash of the card's most recent own write so the watcher event
 *  it triggers is ignored exactly once. */
export function makeEchoGuard(): EchoGuard {
  let pending: string | null = null;
  return {
    markWritten(text) { pending = hashText(text); },
    isOwnEcho(text) {
      if (pending !== null && pending === hashText(text)) {
        pending = null;
        return true;
      }
      return false;
    },
  };
}
