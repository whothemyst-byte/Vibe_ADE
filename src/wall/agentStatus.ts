/** An agent counts as working while output arrived within this window. */
export const IDLE_AFTER_MS = 2500;

export type Activity = {
  /** Sum of completed working spans, in ms. */
  doneMs: number;
  /** Start of the current span, or null when no span is open. */
  activeSince: number | null;
  /** Timestamp of the most recent PTY output (0 = never). */
  lastOutputAt: number;
};

export const newActivity = (): Activity => ({ doneMs: 0, activeSince: null, lastOutputAt: 0 });

/** Call whenever PTY output arrives. Opens a span if none is active. */
export function recordOutput(a: Activity, now: number): Activity {
  return { doneMs: a.doneMs, activeSince: a.activeSince ?? now, lastOutputAt: now };
}

/** Folds the open span into doneMs once the agent has gone idle. */
export function settle(a: Activity, now: number): Activity {
  if (a.activeSince !== null && now - a.lastOutputAt >= IDLE_AFTER_MS) {
    return {
      doneMs: a.doneMs + (a.lastOutputAt - a.activeSince),
      activeSince: null,
      lastOutputAt: a.lastOutputAt,
    };
  }
  return a;
}

export function isWorking(a: Activity, now: number): boolean {
  return a.activeSince !== null && now - a.lastOutputAt < IDLE_AFTER_MS;
}

/** Total working ms: completed spans plus the live one (capped at last output when idle). */
export function workedMs(a: Activity, now: number): number {
  if (a.activeSince === null) return a.doneMs;
  const end = isWorking(a, now) ? now : a.lastOutputAt;
  return a.doneMs + (end - a.activeSince);
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function statusLabel(a: Activity, now: number): string {
  const worked = workedMs(a, now);
  if (isWorking(a, now)) return `Working ${formatElapsed(worked)}`;
  if (worked > 0) return `Cooked for ${formatElapsed(worked)}`;
  return "Idle";
}
