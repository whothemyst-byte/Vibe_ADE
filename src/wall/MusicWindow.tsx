import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { HEADER_H, type Camera } from "./transform";
import { useCardStore, type MusicCard } from "./cardStore";
import { CloseIcon, MusicIcon, PauseIcon, PlayIcon, VolumeIcon } from "./icons";
import { nearestSlotIndex } from "./gridLayout";
import { changeStation, closeMusic, registerPlayer, setCustomUrl } from "./musicActions";
import { STATIONS } from "./stations";
import { BAR_COUNT, barsFromBins, isSilent, simulateBars } from "./eq";
import { youtubeEmbedUrl } from "./youtube";

/** CORS-opaque streams keep the analyser at zero forever; after this long of
    zeros while playing, the EQ switches to the simulated bars. */
const SILENCE_TIMEOUT_MS = 2000;

function MusicWindowInner({ card, cameraRef }: { card: MusicCard; cameraRef: RefObject<Camera> }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [urlDraft, setUrlDraft] = useState("");
  const station = STATIONS.find((s) => s.id === card.stationId);
  // A known station streams from the current dial's URL, not the card's saved
  // copy — walls persisted with a since-fixed station URL heal on load.
  const src = station ? station.url : card.url;
  // A pasted YouTube link can't feed <audio>; it plays in an embedded player
  // instead, driven over the iframe API (enablejsapi postMessage commands).
  const embed = station ? null : youtubeEmbedUrl(card.url);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const ytCmd = (func: string, args: unknown[] = []) =>
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");

  // One audio element for the card's lifetime; station changes just swap src.
  useEffect(() => {
    const el = new Audio();
    el.crossOrigin = "anonymous"; // lets CORS-friendly streams feed the analyser
    el.preload = "none";
    audioRef.current = el;
    return () => { el.pause(); el.src = ""; audioRef.current = null; };
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (embed) { el.pause(); el.removeAttribute("src"); setPlaying(true); return; } // iframe autoplays
    const wasPlaying = playing;
    el.src = src;
    if (wasPlaying) void el.play().catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    if (embed) { ytCmd("setVolume", [Math.round(volume * 100)]); return; }
    if (audioRef.current) audioRef.current.volume = volume;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, embed]);

  const start = () => {
    if (embed) { ytCmd("playVideo"); setPlaying(true); return; }
    const el = audioRef.current;
    if (!el || playing) return;
    // AudioContext needs a user gesture; build the graph lazily on first play.
    if (!analyserRef.current) {
      try {
        const ctx = new AudioContext();
        const src = ctx.createMediaElementSource(el);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        analyserRef.current = analyser;
      } catch { /* graph failed (rare) — simulated bars cover it */ }
    }
    void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };
  const stop = () => {
    if (embed) ytCmd("pauseVideo");
    audioRef.current?.pause();
    setPlaying(false);
  };
  const toggle = () => (playing ? stop() : start());

  // Voice transport: re-register every render so the closures see current state.
  useEffect(() => {
    registerPlayer({ play: start, pause: stop });
    return () => registerPlayer(null);
  });

  // EQ loop: real bins while they carry signal, simulated after a silent spell.
  useEffect(() => {
    if (!playing || embed) return;
    let frame = 0;
    let silentSince: number | null = null;
    let bars = new Array(BAR_COUNT).fill(0.1);
    const bins = new Uint8Array(analyserRef.current?.frequencyBinCount ?? 128);
    const draw = (t: number) => {
      const analyser = analyserRef.current;
      let simulated = analyser === null;
      if (analyser) {
        analyser.getByteFrequencyData(bins);
        if (isSilent(bins)) {
          silentSince ??= t;
          simulated = t - silentSince > SILENCE_TIMEOUT_MS;
        } else silentSince = null;
      }
      bars = simulated ? simulateBars(bars, t) : barsFromBins(bins);
      const canvas = canvasRef.current;
      const g = canvas?.getContext("2d");
      if (canvas && g) {
        g.clearRect(0, 0, canvas.width, canvas.height);
        g.fillStyle = getComputedStyle(canvas).color; // canvas color: var(--accent)
        const bw = canvas.width / BAR_COUNT;
        bars.forEach((b, i) => {
          const h = Math.max(2, b * canvas.height);
          g.fillRect(i * bw + 2, canvas.height - h, bw - 4, h);
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [playing, embed]);

  const close = (e: ReactPointerEvent) => { e.stopPropagation(); closeMusic(); };

  // Same drag-to-reorder gesture as FileViewerWindow.
  const beginDrag = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    e.stopPropagation();
    if (wrapRef.current) wrapRef.current.style.transition = "none";
    const z = cameraRef.current.z;
    const sx = e.clientX, sy = e.clientY;
    const ox = card.x, oy = card.y;
    let nx = ox, ny = oy;
    const onMove = (ev: PointerEvent) => {
      nx = ox + (ev.clientX - sx) / z;
      ny = oy + (ev.clientY - sy) / z;
      const el = wrapRef.current;
      if (el) el.style.transform = `translate(${nx}px, ${ny}px)`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const el = wrapRef.current;
      if (el) {
        el.style.transition = "";
        el.style.transform = `translate(${card.x}px, ${card.y}px)`;
      }
      const { cards, moveToIndex } = useCardStore.getState();
      const slot = nearestSlotIndex(
        { x: nx + card.w / 2, y: ny + card.h / 2 },
        cards.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h }))
      );
      const from = cards.findIndex((c) => c.id === card.id);
      if (slot !== -1 && slot !== from) moveToIndex(card.id, slot);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      ref={wrapRef}
      className="terminal-window music-window"
      data-card-id={card.id}
      style={{ transform: `translate(${card.x}px, ${card.y}px)`, width: card.w, height: card.h, "--tier": "var(--accent)" } as CSSProperties}
    >
      <div className="terminal-header" style={{ height: HEADER_H }} onPointerDown={beginDrag}>
        <span className="terminal-status-dot" />
        <span className="terminal-glyph"><MusicIcon /></span>
        <span className="terminal-title">
          <span className="terminal-name">Music</span> &middot; {station ? station.name : embed ? "YouTube" : "Custom stream"}
        </span>
        <button className="terminal-close" title="Close" onPointerDown={close}><CloseIcon /></button>
      </div>
      <div className="terminal-body music-body" style={{ top: HEADER_H, bottom: 0 }}>
        <div className="music-top">
          <button className="music-play" title={playing ? "Pause" : "Play"} onPointerDown={(e) => { e.stopPropagation(); toggle(); }}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <div className="music-meta">
            <div className="music-track">{station ? station.name : embed ? "YouTube" : "Custom stream"}</div>
            <div className="music-artist">{station ? station.mood : card.url}</div>
          </div>
        </div>
        {embed ? (
          <iframe
            ref={iframeRef}
            className="music-panel music-yt"
            src={embed}
            allow="autoplay; encrypted-media"
            title="YouTube player"
          />
        ) : (
          <div className="music-panel"><canvas ref={canvasRef} className="music-eq" width={640} height={150} /></div>
        )}
        <div className="music-chips">
          {STATIONS.map((s) => (
            <button
              key={s.id}
              className={`music-chip${s.id === card.stationId ? " active" : ""}`}
              onPointerDown={(e) => { e.stopPropagation(); changeStation(s.name); }}
            >
              {s.mood}
            </button>
          ))}
        </div>
        <form
          className="music-custom"
          onSubmit={(e) => { e.preventDefault(); if (urlDraft.trim()) { setCustomUrl(urlDraft); setUrlDraft(""); } }}
        >
          <input
            className="music-url" placeholder="paste a stream or YouTube url…" value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
          />
        </form>
        <div className="music-volume-row">
          <VolumeIcon />
          <input
            className="music-volume" type="range" min={0} max={1} step={0.05} value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <span className="music-vol-num">{Math.round(volume * 100)}</span>
        </div>
        {station && <div className="music-attribution">{station.attribution}</div>}
      </div>
    </div>
  );
}

// Same shallow-compare rationale as TerminalWindow.
export const MusicWindow = memo(MusicWindowInner);
