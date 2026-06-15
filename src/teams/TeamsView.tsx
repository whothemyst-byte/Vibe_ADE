import { useEffect, useState } from "react";
import { useEntitlements } from "../entitlements";
import { useOrgStore } from "./orgStore";
import { currentUserId } from "./identity";
import { SolarSystem } from "./SolarSystem";
import { SettingsModal } from "../settings/SettingsModal";
import { openSharedSpace } from "./spaceSync";
import { BackIcon, GearIcon, TeamsIcon } from "../wall/icons";

export function TeamsView({ onBack, onOpenWall }: { onBack: () => void; onOpenWall: (id: string) => void }) {
  const ent = useEntitlements();
  const { orgs, currentOrgId, members, loading, error } = useOrgStore();
  const loadMyOrgs = useOrgStore((s) => s.loadMyOrgs);
  const [settingsOpen, setSettingsOpen] = useState<null | "organization" | "mycard">(null);

  useEffect(() => {
    if (ent.canUseTeams) void loadMyOrgs();
  }, [ent.canUseTeams, loadMyOrgs]);

  if (!ent.canUseTeams) {
    return (
      <div className="teams">
        <div className="cnvs-toolbar tb-toolbar">
          <button className="cnvs-btn" onClick={onBack} title="Back"><BackIcon /></button>
          <span className="cnvs-name tb-name"><TeamsIcon /> Teams</span>
        </div>
        <div className="teams-upsell">
          <div className="teams-upsell-card">
            <div className="teams-core"><TeamsIcon /></div>
            <h2>Team collaboration</h2>
            <p>Create an organization, invite your teammates, and share spaces — then see
               who's working on what in a live team view.</p>
            <p className="teams-upsell-tier">Available on the <strong>Team</strong> plan.</p>
          </div>
        </div>
      </div>
    );
  }

  const currentOrg = orgs.find((o) => o.id === currentOrgId) ?? null;
  const myId = currentUserId();
  const openShared = async (orgSpaceId: string) => { onOpenWall(await openSharedSpace(orgSpaceId)); };

  return (
    <div className="teams">
      <div className="cnvs-toolbar tb-toolbar">
        <button className="cnvs-btn" onClick={onBack} title="Back"><BackIcon /></button>
        <span className="cnvs-name tb-name"><TeamsIcon /> Teams</span>
        {orgs.length > 0 && (
          <select className="teams-switcher" value={currentOrgId ?? ""}
            onChange={(e) => useOrgStore.getState().setCurrentOrg(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        {currentOrg && (
          <button className="cnvs-btn" title="Team settings" onClick={() => setSettingsOpen("organization")}><GearIcon /></button>
        )}
      </div>

      {error && <div className="teams-error">{error}</div>}

      {orgs.length === 0 ? (
        <TeamsEmptyState />
      ) : currentOrg ? (
        <SolarSystem
          org={currentOrg}
          members={members}
          myId={myId}
          onOpenSpace={openShared}
          onOpenSettings={() => setSettingsOpen("organization")}
        />
      ) : loading ? (
        <div className="teams-loading">Loading…</div>
      ) : null}

      {settingsOpen && (
        <SettingsModal
          initialSection={settingsOpen}
          onOpenWall={onOpenWall}
          onClose={() => setSettingsOpen(null)}
        />
      )}
    </div>
  );
}

function TeamsEmptyState() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const createOrg = useOrgStore((s) => s.createOrg);
  const joinByCode = useOrgStore((s) => s.joinByCode);
  return (
    <div className="teams-empty">
      <div className="teams-empty-card">
        <h2>Create your organization</h2>
        <p>Start a team, then invite people by email or share a join code.</p>
        <div className="teams-form-row">
          <input
            className="teams-input"
            placeholder="Organization name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="teams-btn primary"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              try { await createOrg(name.trim()); } finally { setBusy(false); }
            }}
          >
            Create
          </button>
        </div>
      </div>
      <div className="teams-empty-card">
        <h2>Join with a code</h2>
        <p>Got a join code from a teammate? Enter it here.</p>
        <div className="teams-form-row">
          <input
            className="teams-input"
            placeholder="Join code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button
            className="teams-btn"
            disabled={busy || !code.trim()}
            onClick={async () => {
              setBusy(true);
              try { await joinByCode(code.trim()); } finally { setBusy(false); }
            }}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
