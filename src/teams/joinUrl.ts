/** Extract the org join code from a vibespace://join/<code> or
 *  https://…/join/<code> link (also supports ?code=). Returns null if absent. */
export function parseJoinUrl(url: string): string | null {
  const path = url.match(/(?:vibespace:\/\/join\/|\/join\/)([^/?#]+)/i);
  if (path && path[1]) return decodeURIComponent(path[1]);
  const query = url.match(/[?&]code=([^&#]+)/i);
  if (query && query[1]) return decodeURIComponent(query[1]);
  return null;
}
