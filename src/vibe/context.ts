import { useEffect, useRef } from "react";

/** Live app-state snapshot, shown to the LLM each turn. Keep it one short line. */
type Snapshot = () => string;

const providers = new Map<string, Snapshot>();

/** Registers a snapshot provider; returns a cleanup that removes it (only if still current). */
export function registerVibeContext(name: string, snapshot: Snapshot): () => void {
  providers.set(name, snapshot);
  return () => {
    if (providers.get(name) === snapshot) providers.delete(name);
  };
}

/** One "- name: snapshot" line per provider; "" when none. Never throws. */
export function getContextBlock(): string {
  const lines: string[] = [];
  for (const [name, snap] of providers) {
    try {
      const text = snap().trim();
      if (text) lines.push(`- ${name}: ${text}`);
    } catch {
      /* a broken snapshot must never break the agent */
    }
  }
  return lines.join("\n");
}

export function _clearContextForTests(): void {
  providers.clear();
}

/**
 * Registers a context provider for the lifetime of the component. Same
 * fresh-ref + StrictMode-safe cleanup pattern as useVibeCommand.
 */
export function useVibeContext(name: string, snapshot: Snapshot): void {
  const ref = useRef(snapshot);
  ref.current = snapshot;
  useEffect(() => {
    return registerVibeContext(name, () => ref.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
}
