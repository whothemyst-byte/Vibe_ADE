import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCardStore } from "./cardStore";
import { STATIONS } from "./stations";
import { MUSIC_ID, changeStation, closeMusic, musicCard, openMusic, playMusic, registerPlayer, setCustomUrl, stopMusic } from "./musicActions";

beforeEach(() => {
  useCardStore.setState({ cards: [], anchor: null, maximizedId: null });
});

describe("openMusic", () => {
  it("opens one music card on the first station by default", () => {
    openMusic();
    const c = musicCard();
    expect(c?.id).toBe(MUSIC_ID);
    expect(c?.stationId).toBe(STATIONS[0].id);
    expect(c?.url).toBe(STATIONS[0].url);
    openMusic(); // idempotent: still exactly one card
    expect(useCardStore.getState().cards.filter((x) => x.kind === "music")).toHaveLength(1);
  });

  it("matches a requested mood/name", () => {
    openMusic(STATIONS[1].mood);
    expect(musicCard()?.stationId).toBe(STATIONS[1].id);
  });

  it("retunes an open card instead of erroring", () => {
    openMusic();
    openMusic(STATIONS[1].name);
    expect(musicCard()?.stationId).toBe(STATIONS[1].id);
  });
});

describe("changeStation", () => {
  it("cycles to the next station when no phrase is given", () => {
    openMusic();
    changeStation();
    expect(musicCard()?.stationId).toBe(STATIONS[1].id);
  });

  it("errors when the music card is closed", () => {
    expect(changeStation()).toMatch(/not open/i);
  });
});

describe("setCustomUrl / closeMusic", () => {
  it("marks pasted URLs as the custom station", () => {
    openMusic();
    setCustomUrl("https://example.com/stream");
    expect(musicCard()?.stationId).toBe("custom");
    expect(musicCard()?.url).toBe("https://example.com/stream");
  });

  it("closeMusic removes the card", () => {
    openMusic();
    closeMusic();
    expect(musicCard()).toBeUndefined();
  });
});

describe("playMusic / stopMusic", () => {
  it("opens the card and starts the registered player", async () => {
    let played = 0;
    registerPlayer({ play: () => { played++; }, pause: () => {} });
    const msg = await playMusic();
    expect(musicCard()).toBeDefined();
    expect(played).toBe(1);
    expect(msg).toMatch(/playing/i);
    registerPlayer(null);
  });

  it("starts playback when the player registers after the call", async () => {
    registerPlayer(null);
    let played = 0;
    const pending = playMusic();
    // MusicWindow mounts a render later; registering must wake the waiter.
    registerPlayer({ play: () => { played++; }, pause: () => {} });
    expect(await pending).toMatch(/playing/i);
    expect(played).toBe(1);
    registerPlayer(null);
  });

  it("still opens the card when no player ever registers", async () => {
    registerPlayer(null);
    vi.useFakeTimers();
    try {
      const pending = playMusic("lofi");
      await vi.advanceTimersByTimeAsync(2000);
      expect(await pending).toMatch(/press play/i);
      expect(musicCard()).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stopMusic pauses without closing", () => {
    let paused = 0;
    registerPlayer({ play: () => {}, pause: () => { paused++; } });
    openMusic();
    expect(stopMusic()).toMatch(/paused/i);
    expect(paused).toBe(1);
    expect(musicCard()).toBeDefined();
    registerPlayer(null);
  });
});
