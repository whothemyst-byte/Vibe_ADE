/** Converts a pasted YouTube page URL (watch / youtu.be / shorts / live /
    playlist / music.youtube.com) into an embeddable player URL. Returns null
    for anything else — those stay on the plain <audio> stream path. */
export function youtubeEmbedUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  if (host !== "youtube.com" && host !== "youtu.be") return null;
  const params = "autoplay=1&playsinline=1&enablejsapi=1";
  const list = u.searchParams.get("list");
  let id = "";
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? "";
  else if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
  else if (/^\/(shorts|embed|live)\//.test(u.pathname)) id = u.pathname.split("/")[2] ?? "";
  if (!/^[\w-]{6,}$/.test(id)) {
    return list ? `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(list)}&${params}` : null;
  }
  const listParam = list ? `&list=${encodeURIComponent(list)}` : "";
  return `https://www.youtube.com/embed/${id}?${params}${listParam}`;
}
