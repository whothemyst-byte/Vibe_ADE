export type SceneElement = Record<string, unknown>;

export const DEFAULT_BG = "#0e0c0a";

/** Fields Excalidraw bumps on every edit; stripped so diffs and echo-hashing
 *  are stable. Excalidraw's restoreElements regenerates them on load. */
const STRIP_FIELDS = ["version", "versionNonce", "updated", "seed"] as const;

function stripElement(el: SceneElement): SceneElement {
  const out: SceneElement = {};
  for (const k of Object.keys(el)) {
    if ((STRIP_FIELDS as readonly string[]).includes(k)) continue;
    out[k] = el[k];
  }
  return out;
}

/** Excalidraw scene -> clean, stable, pretty JSON. Element array order (the
 *  z-order) is preserved; only deleted elements are dropped. */
export function serializeScene(
  elements: readonly SceneElement[],
  viewBackgroundColor: string,
): string {
  const kept = elements
    .filter((e) => e.isDeleted !== true)
    .map(stripElement);
  const scene = { version: 1, elements: kept, appState: { viewBackgroundColor } };
  return JSON.stringify(scene, null, 2) + "\n";
}

export type ParsedScene =
  | { ok: true; elements: SceneElement[]; viewBackgroundColor: string }
  | { ok: false; error: string };

export function parseScene(text: string): ParsedScene {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid JSON" };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "scene is not an object" };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.elements)) {
    return { ok: false, error: "scene is missing an `elements` array" };
  }
  const appState = (obj.appState ?? {}) as Record<string, unknown>;
  const bg = typeof appState.viewBackgroundColor === "string"
    ? appState.viewBackgroundColor
    : DEFAULT_BG;
  return { ok: true, elements: obj.elements as SceneElement[], viewBackgroundColor: bg };
}

export function emptySceneJson(viewBackgroundColor: string = DEFAULT_BG): string {
  return serializeScene([], viewBackgroundColor);
}
