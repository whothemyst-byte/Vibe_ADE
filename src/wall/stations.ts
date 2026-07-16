/** A curated internet-radio station the music card can play. Every entry's
    broadcaster publishes public stream URLs for external players (verified
    2026-07-16: Radio Paradise's open streams/API; laut.fm's public station
    stream links). Nightride FM was considered and dropped — no explicit
    third-party-player permission found on their site. */
export type Station = {
  id: string;
  name: string;
  mood: string;
  url: string;
  /** Shown in the card UI — the deal for using the stream. */
  attribution: string;
};

export const STATIONS: Station[] = [
  { id: "rp-main", name: "Radio Paradise", mood: "eclectic", url: "https://stream.radioparadise.com/aac-128", attribution: "radioparadise.com — listener-supported" },
  { id: "rp-mellow", name: "RP Mellow", mood: "mellow focus", url: "https://stream.radioparadise.com/mellow-128", attribution: "radioparadise.com — listener-supported" },
  { id: "laut-lofi", name: "laut.fm lofi", mood: "lofi beats", url: "https://stream.laut.fm/lofi", attribution: "lofi @ laut.fm" },
  { id: "laut-ambient", name: "laut.fm ambient", mood: "ambient", url: "https://stream.laut.fm/ambient", attribution: "ambient @ laut.fm" },
];

/** The station after `currentId`, wrapping; unknown ids (custom URLs) restart the dial. */
export function nextStation(currentId: string): Station {
  const i = STATIONS.findIndex((s) => s.id === currentId);
  return STATIONS[(i + 1) % STATIONS.length];
}

/** The station before `currentId`, wrapping; unknown ids land on the last station. */
export function prevStation(currentId: string): Station {
  const i = STATIONS.findIndex((s) => s.id === currentId);
  return STATIONS[(i - 1 + STATIONS.length) % STATIONS.length];
}

/** Fuzzy match by name or mood — feeds the change_station voice command. */
export function findStation(phrase: string): Station | undefined {
  const p = phrase.trim().toLowerCase();
  if (!p) return undefined;
  return STATIONS.find(
    (s) => s.name.toLowerCase().includes(p) || p.includes(s.name.toLowerCase()) || s.mood.toLowerCase().includes(p)
  );
}
