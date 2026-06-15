import { useEffect, useState } from "react";
import { useEntitlements } from "../entitlements";
import { useOrgStore, type Org, type Member, type Invite } from "./orgStore";
import { currentUserId } from "./identity";
import { isValidEmail } from "./orgHelpers";
import { BackIcon, TeamsIcon } from "../wall/icons";

export function TeamsView({ onBack }: { onBack: () => void }) {
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
          <OrgHero org={currentOrg} memberCount={members.length} isAdmin={isAdmin} />
          <MembersPanel members={members} myId={myId} isAdmin={isAdmin} orgId={currentOrg.id} />
          {isAdmin && <InvitesPanel orgId={currentOrg.id} invites={invites} />}
          <ProjectsPanel />
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
  const monogram = org.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="teams-hero">
      <div className="teams-core teams-core-lg">
        {org.logo_url ? <img src={org.logo_url} alt="" /> : <span>{monogram}</span>}
      </div>
      <div className="teams-hero-meta">
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

function ProjectsPanel() {
  return (
    <section className="teams-panel">
      <h3 className="teams-panel-title">Projects</h3>
      <p className="teams-placeholder">
        No shared projects yet. Publishing a space to your org arrives in a later update.
      </p>
    </section>
  );
}
