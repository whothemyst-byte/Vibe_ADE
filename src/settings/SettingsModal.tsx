import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "./settingsStore";
import { usePresetStore } from "../wall/presetStore";
import { presetTierColor } from "../wall/presetTier";
import type { Preset } from "../wall/presets";
import { importBackground, pickBackgroundFile, savePresets } from "../store/persistence";
import type { Background } from "../store/types";
import { CloseIcon, EllipseIcon, GearIcon, ImageIcon, PlusIcon, RectangleIcon, SelectIcon } from "../wall/icons";

type Section = "agents" | "terminal" | "canvas" | "about";

const SECTIONS: { key: Section; label: string; icon: () => React.ReactElement }[] = [
  { key: "agents", label: "Agents", icon: SelectIcon },
  { key: "terminal", label: "Terminal", icon: RectangleIcon },
  { key: "canvas", label: "Canvas", icon: ImageIcon },
  { key: "about", label: "About", icon: EllipseIcon },
];

const extOf = (p: string) => p.split(".").pop()?.toLowerCase() ?? "bin";

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

function CanvasPane({ background, onChangeBackground }: {
  background: Background;
  onChangeBackground: (bg: Background) => void;
}) {
  const settings = useSettingsStore((s) => s.settings);
  const save = useSettingsStore((s) => s.save);
  return (
    <>
      <h2 className="set-title">Canvas</h2>
      <div className="set-group">
        <span className="set-label">This wall’s background</span>
        <BackgroundPicker value={background} onChange={onChangeBackground} />
      </div>
      <div className="set-group">
        <span className="set-label">Default for new walls</span>
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
        <strong>Vibe Walls</strong> v0.1.0 — an infinite canvas for commanding a wall of
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
          {section === "canvas" && <CanvasPane background={background} onChangeBackground={onChangeBackground} />}
          {section === "about" && <AboutPane />}
        </section>
      </div>
    </div>
  );
}
