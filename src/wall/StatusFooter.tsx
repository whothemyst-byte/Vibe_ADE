import { useEffect, useState, type RefObject } from "react";
import { isWorking, settle, statusLabel, type Activity } from "./agentStatus";

/**
 * Ticks once per second: renders the status line and mirrors the working state
 * onto the card wrapper as data-working (the header dot is styled purely via CSS),
 * so ticks never re-render the xterm subtree or other windows.
 */
export function StatusFooter({
  activityRef,
  wrapRef,
}: {
  activityRef: RefObject<Activity>;
  wrapRef: RefObject<HTMLDivElement | null>;
}) {
  const [label, setLabel] = useState("Idle");
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      activityRef.current = settle(activityRef.current, now);
      const a = activityRef.current;
      setLabel(statusLabel(a, now));
      wrapRef.current?.setAttribute("data-working", String(isWorking(a, now)));
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [activityRef, wrapRef]);
  return <div className="terminal-status">{label}</div>;
}
