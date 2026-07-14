import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useCardStore, terminalsOf } from "../wall/cardStore";
import { usePresetStore } from "../wall/presetStore";
import { resolvePreset } from "../wall/presets";
import { openBrowser, browserCard } from "../wall/browserActions";
import { getContextBlock } from "../vibe/context";
import { hasVibeCommand, runVibeCommand } from "../vibe/commands";

/**
 * Webview side of the agent canvas-control server (src-tauri/src/control.rs).
 * Executes ONLY the three allowlisted verbs against the card store — this is
 * deliberately not wired to the whole Vibe command registry.
 */

export type StatePayload = {
  /** Human-readable wall summary (the Vibe context block); null when no space is open. */
  wall: string | null;
  terminals: { id: string; name: string; preset: string }[];
  browser: { url: string } | null;
};

export type ControlDeps = {
  wallOpen: () => boolean;
  stateSnapshot: () => StatePayload;
  openBrowser: (url: string) => Promise<string>;
  openTerminal: (preset: string | undefined, run: string | undefined) => Promise<string>;
};

export type ControlResult = { ok: boolean; body: unknown };

export async function handleControlRequest(
  verb: string,
  args: Record<string, unknown>,
  deps: ControlDeps
): Promise<ControlResult> {
  if (verb === "state") return { ok: true, body: deps.stateSnapshot() };
  if (verb !== "browser" && verb !== "terminal") {
    return { ok: false, body: { error: `unknown verb "${verb}"` } };
  }
  if (!deps.wallOpen()) return { ok: true, body: { error: "no space is open" } };
  if (verb === "browser") {
    const url = String(args.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) return { ok: true, body: { error: "only http(s) urls" } };
    return { ok: true, body: { result: await deps.openBrowser(url) } };
  }
  const preset = args.preset === undefined ? undefined : String(args.preset);
  const run = args.run === undefined ? undefined : String(args.run);
  return { ok: true, body: { result: await deps.openTerminal(preset, run) } };
}

/** Wall-scoped commands are registered exactly while WallView is mounted. */
function wallOpen(): boolean {
  return hasVibeCommand("open_terminal");
}

function stateSnapshot(): StatePayload {
  if (!wallOpen()) return { wall: null, terminals: [], browser: null };
  const cards = useCardStore.getState().cards;
  const presets = usePresetStore.getState().presets;
  const browser = browserCard();
  return {
    wall: getContextBlock(),
    terminals: terminalsOf(cards).map((t) => ({
      id: t.id,
      name: t.name,
      preset: resolvePreset(presets, t.presetId).label,
    })),
    browser: browser ? { url: browser.url } : null,
  };
}

const LIVE_DEPS: ControlDeps = {
  wallOpen,
  stateSnapshot,
  openBrowser,
  openTerminal: (preset, run) =>
    runVibeCommand("open_terminal", {
      preset: preset ?? "",
      ...(run === undefined ? {} : { run }),
    }),
};

/** Listens for control-request events for the app's lifetime. Returns unlisten. */
export function initControlBridge(): Promise<() => void> {
  return listen<{ id: number; verb: string; args: Record<string, unknown> }>(
    "control-request",
    async (e) => {
      let res: ControlResult;
      try {
        res = await handleControlRequest(e.payload.verb, e.payload.args ?? {}, LIVE_DEPS);
      } catch (err) {
        res = { ok: false, body: { error: err instanceof Error ? err.message : String(err) } };
      }
      void invoke("control_reply", {
        id: e.payload.id,
        ok: res.ok,
        body: JSON.stringify(res.body),
      });
    }
  );
}
