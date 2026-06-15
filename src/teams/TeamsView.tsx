import { useEffect, useState } from "react";
import { useEntitlements } from "../entitlements";
import { useOrgStore, type Org, type Member, type Invite } from "./orgStore";
import { currentUserId } from "./identity";
import { isValidEmail } from "./orgHelpers";
import { SolarSystem } from "./SolarSystem";
import { setPresenceManualStatus } from "./presence";
import { loadIndex } from "../store/persistence";
import type { WallMeta } from "../store/types";
import { publishLocalSpace, openSharedSpace, unpublishSharedSpace } from "./spaceSync";
import { BackIcon, TeamsIcon } from "../wall/icons";

export function TeamsView({ onBack, onOpenWall }: { onBack: () => void; onOpenWall: (id: string) => void }) {
  const ent = useEntitlements();
  const { orgs, currentOrgId, members, invites, loading, error } = useOrgStore();
  const loadMyOrgs = useOrgStore((s) => s.loadMyOrgs);

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
  const myRole = members.find((m) => m.user_id === myId)?.role ?? null;
  const isAdmin = myRole === "owner" || myRole === "admin";

  return (
    <div className="teams">
      <div className="cnvs-toolbar tb-toolbar">
        <button className="cnvs-btn" onClick={onBack} title="Back"><BackIcon /></button>
        <span className="cnvs-name tb-name"><TeamsIcon /> Teams</span>
        {orgs.length > 0 && (
          <select
            className="teams-switcher"
            value={currentOrgId ?? ""}
            onChange={(e) => useOrgStore.getState().setCurrentOrg(e.target.value)}
          >
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      {error && <div className="teams-error">{error}</div>}

      {orgs.length === 0 ? (
        <TeamsEmptyState />
      ) : currentOrg ? (
        <div className="teams-body">
          <SolarSystem org={currentOrg} members={members} myId={myId} />
          <OrgHero org={currentOrg} memberCount={members.length} isAdmin={isAdmin} />
          <MyStatusBar />
          <MembersPanel members={members} myId={myId} isAdmin={isAdmin} orgId={currentOrg.id} />
          {isAdmin && <InvitesPanel orgId={currentOrg.id} invites={invites} />}
          <ProjectsPanel orgId={currentOrg.id} myId={myId} isAdmin={isAdmin} onOpenWall={onOpenWall} />
        </div>
      ) : loading ? (
        <div className="teams-loading">Loading…</div>
      ) : null}
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

function OrgHero({ org, memberCount, isAdmin }: { org: Org; memberCount: number; isAdmin: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="teams-caption">
      <h1>{org.name}</h1>
      <span className="teams-hero-sub">{memberCount} {memberCount === 1 ? "member" : "members"}</span>
      {isAdmin && (
        <button
          className="teams-code"
          title="Copy join code"
          onClick={() => {
            void navigator.clipboard.writeText(org.join_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          Join code <strong>{org.join_code}</strong> {copied ? "✓" : "⧉"}
        </button>
      )}
    </div>
  );
}

function MyStatusBar() {
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState("");
  const [busy, setBusy] = useState(false);
  const setMyStatus = useOrgStore((s) => s.setMyStatus);
  const apply = async (t: string | null, em: string | null) => {
    setBusy(true);
    try { await setMyStatus(t, em); setPresenceManualStatus(t, em); } finally { setBusy(false); }
  };
  return (
    <div className="teams-status-bar">
      <input
        className="teams-emoji-input"
        placeholder="🙂"
        value={emoji}
        maxLength={2}
        onChange={(e) => setEmoji(e.target.value)}
      />
      <input
        className="teams-input"
        placeholder="Set a status… (e.g. Heads-down)"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        className="teams-btn primary"
        disabled={busy}
        onClick={() => void apply(text.trim() || null, emoji.trim() || null)}
      >
        Set
      </button>
      {(text || emoji) && (
        <button
          className="teams-btn"
          disabled={busy}
          onClick={() => { setText(""); setEmoji(""); void apply(null, null); }}
        >
          Clear
        </button>
      )}
    </div>
  );
}

function MembersPanel({
  members, myId, isAdmin, orgId,
}: { members: Member[]; myId: string | null; isAdmin: boolean; orgId: string }) {
  const setRole = useOrgStore((s) => s.setRole);
  const removeMember = useOrgStore((s) => s.removeMember);
  return (
    <section className="teams-panel">
      <h3 className="teams-panel-title">Members</h3>
      <ul className="teams-members">
        {members.map((m) => {
          const name = m.display_name || m.user_id;
          const initial = (m.display_name || "?").trim().charAt(0).toUpperCase();
          const isMe = m.user_id === myId;
          return (
            <li key={m.user_id} className="teams-member">
              <span className="teams-avatar">
                {m.avatar_url ? <img src={m.avatar_url} alt="" /> : initial}
              </span>
              <span className="teams-member-name">
                {name}{isMe && <span className="teams-you"> (you)</span>}
              </span>
              {isAdmin && !isMe ? (
                <select
                  className="teams-role"
                  value={m.role}
                  onChange={(e) =>
                    void setRole(orgId, m.user_id, e.target.value as "owner" | "admin" | "member")
                  }
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
              ) : (
                <span className="teams-role-badge">{m.role}</span>
              )}
              {isAdmin && !isMe && (
                <button
                  className="teams-remove"
                  title="Remove member"
                  onClick={() => void removeMember(orgId, m.user_id)}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function InvitesPanel({ orgId, invites }: { orgId: string; invites: Invite[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [busy, setBusy] = useState(false);
  const invite = useOrgStore((s) => s.invite);
  const revokeInvite = useOrgStore((s) => s.revokeInvite);
  const valid = isValidEmail(email);
  return (
    <section className="teams-panel">
      <h3 className="teams-panel-title">Invite</h3>
      <div className="teams-form-row">
        <input
          className="teams-input"
          placeholder="teammate@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          className="teams-role"
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "member")}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button
          className="teams-btn primary"
          disabled={busy || !valid}
          onClick={async () => {
            setBusy(true);
            try { await invite(orgId, email.trim(), role); setEmail(""); } finally { setBusy(false); }
          }}
        >
          Send
        </button>
      </div>
      {invites.length > 0 && (
        <ul className="teams-invites">
          {invites.map((inv) => (
            <li key={inv.id} className="teams-invite">
              <span className="teams-invite-email">{inv.email}</span>
              <span className="teams-role-badge">{inv.role}</span>
              <span className="teams-invite-pending">pending</span>
              <button
                className="teams-remove"
                title="Revoke invite"
                onClick={() => void revokeInvite(inv.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProjectsPanel({
  orgId, myId, isAdmin, onOpenWall,
}: { orgId: string; myId: string | null; isAdmin: boolean; onOpenWall: (id: string) => void }) {
  const projects = useOrgStore((s) => s.projects);
  const loadProjects = useOrgStore((s) => s.loadProjects);
  const [locals, setLocals] = useState<WallMeta[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadIndex().then((idx) => setLocals(idx.filter((w) => w.sharedOrgSpaceId == null)));
  }, [projects]);

  const share = async () => {
    if (!pick) return;
    setBusy(true);
    try { await publishLocalSpace(pick, orgId); await loadProjects(orgId); setPick(""); }
    finally { setBusy(false); }
  };
  const open = async (id: string) => {
    setBusy(true);
    try { onOpenWall(await openSharedSpace(id)); } finally { setBusy(false); }
  };
  const unpublish = async (id: string) => {
    setBusy(true);
    try { await unpublishSharedSpace(id); await loadProjects(orgId); } finally { setBusy(false); }
  };

  return (
    <section className="teams-panel">
      <h3 className="teams-panel-title">Projects</h3>
      <div className="teams-form-row">
        <select className="teams-input" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Share a space…</option>
          {locals.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button className="teams-btn primary" disabled={busy || !pick} onClick={() => void share()}>Share</button>
      </div>
      {projects.length === 0 ? (
        <p className="teams-placeholder">No shared projects yet. Share one of your spaces above.</p>
      ) : (
        <ul className="teams-projects">
          {projects.map((p) => (
            <li key={p.id} className="teams-project">
              <span className="teams-proj-mono">{p.name.charAt(0).toUpperCase() || "?"}</span>
              <span className="teams-proj-name">{p.name}</span>
              <button className="teams-btn" disabled={busy} onClick={() => void open(p.id)}>Open</button>
              {(isAdmin || p.owner_user_id === myId) && (
                <button className="teams-remove" title="Unpublish" disabled={busy} onClick={() => void unpublish(p.id)}>×</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
