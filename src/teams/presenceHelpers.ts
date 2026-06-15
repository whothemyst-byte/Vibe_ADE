export type LiveStatus = "online" | "idle";

const IDLE_MS = 5 * 60_000;

/** Auto status from window visibility + last input recency. */
export function deriveSelfStatus(visible: boolean, lastActivity: number, now: number): LiveStatus {
  if (!visible) return "idle";
  return now - lastActivity < IDLE_MS ? "online" : "idle";
}

/** Coarse "x ago" text for last-seen. */
export function agoText(then: number, now: number): string {
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export type StatusLineInput = {
  online: LiveStatus | null;        // null = offline
  currentSpaceName: string | null;
  lastSpaceName: string | null;
  lastActiveAt: number | null;
  manualStatus: string | null;
  manualEmoji: string | null;
  now: number;
};

/** Composes the resolved hover line, e.g. "Online · in Redesign". */
export function statusLine(i: StatusLineInput): string {
  const isPresent = i.online !== null;
  const parts: string[] = [];

  if (isPresent && i.manualStatus) {
    parts.push(i.manualEmoji ? `${i.manualEmoji} ${i.manualStatus}` : i.manualStatus);
  } else if (i.online === "online") {
    parts.push("Online");
  } else if (i.online === "idle") {
    parts.push("Idle");
  } else {
    parts.push("Offline");
  }

  if (!isPresent && i.lastActiveAt) {
    parts.push(`last seen ${agoText(i.lastActiveAt, i.now)}`);
  }

  if (isPresent && i.currentSpaceName) {
    parts.push(`in ${i.currentSpaceName}`);
  } else if (isPresent && i.lastSpaceName) {
    parts.push(`last worked in ${i.lastSpaceName}`);
  } else if (!isPresent && i.lastSpaceName) {
    parts.push(`last in ${i.lastSpaceName}`);
  }

  return parts.join(" · ");
}
