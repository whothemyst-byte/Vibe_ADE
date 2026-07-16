import { useCardStore, type MusicCard } from "./cardStore";
import { CELL } from "./gridLayout";
import { removeCardWithFade } from "./removeCard";
import { STATIONS, findStation, nextStation, type Station } from "./stations";

export const MUSIC_ID = "wall-music";

export function musicCard(): MusicCard | undefined {
  return useCardStore.getState().cards.find((c): c is MusicCard => c.kind === "music");
}

const tune = (s: Station) =>
  useCardStore.getState().update(MUSIC_ID, { stationId: s.id, url: s.url });

/** Opens the music card (the grid re-flows) or retunes the open one. */
export function openMusic(phrase?: string): string {
  const station = (phrase ? findStation(phrase) : undefined) ?? STATIONS[0];
  if (musicCard()) {
    tune(station);
    return `Tuned to ${station.name} (${station.mood}).`;
  }
  useCardStore.getState().add({
    kind: "music",
    id: MUSIC_ID,
    stationId: station.id,
    url: station.url,
    x: 0, y: 0, w: CELL.w, h: CELL.h, // placeholder; the grid layout positions it
  });
  return `Opened the music player on ${station.name} (${station.mood}).`;
}

/** Next station on the dial, or a named/mood-matched one. */
export function changeStation(phrase?: string): string {
  const c = musicCard();
  if (!c) return "Error: the music player is not open.";
  const station = phrase?.trim() ? findStation(phrase) : nextStation(c.stationId);
  if (!station) {
    return `Error: no station matches "${phrase}". Stations: ${STATIONS.map((s) => `${s.name} (${s.mood})`).join(", ")}.`;
  }
  tune(station);
  return `Tuned to ${station.name} (${station.mood}).`;
}

/** A pasted stream URL becomes the "custom" station. */
export function setCustomUrl(url: string): void {
  if (musicCard()) useCardStore.getState().update(MUSIC_ID, { stationId: "custom", url: url.trim() });
}

export function closeMusic(): string {
  if (!musicCard()) return "The music player is not open.";
  removeCardWithFade(MUSIC_ID);
  return "Closed the music player.";
}

/** The mounted MusicWindow's transport; null when no card is mounted. */
type Player = { play: () => void; pause: () => void };
let player: Player | null = null;
export function registerPlayer(p: Player | null): void { player = p; }

/** Voice entry point: open (or retune) the card, then start playback once the
    window has mounted and registered its transport. */
export async function playMusic(phrase?: string): Promise<string> {
  const opened = openMusic(phrase);
  for (let i = 0; i < 12 && !player; i++) await new Promise((r) => setTimeout(r, 50));
  if (!player) return `${opened} Press play to start.`;
  player.play();
  return opened.replace(/^(Opened the music player on|Tuned to)/, "Playing");
}

/** Pause without closing the card. */
export function stopMusic(): string {
  if (!musicCard()) return "The music player is not open.";
  player?.pause();
  return "Music paused.";
}
