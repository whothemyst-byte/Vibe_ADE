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

describe("vibe settings", () => {
  it("defaults: disabled with empty key, system-default voice, no device id", () => {
    expect(DEFAULT_SETTINGS.vibe).toEqual({
      enabled: false,
      groqApiKey: "",
      hotkey: "Ctrl+Shift+V",
      voice: "",
      deviceId: "",
    });
  });

  it("merges a valid vibe section", () => {
    const merged = mergeSettings({
      vibe: { enabled: true, groqApiKey: "gsk_x", hotkey: "Ctrl+Alt+V", voice: "Microsoft Zira", deviceId: "dev-9" },
    });
    expect(merged.vibe).toEqual({
      enabled: true, groqApiKey: "gsk_x", hotkey: "Ctrl+Alt+V", voice: "Microsoft Zira", deviceId: "dev-9",
    });
  });

  it("falls back field-by-field on wrong types and missing section", () => {
    expect(mergeSettings({}).vibe).toEqual(DEFAULT_SETTINGS.vibe);
    expect(mergeSettings({ vibe: { enabled: "yes", groqApiKey: 42 } }).vibe).toEqual(DEFAULT_SETTINGS.vibe);
  });

  it("defaults vibe.deviceId to empty and preserves a saved one", () => {
    expect(mergeSettings({}).vibe.deviceId).toBe("");
    expect(mergeSettings({ vibe: { deviceId: "abc-123" } }).vibe.deviceId).toBe("abc-123");
    expect(mergeSettings({ vibe: { deviceId: 42 } }).vibe.deviceId).toBe("");
  });
});
