import { describe, it, expect, beforeEach } from "vitest";
import {
  registerVibeCommand,
  runVibeCommand,
  getToolDefs,
  _clearRegistryForTests,
  type VibeCommand,
} from "./commands";

const cmd = (over: Partial<VibeCommand> = {}): VibeCommand => ({
  name: "open_terminal",
  description: "Spawn a new agent terminal",
  run: () => "opened",
  ...over,
});

beforeEach(() => _clearRegistryForTests());

describe("registerVibeCommand", () => {
  it("registers and unregisters via the returned cleanup", async () => {
    const cleanup = registerVibeCommand(cmd());
    expect(await runVibeCommand("open_terminal", {})).toBe("opened");
    cleanup();
    expect(await runVibeCommand("open_terminal", {})).toMatch(/no command named/i);
  });

  it("re-registering a name replaces the old handler", async () => {
    registerVibeCommand(cmd({ run: () => "first" }));
    registerVibeCommand(cmd({ run: () => "second" }));
    expect(await runVibeCommand("open_terminal", {})).toBe("second");
  });

  it("stale cleanup does not remove a newer registration (StrictMode safety)", async () => {
    const cleanupOld = registerVibeCommand(cmd({ run: () => "old" }));
    registerVibeCommand(cmd({ run: () => "new" }));
    cleanupOld(); // must NOT delete the newer entry
    expect(await runVibeCommand("open_terminal", {})).toBe("new");
  });
});

describe("getToolDefs", () => {
  it("emits OpenAI-format tool defs with default empty parameters", () => {
    registerVibeCommand(cmd());
    expect(getToolDefs()).toEqual([
      {
        type: "function",
        function: {
          name: "open_terminal",
          description: "Spawn a new agent terminal",
          parameters: { type: "object", properties: {} },
        },
      },
    ]);
  });

  it("passes through a command's own parameters schema", () => {
    const parameters = {
      type: "object",
      properties: { preset: { type: "string", description: "Preset label" } },
    };
    registerVibeCommand(cmd({ parameters }));
    expect(getToolDefs()[0].function.parameters).toEqual(parameters);
  });
});

describe("runVibeCommand", () => {
  it("returns thrown errors as result text instead of throwing", async () => {
    registerVibeCommand(cmd({ run: () => { throw new Error("wall not loaded"); } }));
    expect(await runVibeCommand("open_terminal", {})).toBe("Error: wall not loaded");
  });

  it("awaits async handlers", async () => {
    registerVibeCommand(cmd({ run: async () => "done later" }));
    expect(await runVibeCommand("open_terminal", {})).toBe("done later");
  });
});
