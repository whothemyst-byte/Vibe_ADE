import type { Background } from "../store/types";

export type CloudBg =
  | { kind: "color"; color: string }
  | { kind: "image"; key: string }
  | { kind: "video"; key: string };

export function extOf(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : "bin";
}

/** Local Background -> cloud descriptor (+ optional asset to upload). */
export function toCloudBackground(
  bg: Background,
  keyBase: string,
): { cloud: CloudBg; upload: { key: string; path: string } | null } {
  if (bg.kind === "color") return { cloud: { kind: "color", color: bg.color }, upload: null };
  const path = bg.path ?? "";
  const key = `${keyBase}/bg.${extOf(path)}`;
  return { cloud: { kind: bg.kind, key }, upload: path ? { key, path } : null };
}

/** Cloud descriptor (+ resolved signed url) -> Background for rendering. */
export function fromCloudBackground(cloud: CloudBg, signedUrl: string | null): Background {
  if (cloud.kind === "color") return { kind: "color", color: cloud.color };
  return { kind: cloud.kind, url: signedUrl ?? undefined };
}
