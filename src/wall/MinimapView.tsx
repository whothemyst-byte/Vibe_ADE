import { useEffect, useState, type RefObject } from "react";
import { useCardStore, type Card } from "./cardStore";
import type { Camera, Rect } from "./transform";
import { minimapProject } from "./minimap";
import { presetTierColor } from "./presetTier";

const BOX = { w: 180, h: 120, pad: 8 };
/** Below this window width the minimap hides itself — no room for it.
    (Default dev-window width is ~895 CSS px — keep this comfortably below.) */
const MIN_WINDOW_W = 700;
/** Camera polling cadence: pan/zoom bypasses React, so the minimap samples the ref. */
const TICK_MS = 150;

const colorOf = (c: Card): string =>
  c.kind === "terminal" ? presetTierColor(c.presetId)
  : c.kind === "browser" ? "var(--info)"
  : c.kind === "music" ? "var(--accent)"
  : "var(--text-faint)";

export function MinimapView({ cameraRef, rootRef, onJump }: {
  cameraRef: RefObject<Camera>;
  rootRef: RefObject<HTMLDivElement | null>;
  onJump: (world: { x: number; y: number }) => void;
}) {
  const cards = useCardStore((s) => s.cards);
  const [viewport, setViewport] = useState<Rect | null>(null);

  useEffect(() => {
    const tick = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      const cam = cameraRef.current;
      const next =
        rect && rect.width >= MIN_WINDOW_W
          ? { x: -cam.x, y: -cam.y, w: rect.width / cam.z, h: rect.height / cam.z }
          : null;
      setViewport((prev) =>
        prev && next && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h
          ? prev
          : next
      );
    };
    tick();
    const t = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(t);
  }, [cameraRef, rootRef]);

  if (cards.length === 0 || !viewport) return null;
  const m = minimapProject(cards.map(({ x, y, w, h }) => ({ x, y, w, h })), viewport, BOX);
  return (
    <svg
      className="minimap"
      width={BOX.w}
      height={BOX.h}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onJump(m.toWorld({ x: e.clientX - r.left, y: e.clientY - r.top }));
      }}
    >
      {m.cards.map((r, i) => (
        <rect
          key={cards[i].id}
          x={r.x} y={r.y}
          width={Math.max(2, r.w)} height={Math.max(2, r.h)}
          rx={1.5} fill={colorOf(cards[i])} opacity={0.55}
        />
      ))}
      <rect
        x={m.viewport.x} y={m.viewport.y} width={m.viewport.w} height={m.viewport.h}
        fill="none" stroke="var(--accent)" strokeWidth={1.5} rx={2}
      />
    </svg>
  );
}
