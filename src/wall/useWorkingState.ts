import { useEffect, type RefObject } from "react";
import { isWorking, settle, type Activity } from "./agentStatus";

/**
 * Ticks once per second and mirrors the working state onto the card wrapper
 * as data-working (the header dot pulse + border glow are styled purely via
 * CSS), so ticks never re-render the xterm subtree or other windows.
 */
export function useWorkingState(
  activityRef: RefObject<Activity>,
  wrapRef: RefObject<HTMLDivElement | null>
): void {
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      activityRef.current = settle(activityRef.current, now);
      wrapRef.current?.setAttribute("data-working", String(isWorking(activityRef.current, now)));
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [activityRef, wrapRef]);
}
