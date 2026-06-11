import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "./settings";

describe("mergeSettings", () => {
  it("returns defaults for missing or non-object input", () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings("junk")).toEqual(DEFAULT_SETTINGS);
  });

  it("overlays a partial onto defaults", () => {
    const s = mergeSettings({ terminal: { fontSize: 16 } });
    expect(s.terminal.fontSize).toBe(16);
    expect(s.terminal.scrollback).toBe(DEFAULT_SETTINGS.terminal.scrollback);
    expect(s.terminal.shell).toBe(DEFAULT_SETTINGS.terminal.shell);
    expect(s.canvas).toEqual(DEFAULT_SETTINGS.canvas);
  });

  it("keeps a saved default background", () => {
    const s = mergeSettings({ canvas: { defaultBackground: { kind: "color", color: "#221100" } } });
    expect(s.canvas.defaultBackground).toEqual({ kind: "color", color: "#221100" });
  });

  it("ignores wrongly-typed fields and unknown keys", () => {
    const s = mergeSettings({
      terminal: { fontSize: "huge", scrollback: 9000 },
      canvas: { defaultBackground: 42 },
      voice: { enabled: true },
    });
    expect(s.terminal.fontSize).toBe(DEFAULT_SETTINGS.terminal.fontSize);
    expect(s.terminal.scrollback).toBe(9000);
    expect(s.canvas.defaultBackground).toEqual(DEFAULT_SETTINGS.canvas.defaultBackground);
    expect("voice" in s).toBe(false);
  });
});
