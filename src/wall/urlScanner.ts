/** CSI (colors, cursor) and OSC (titles, hyperlinks) escape sequences. */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g;
const URL_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/[^\s"'<>()[\]]*)?/gi;
/** Tail kept between chunks so a URL split across PTY reads still matches. */
const TAIL = 512;

export function normalizeLocalUrl(raw: string): string {
  return raw.replace(/[.,;:!?'"]+$/, "").replace("0.0.0.0", "localhost");
}

/**
 * Feeds decoded terminal output chunks; calls `onUrl` once per distinct
 * localhost URL seen in this scanner's lifetime (one scanner per session).
 */
export function createUrlScanner(onUrl: (url: string) => void): (chunk: string) => void {
  let tail = "";
  const seen = new Set<string>();
  return (chunk) => {
    const text = tail + chunk.replace(ANSI_RE, "");
    for (const m of text.matchAll(URL_RE)) {
      const url = normalizeLocalUrl(m[0]);
      if (!seen.has(url)) {
        seen.add(url);
        onUrl(url);
      }
    }
    tail = text.slice(-TAIL);
  };
}
