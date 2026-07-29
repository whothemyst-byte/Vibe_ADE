export type SceneElement = Record<string, unknown>;

/** Excalidraw's binary-file map (image data-URLs), keyed by file id. */
export type SceneFiles = Record<string, unknown>;

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

/** File ids still referenced by surviving elements. Dropping the rest keeps a
 *  deleted image's data-URL from living in the file forever. */
function referencedFileIds(elements: readonly SceneElement[]): Set<string> {
  const ids = new Set<string>();
  for (const el of elements) {
    if (typeof el.fileId === "string") ids.add(el.fileId);
  }
  return ids;
}

/** Excalidraw scene -> clean, stable, pretty JSON. Element array order (the
 *  z-order) is preserved; only deleted elements are dropped. Image payloads
 *  ride along in `files` so a design survives a reload; the key is omitted
 *  entirely when there are none, so image-free designs keep their old bytes. */
export function serializeScene(
  elements: readonly SceneElement[],
  viewBackgroundColor: string,
  files: SceneFiles = {},
): string {
  const kept = elements
    .filter((e) => e.isDeleted !== true)
    .map(stripElement);
  const referenced = referencedFileIds(kept);
  const keptFiles: SceneFiles = {};
  for (const id of Object.keys(files)) {
    if (referenced.has(id)) keptFiles[id] = files[id];
  }
  const scene = {
    version: 1,
    elements: kept,
    appState: { viewBackgroundColor },
    ...(Object.keys(keptFiles).length ? { files: keptFiles } : {}),
  };
  return JSON.stringify(scene, null, 2) + "\n";
}

export type ParsedScene =
  | { ok: true; elements: SceneElement[]; viewBackgroundColor: string; files: SceneFiles }
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
  const files = typeof obj.files === "object" && obj.files !== null && !Array.isArray(obj.files)
    ? (obj.files as SceneFiles)
    : {};
  return { ok: true, elements: obj.elements as SceneElement[], viewBackgroundColor: bg, files };
}

export function emptySceneJson(viewBackgroundColor: string = DEFAULT_BG): string {
  return serializeScene([], viewBackgroundColor);
}
