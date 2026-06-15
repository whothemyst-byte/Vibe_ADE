import { useEffect, useState } from "react";
import { type Member, type Org } from "./orgStore";
import { usePresenceStore } from "./presence";
import { orbitPositions } from "./orbit";
import { statusLine } from "./presenceHelpers";

const SIZE = 560;
const C = SIZE / 2;

export function SolarSystem({ org, members, myId }: { org: Org; members: Member[]; myId: string | null }) {
  const roster = usePresenceStore((s) => s.roster);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const positions = orbitPositions(members.length);
  const monogram = org.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="solar" style={{ width: SIZE, height: SIZE }}>
      <div className="solar-rings" aria-hidden>
        <span style={{ width: 220, height: 220 }} />
        <span style={{ width: 360, height: 360 }} />
        <span style={{ width: 500, height: 500 }} />
      </div>
      <div className="solar-core" title={org.name}>
        {org.logo_url ? <img src={org.logo_url} alt="" /> : <span>{monogram}</span>}
      </div>
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
  );
}
