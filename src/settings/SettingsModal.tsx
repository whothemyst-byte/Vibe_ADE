import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "./settingsStore";
import { usePresetStore } from "../wall/presetStore";
import { presetTierColor } from "../wall/presetTier";
import type { Preset } from "../wall/presets";
import { importBackground, pickBackgroundFile, savePresets } from "../store/persistence";
import type { Background } from "../store/types";
import { CloseIcon, EllipseIcon, GearIcon, ImageIcon, PaletteIcon, PlusIcon, RectangleIcon, SelectIcon } from "../wall/icons";
import { THEMES, isThemeActive } from "./themes";

type Section = "agents" | "terminal" | "themes" | "canvas" | "vibe" | "about";

const SECTIONS: { key: Section; label: string; icon: () => React.ReactElement }[] = [
  { key: "agents", label: "Agents", icon: SelectIcon },
  { key: "terminal", label: "Terminal", icon: RectangleIcon },
  { key: "themes", label: "Themes", icon: PaletteIcon },
  { key: "canvas", label: "Canvas", icon: ImageIcon },
  { key: "vibe", label: "Vibe", icon: EllipseIcon },
  { key: "about", label: "About", icon: EllipseIcon },
];

const extOf = (p: string) => p.split(".").pop()?.toLowerCase() ?? "bin";

/** Rough relative luminance of a #rrggbb color, for picking label contrast. */
const isLightColor = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return false;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
};

/** Shared color / image / video background picker row. */
function BackgroundPicker({ value, onChange }: { value: Background; onChange: (bg: Background) => void }) {
  const pick = async (kind: "image" | "video") => {
    const src = await pickBackgroundFile();
    if (!src) return;
    const dest = await importBackground(src, `${crypto.randomUUID()}.${extOf(src)}`);
    onChange({ kind, path: dest });
  };
  return (
    <div className="set-bg-picker">
      <label className="set-bg-swatch" title="Solid color">
        <input
          type="color"
          value={value.kind === "color" ? value.color : "#12110f"}
          onChange={(e) => onChange({ kind: "color", color: e.target.value })}
        />
        Color
      </label>
      <button className="set-btn" onClick={() => void pick("image")}>Image…</button>
      <button className="set-btn" onClick={() => void pick("video")}>Video…</button>
      <span className="set-hint">
        {value.kind === "color" ? value.color : `${value.kind}: …${value.path.slice(-24)}`}
      </span>
    </div>
  );
}

function AgentsPane() {
  const stored = usePresetStore((s) => s.presets);
  const [presets, setPresets] = useState<Preset[]>(stored);
  const timer = useRef<number | null>(null);

  const persist = (next: Preset[]) => {
    setPresets(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void savePresets(next).then(() => usePresetStore.getState().load());
    }, 400);
  };
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const patch = (id: string, p: Partial<Preset>) =>
    persist(presets.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <>
      <h2 className="set-title">Agents</h2>
      <p className="set-sub">Launch presets shown in the “+ Terminal” menu. The command is typed into the shell after it opens; leave it empty for a plain shell.</p>
      {presets.map((p) => (
        <div className="set-row set-preset" key={p.id}>
          <span className="terminal-status-dot" style={{ background: presetTierColor(p.id) }} />
          <input
            className="set-input"
            value={p.label}
            placeholder="Label"
            onChange={(e) => patch(p.id, { label: e.target.value })}
          />
          <input
            className="set-input set-mono"
            value={p.command ?? ""}
            placeholder="plain shell"
            onChange={(e) => patch(p.id, { command: e.target.value || undefined })}
          />
          {p.id !== "plain" && (
            <button
              className="set-icon-btn"
              title="Delete preset"
              onClick={() => persist(presets.filter((x) => x.id !== p.id))}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      ))}
      <button
        className="set-btn set-add"
        onClick={() => persist([...presets, { id: crypto.randomUUID(), label: "New agent", icon: "▷", command: "" }])}
      >
        <PlusIcon /> Add preset
      </button>
    </>
  );
}

function TerminalPane() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const t = settings.terminal;
  const setTerm = (patch: Partial<typeof t>) =>
    save({ ...settings, terminal: { ...t, ...patch } });

  return (
    <>
      <h2 className="set-title">Terminal</h2>
      <p className="set-sub">Font size applies to running terminals immediately; shell and scrollback apply to newly launched ones.</p>
      <div className="set-row">
        <span className="set-label">Font size</span>
        <input
          className="set-input set-num"
          type="number" min={10} max={20}
          value={t.fontSize}
          onChange={(e) => setTerm({ fontSize: Math.min(20, Math.max(10, Number(e.target.value) || 13)) })}
        />
      </div>
      <div className="set-row">
        <span className="set-label">Scrollback lines</span>
        <input
          className="set-input set-num"
          type="number" min={500} max={50000} step={500}
          value={t.scrollback}
          onChange={(e) => setTerm({ scrollback: Math.min(50000, Math.max(500, Number(e.target.value) || 5000)) })}
        />
      </div>
      <div className="set-row">
        <span className="set-label">Shell</span>
        <input
          className="set-input set-mono"
          value={t.shell}
          onChange={(e) => setTerm({ shell: e.target.value || "powershell.exe" })}
        />
      </div>
    </>
  );
}

