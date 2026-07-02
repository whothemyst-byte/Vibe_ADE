import { useRef, useSyncExternalStore } from "react";
import type { DesignSnapshot, DesignStore } from "./designStore";

/** Subscribe to a derived slice of the design store. `isEqual` keeps the
 *  snapshot referentially stable so React skips re-renders for unchanged
 *  slices. Pass module-level selector/equality fns (stable identities). */
export function useDesignSelector<T>(
  store: DesignStore,
  selector: (s: DesignSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const cache = useRef<{ has: boolean; value: T }>({ has: false, value: undefined as T });
  const getSnapshot = () => {
    const next = selector(store.get());
    if (cache.current.has && isEqual(cache.current.value, next)) return cache.current.value;
    cache.current = { has: true, value: next };
    return next;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot);
}
