import { useCardStore, type MusicCard } from "./cardStore";
import { PENDING_RECT } from "./gridLayout";
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
    ...PENDING_RECT,
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
let waiting: ((p: Player) => void)[] = [];

/** MusicWindow publishes its transport here on mount, and clears it on unmount. */
export function registerPlayer(p: Player | null): void {
  player = p;
  if (!p) return;
  const ready = waiting;
  waiting = [];
  for (const resolve of ready) resolve(p);
}

/** Failsafe only: openMusic mounts MusicWindow on the next render, so this
    fires solely if the card never mounts (nothing to wake us). */
const PLAYER_MOUNT_TIMEOUT_MS = 2000;

/** Resolves the transport as soon as MusicWindow registers it, or null if the
    card never mounted. Callers must not race a render — waiting on the
    registration is what makes "play music" deterministic. */
function whenPlayerReady(): Promise<Player | null> {
  if (player) return Promise.resolve(player);
  return new Promise((resolve) => {
    const onReady = (p: Player) => { clearTimeout(timer); resolve(p); };
    const timer = setTimeout(() => {
      waiting = waiting.filter((w) => w !== onReady);
      resolve(null);
    }, PLAYER_MOUNT_TIMEOUT_MS);
    waiting.push(onReady);
  });
}

/** Voice entry point: open (or retune) the card, then start playback once the
    window has mounted and registered its transport. */
export async function playMusic(phrase?: string): Promise<string> {
  const opened = openMusic(phrase);
  const ready = await whenPlayerReady();
  if (!ready) return `${opened} Press play to start.`;
  ready.play();
  return opened.replace(/^(Opened the music player on|Tuned to)/, "Playing");
}

/** Pause without closing the card. */
export function stopMusic(): string {
  if (!musicCard()) return "The music player is not open.";
  player?.pause();
  return "Music paused.";
}
