import { describe, it, expect } from "vitest";
import { serializeScene, parseScene, emptySceneJson, DEFAULT_BG, type SceneElement } from "./normalize";

const rect = (over: Partial<SceneElement> = {}): SceneElement => ({
  id: "r1", type: "rectangle", x: 10, y: 20, width: 100, height: 40,
  strokeColor: "#d79a3d", backgroundColor: "transparent",
  seed: 12345, version: 7, versionNonce: 98765, updated: 1700000000000,
  ...over,
});

describe("serializeScene", () => {
  it("strips per-edit volatile fields but keeps semantic ones", () => {
    const out = serializeScene([rect()], DEFAULT_BG);
    const parsed = JSON.parse(out);
    const el = parsed.elements[0];
    expect(el.seed).toBeUndefined();
    expect(el.version).toBeUndefined();
    expect(el.versionNonce).toBeUndefined();
    expect(el.updated).toBeUndefined();
    expect(el.id).toBe("r1");
    expect(el.x).toBe(10);
    expect(el.strokeColor).toBe("#d79a3d");
  });

  it("drops deleted elements", () => {
    const out = serializeScene([rect(), rect({ id: "gone", isDeleted: true })], DEFAULT_BG);
    expect(JSON.parse(out).elements.map((e: SceneElement) => e.id)).toEqual(["r1"]);
  });

  it("is pretty-printed, version-tagged, and newline-terminated", () => {
    const out = serializeScene([rect()], DEFAULT_BG);
    expect(out.endsWith("\n")).toBe(true);
    expect(out).toContain("\n  "); // 2-space indent
    expect(JSON.parse(out).version).toBe(1);
    expect(JSON.parse(out).appState.viewBackgroundColor).toBe(DEFAULT_BG);
  });

  it("preserves element order and is idempotent across a round-trip", () => {
    const first = serializeScene([rect({ id: "a" }), rect({ id: "b" })], DEFAULT_BG);
    const round = parseScene(first);
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    const second = serializeScene(round.elements, round.viewBackgroundColor);
    expect(second).toBe(first);
    expect(round.elements.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("parseScene", () => {
  it("rejects malformed JSON", () => {
    const res = parseScene("{ not json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/json|parse|unexpected/i);
  });

  it("rejects a scene missing an elements array", () => {
    const res = parseScene(JSON.stringify({ version: 1, appState: {} }));
    expect(res.ok).toBe(false);
  });

  it("defaults the background when absent", () => {
    const res = parseScene(JSON.stringify({ version: 1, elements: [] }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.viewBackgroundColor).toBe(DEFAULT_BG);
  });
});

describe("emptySceneJson", () => {
  it("round-trips to an empty element list", () => {
    const res = parseScene(emptySceneJson());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.elements).toEqual([]);
  });
});
