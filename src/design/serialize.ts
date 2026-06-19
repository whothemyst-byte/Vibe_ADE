import type { DesignDoc } from "./schema";

/** Pretty, stable-ordered JSON with a trailing newline so agent diffs stay clean. */
export function serializeDesign(doc: DesignDoc): string {
  const ordered = {
    version: doc.version,
    frames: doc.frames,
    components: doc.components,
    tokens: doc.tokens,
  };
  return JSON.stringify(ordered, null, 2) + "\n";
}
