import { useEffect, useRef } from "react";

export type VibeCommand = {
  name: string;
  /** Shown to the LLM — say what it does and when to use it. */
  description: string;
  /** JSON Schema for the arguments object. Omit for no-arg commands. */
  parameters?: Record<string, unknown>;
  /** Returns a short result string fed back to the LLM ("opened terminal Ada"). */
  run: (args: Record<string, unknown>) => string | Promise<string>;
};

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const registry = new Map<string, VibeCommand>();

/** Registers a command; returns a cleanup that removes it (only if still current). */
export function registerVibeCommand(cmd: VibeCommand): () => void {
  registry.set(cmd.name, cmd);
  return () => {
    if (registry.get(cmd.name) === cmd) registry.delete(cmd.name);
  };
}

export function getToolDefs(): ToolDef[] {
  return [...registry.values()].map((c) => ({
    type: "function",
    function: {
      name: c.name,
      description: c.description,
      parameters: c.parameters ?? { type: "object", properties: {} },
    },
  }));
}

/** Never throws — errors become result text so the LLM can explain them. */
export async function runVibeCommand(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const cmd = registry.get(name);
  if (!cmd) return `Error: no command named "${name}" is available right now.`;
  try {
    return await cmd.run(args);
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** True while a command is registered. Wall-scoped commands (open_terminal, …)
    exist exactly while a space is open — the control bridge keys off that. */
export function hasVibeCommand(name: string): boolean {
  return registry.has(name);
}

export function _clearRegistryForTests(): void {
  registry.clear();
}

/**
 * Registers a command for the lifetime of the component. The handler ref is
 * kept fresh so `run` always sees current props/state, while registration
 * itself happens once per name (StrictMode-safe via the cleanup guard).
 */
export function useVibeCommand(cmd: VibeCommand): void {
  const ref = useRef(cmd);
  ref.current = cmd;
  useEffect(() => {
    return registerVibeCommand({
      name: cmd.name,
      description: cmd.description,
      parameters: cmd.parameters,
      run: (args) => ref.current.run(args),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd.name]);
}
