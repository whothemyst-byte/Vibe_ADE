/** Pure element-mutation helpers. No Excalidraw/React imports so tests run
 *  in vitest's node env; Excalidraw elements satisfy `El` structurally. */

export type El = {
  id: string;
  version: number;
  versionNonce: number;
  updated: number;
  opacity: number;
  locked?: boolean;
  customData?: Record<string, unknown>;
} & Record<string, unknown>;

export type Patch = Record<string, unknown>;

/** Excalidraw's reconciliation drops edits whose version didn't advance;
 *  every patched element must be bumped or the change can be silently lost. */
export function bumpElement<T extends El>(el: T): T {
  return {
    ...el,
    version: el.version + 1,
    versionNonce: Math.floor(Math.random() * 0x7fffffff),
    updated: Date.now(),
  };
}

/** Apply per-id patches, bumping only patched elements. Untouched elements
 *  keep their identity so Excalidraw treats them as unchanged. */
export function applyPatches(elements: readonly El[], patches: Record<string, Patch>): El[] {
  return elements.map((el) => {
    const p = patches[el.id];
    return p ? bumpElement({ ...el, ...p }) : el;
  });
}

export function isHidden(el: El): boolean {
  return el.customData?.vsHidden === true;
}

/** Hidden = invisible AND unclickable. Prior state rides in customData so it
 *  survives the file round-trip (normalize.ts preserves customData). */
export function hidePatch(el: El): Patch {
  return {
    opacity: 0,
    locked: true,
    customData: {
      ...el.customData,
      vsHidden: true,
      prevOpacity: el.opacity,
      prevLocked: el.locked ?? false,
    },
  };
}

export function unhidePatch(el: El): Patch {
  const cd: Record<string, unknown> = { ...el.customData };
  const opacity = typeof cd.prevOpacity === "number" ? cd.prevOpacity : 100;
  const locked = cd.prevLocked === true;
  delete cd.vsHidden;
  delete cd.prevOpacity;
  delete cd.prevLocked;
  return { opacity, locked, customData: cd };
}