function VibePane() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  const v = settings.vibe;
  const setVibe = (patch: Partial<typeof v>) =>
    save({ ...settings, vibe: { ...v, ...patch } });

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  return (
    <>
      <h2 className="set-title">Vibe</h2>
      <p className="set-sub">
        Voice companion. Works out of the box — speech recognition and the brain run
        through our hosted gateway with a free daily allowance. Paste your own free
        Groq API key (console.groq.com) for unlimited usage. The "Vibe" wake word
        runs fully offline. Models: GPT-OSS 120B (brain) + Whisper large-v3-turbo
        (ears).
      </p>
      <div className="set-row">
        <span className="set-label">Enable Vibe</span>
        <input
          type="checkbox"
          checked={v.enabled}
          onChange={(e) => setVibe({ enabled: e.target.checked })}
        />
      </div>
      <div className="set-row">
        <span className="set-label">Groq API key (optional)</span>
        <input
          className="set-input set-mono"
          type="password"
          value={v.groqApiKey}
          onChange={(e) => setVibe({ groqApiKey: e.target.value.trim() })}
        />
      </div>
      <div className="set-row">
        <span className="set-label">Push-to-talk hotkey</span>
        <input
          className="set-input set-mono"
          value={v.hotkey}
          onChange={(e) => setVibe({ hotkey: e.target.value || "Ctrl+Shift+V" })}
        />
      </div>
      <div className="set-row">
        <span className="set-label">Voice</span>
        <select
          className="set-input"
          value={v.voice}
          onChange={(e) => setVibe({ voice: e.target.value })}
        >
          <option value="">System default</option>
          {voices.map((voice) => (
            <option key={voice.name} value={voice.name}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
        <button
          className="set-btn"
          onClick={() => {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance("Hi! I'm Vibe, your voice companion.");
            const chosen = voices.find((x) => x.name === v.voice);
            if (chosen) u.voice = chosen;
            window.speechSynthesis.speak(u);
          }}
        >
          Test
        </button>
      </div>
    </>
  );
}

function ThemesPane({ background, onChangeBackground }: {
  background: Background;
  onChangeBackground: (bg: Background) => void;
}) {
  return (
    <>
      <h2 className="set-title">Themes</h2>
      <p className="set-sub">Pick a theme for this space — or craft your own below.</p>
      <div className="theme-grid">
        {THEMES.map((t) => {
          const active = isThemeActive(background, t);
          const light = t.background.kind === "color" && isLightColor(t.background.color);
          return (
            <button
              key={t.id}
              className={`theme-card${active ? " active" : ""}`}
              onClick={() => onChangeBackground(t.background)}
            >
              <span
                className="theme-preview"
                style={{ background: t.background.kind === "color" ? t.background.color : undefined }}
              >
                {t.palette.map((c) => (
                  <span key={c} className="theme-dot" style={{ background: c }} />
                ))}
              </span>
              <span
                className={`theme-meta${light ? " on-light" : ""}`}
                style={{ background: t.background.kind === "color" ? t.background.color : undefined }}
              >
                <span className="theme-name">{t.name}</span>
                <span className="theme-tagline">{t.tagline}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="set-group">
        <span className="set-label">Create your own</span>
        <BackgroundPicker value={background} onChange={onChangeBackground} />
        <span className="set-hint">A color, image, or video of your choice becomes this space’s theme.</span>
      </div>
    </>
  );
}

function CanvasPane() {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  return (
    <>
      <h2 className="set-title">Canvas</h2>
      <p className="set-sub">Space-level canvas behavior. Theme the current space from the Themes tab.</p>
      <div className="set-group">
        <span className="set-label">Default background for new spaces</span>
        <BackgroundPicker
          value={settings.canvas.defaultBackground}
          onChange={(bg) => save({ ...settings, canvas: { ...settings.canvas, defaultBackground: bg } })}
        />
      </div>
    </>
  );
}

function AboutPane() {
  return (
    <>
      <h2 className="set-title">About</h2>
      <p className="set-sub">
        <strong>Vibe Space</strong> v1.0.0 — an infinite canvas for commanding a constellation of
        coding agents. Draw, plan, and run Claude Code, Codex, and friends side by side.
      </p>
      <p className="set-hint">Quansynd · built with Tauri, Excalidraw, and xterm.js</p>
    </>
  );
}

export function SettingsModal({ background, onChangeBackground, onClose }: {
  background: Background;
  onChangeBackground: (bg: Background) => void;
  onClose: () => void;
}) {
  const [section, setSection] = useState<Section>("agents");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="settings-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-modal" role="dialog" aria-label="Settings">
        <aside className="settings-side">
          <span className="settings-head"><GearIcon /> Settings</span>
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`settings-item${section === key ? " active" : ""}`}
              onClick={() => setSection(key)}
            >
              <Icon /> {label}
            </button>
          ))}
        </aside>
        <section className="settings-pane">
          <button className="settings-close" title="Close" onClick={onClose}><CloseIcon /></button>
          {section === "agents" && <AgentsPane />}
          {section === "terminal" && <TerminalPane />}
          {section === "themes" && <ThemesPane background={background} onChangeBackground={onChangeBackground} />}
          {section === "canvas" && <CanvasPane />}
          {section === "vibe" && <VibePane />}
          {section === "about" && <AboutPane />}
        </section>
      </div>
    </div>
  );
}
