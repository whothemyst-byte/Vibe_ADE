import { useEffect, useRef, useState } from "react";
import { type Member, type Org } from "./orgStore";
import { usePresenceStore } from "./presence";
import { orbitPositions } from "./orbit";
import { statusLine } from "./presenceHelpers";

const MIN_SIZE = 360;       // never shrink the orbit below this
const AVATAR_HALF = 26;     // keep outer avatars off the edge

export function SolarSystem({ org, members, myId, onOpenSpace, onOpenSettings }: {
  org: Org; members: Member[]; myId: string | null;
  onOpenSpace?: (orgSpaceId: string) => void;
  onOpenSettings?: () => void;
}) {
  const roster = usePresenceStore((s) => s.roster);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(MIN_SIZE);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize(Math.max(MIN_SIZE, Math.min(width, height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  void onOpenSpace; // consumed in Task 11 (openableSpace affordance)
  const C = size / 2;
  const maxRadius = C - AVATAR_HALF;
  const positions = orbitPositions(members.length, maxRadius);
  const ringRadii = [...new Set(positions.map((p) => p.radius))];
  const monogram = org.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div ref={stageRef} className="solar-stage">
      <div className="solar" style={{ width: size, height: size }}>
        <div className="solar-rings" aria-hidden>
          {ringRadii.map((r) => (
            <span key={r} style={{ width: r * 2, height: r * 2 }} />
          ))}
        </div>
        <button className="solar-core" title={`${org.name} — settings`} onClick={() => onOpenSettings?.()}>
          {org.logo_url ? <img src={org.logo_url} alt="" /> : <span>{monogram}</span>}
        </button>
        <div className="solar-rotor">
          {members.map((m, i) => {
            const pos = positions[i];
            if (!pos) return null;
            const rad = (pos.angle * Math.PI) / 180;
            const x = C + pos.radius * Math.cos(rad);
            const y = C + pos.radius * Math.sin(rad);
            const live = roster[m.user_id];
            const online = live ? live.status : null;
            const line = statusLine({
              online,
              currentSpaceName: live?.spaceName ?? null,
              lastSpaceName: m.last_space_name,
              lastActiveAt: m.last_active_at ? Date.parse(m.last_active_at) : null,
              manualStatus: live?.manualStatus ?? m.manual_status,
              manualEmoji: live?.manualEmoji ?? m.manual_status_emoji,
              now,
            });
            const name = m.display_name || m.user_id;
            const initial = (m.display_name || "?").trim().charAt(0).toUpperCase();
            const statusClass =
              online === "online" ? "is-online" : online === "idle" ? "is-idle" : "is-offline";
            return (
              <div key={m.user_id} className="solar-node" style={{ left: x, top: y }}>
                <div className={`solar-avatar ${statusClass}`}>
                  {m.avatar_url ? <img src={m.avatar_url} alt="" /> : initial}
                  <div className="solar-tip">
                    <strong>{name}{m.user_id === myId ? " (you)" : ""}</strong>
                    <span>{line}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
