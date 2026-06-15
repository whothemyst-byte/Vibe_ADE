# Teams Collaboration — Plan 3: Teams View Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first *visible* Teams surface — a **Teams button beside the taskboard button** (in the wall toolbar and on the start page), a full-page **Teams view** with an org switcher, members list, pending invites, a projects placeholder, and a create-org / join-by-code empty state — all driving the Plan 2 `orgStore`, gated to the Team tier with an inline upgrade affordance. (The orbiting "solar system" visual replaces the members list in Plan 4.)

**Architecture:** Mirror the existing `TaskBoard` full-page pattern and `cnvs-toolbar` chrome. A new `App` view state `{ kind: "teams" }` routes to `TeamsView`, which reads `useOrgStore`. Non-Team users see an upgrade panel instead of org UI. New UI primitives (a `TeamsIcon`, a tier-aware `UpgradePill`) are tiny and shared.

**Tech Stack:** React + zustand (`orgStore` from Plan 2), Clerk, the existing icon/CSS conventions. No new backend.

**Spec:** `docs/superpowers/specs/2026-06-15-vibe-space-teams-collab-design.md` (Section 4 — entry points, side rail, gating, empty state; the solar system itself is Plan 4).

**Prerequisite:** Plans 1–2 complete (orgStore, RPCs, `canUseTeams`).

---

### Task 1: UI primitives — `TeamsIcon` + tier-aware `UpgradePill`

**Files:**
- Modify: `src/wall/icons.tsx`
- Modify: `src/tasks/UpgradePill.tsx`

- [ ] **Step 1: Add a `TeamsIcon` (users) to `src/wall/icons.tsx`**

After the existing `UserIcon` export, add:

```tsx
export const TeamsIcon = () => (
  <Svg>
    <path d="M16 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M9 21v-2a4 4 0 0 0-4-4H4" />
    <circle cx="9" cy="7" r="3" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);
```

- [ ] **Step 2: Make `UpgradePill` tier-aware**

Replace the body of `src/tasks/UpgradePill.tsx` with:

```tsx
/** Small badge marking a feature locked behind a paid tier. Defaults to Pro. */
export function UpgradePill({ feature, tier = "Pro" }: { feature: string; tier?: "Pro" | "Team" }) {
  return (
    <span className="upgrade-pill" title={`${feature} — available on ${tier}`}>
      {tier}
    </span>
  );
}
```

(The default keeps every existing `<UpgradePill feature="…" />` call working unchanged.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/wall/icons.tsx src/tasks/UpgradePill.tsx
git commit -m "feat(teams): TeamsIcon + tier-aware UpgradePill"
```


### Task 2: Route a `teams` view in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import `TeamsView`**

Add near the other view imports (alongside `TaskBoard`):

```tsx
import { TeamsView } from "./teams/TeamsView";
```

- [ ] **Step 2: Extend the `View` union**

Change the `View` type to add a `teams` variant:

```tsx
type View =
  | { kind: "start" }
  | { kind: "wall"; id: string }
  | { kind: "tasks"; from: View }
  | { kind: "teams"; from: View };
```

- [ ] **Step 3: Describe the teams view in the Vibe context**

In the `useVibeContext("app", …)` callback, update the `where` expression to include teams:

```tsx
    const where =
      view.kind === "start" ? "start page"
      : view.kind === "tasks" ? "task board"
      : view.kind === "teams" ? "teams view"
      : `space "${wallsRef.current.find((w) => w.id === view.id)?.name ?? "unknown"}"`;
```

- [ ] **Step 4: Add an `open_teams` Vibe command**

After the existing `open_task_board` command block, add:

```tsx
  useVibeCommand({
    name: "open_teams",
    description: "Open the Teams view (organization, members, and shared projects).",
    run: () => {
      setView((v) => (v.kind === "teams" ? v : { kind: "teams", from: v }));
      return "Teams view is open.";
    },
  });
```

- [ ] **Step 5: Render the teams page**

In the `if (view.kind === …)` page-selection block, add a branch after the `tasks` branch:

```tsx
  } else if (view.kind === "teams") {
    page = <TeamsView onBack={() => setView(view.from)} />;
```

- [ ] **Step 6: Pass `onTeams` handlers to StartPage and WallView**

Update the `StartPage` render to add the handler:

```tsx
      <StartPage
        onOpen={(id) => setView({ kind: "wall", id })}
        onTasks={() => setView({ kind: "tasks", from: { kind: "start" } })}
        onTeams={() => setView({ kind: "teams", from: { kind: "start" } })}
      />
```

Update the `WallView` render to add the handler:

```tsx
      <WallView
        wallId={view.id}
        onExit={() => setView({ kind: "start" })}
        onSwitch={(id) => setView({ kind: "wall", id })}
        onTasks={() => setView({ kind: "tasks", from: view })}
        onTeams={() => setView({ kind: "teams", from: view })}
      />
```

- [ ] **Step 7: Type-check (expected to fail until Tasks 3–4 add the props/component)**

Run: `npx tsc --noEmit`
Expected: errors about `onTeams` not existing on `StartPage`/`WallView` props and the missing `./teams/TeamsView` module. These are resolved in Tasks 3–4; proceed (do not commit yet).


### Task 3: Entry points — wall `Toolbar` + `StartPage` buttons

The wall toolbar gets a Teams icon button right after the taskboard button (icon-only,
matching the chrome). The start page gets a labelled "Teams" button beside Taskboard,
with a "Team" pill when the tier is locked. Gating of the actual feature happens inside
`TeamsView` (Task 4), so both entry points always navigate.

**Files:**
- Modify: `src/wall/Toolbar.tsx`
- Modify: `src/start/StartPage.tsx`

- [ ] **Step 1: Add the Teams button to the wall toolbar**

In `src/wall/Toolbar.tsx`:
- Add `onTeams` to the props type and destructure it:

```tsx
export function Toolbar({
  wallId, onBack, onSwitch, onGear, onTasks, onTeams,
}: { wallId: string; onBack: () => void; onSwitch: (id: string) => void; onGear: () => void; onTasks: () => void; onTeams: () => void }) {
```

- Import the icon (extend the existing icons import):

```tsx
import { BackIcon, ChevronDownIcon, GearIcon, GridIcon, TeamsIcon } from "./icons";
```

- Add the button immediately after the taskboard button:

```tsx
      <button className="cnvs-btn" onClick={onTasks} title="Taskboard"><GridIcon /></button>
      <button className="cnvs-btn" onClick={onTeams} title="Teams"><TeamsIcon /></button>
```

- [ ] **Step 2: Add the Teams button to the start page**

In `src/start/StartPage.tsx`:
- Extend imports:

```tsx
import { CloseIcon, GridIcon, TeamsIcon } from "../wall/icons";
import { useEntitlements } from "../entitlements";
import { UpgradePill } from "../tasks/UpgradePill";
```

- Add `onTeams` to the props:

```tsx
export function StartPage({ onOpen, onTasks, onTeams }: { onOpen: (id: string) => void; onTasks: () => void; onTeams: () => void }) {
  const ent = useEntitlements();
```

- In `start-head`, add the Teams button next to the Taskboard button:

```tsx
        <button className="start-tasks" onClick={onTasks}><GridIcon /> Taskboard</button>
        <button className="start-tasks" onClick={onTeams}>
          <TeamsIcon /> Teams{!ent.canUseTeams && <UpgradePill feature="Team collaboration" tier="Team" />}
        </button>
```

- [ ] **Step 3: Type-check (still expects the missing `TeamsView` module)**

Run: `npx tsc --noEmit`
Expected: the only remaining error is the missing `./teams/TeamsView` import in `App.tsx`. Proceed to Task 4.


### Task 4: `TeamsView` component

A full-page view mirroring `TaskBoard`'s structure: a `cnvs-toolbar` header with back +
org switcher, then either an upgrade panel (non-Team), an empty create/join state (Team
tier, no orgs), or the org body (hero, members, invites for admins, projects placeholder).

**Files:**
- Modify: `src/teams/identity.ts`
- Create: `src/teams/TeamsView.tsx`

- [ ] **Step 1: Add a `currentUserId` reader to `src/teams/identity.ts`**

Append to `identity.ts` (and extend the `ClerkUser` type with `id`):

```ts
export function currentUserId(): string | null {
  const u = (globalThis as unknown as ClerkWindow).Clerk?.user;
  return u?.id ?? null;
}
```

And add `id?: string | null;` to the `ClerkUser` type at the top of the file.

- [ ] **Step 2: Create `src/teams/TeamsView.tsx`**

```tsx
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
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (all the wiring from Tasks 2–3 now resolves).

- [ ] **Step 4: Commit**

```bash
git add src/teams/identity.ts src/teams/TeamsView.tsx src/App.tsx src/wall/Toolbar.tsx src/start/StartPage.tsx
git commit -m "feat(teams): Teams view, routing, and entry points"
```


### Task 5: Styles for the Teams view

Append a `teams` block to `src/App.css`, reusing the warm desktop aesthetic. CSS custom
properties use `var(--name, fallback)` so the styles hold up even if a token name differs.

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Confirm the token names actually in use**

Run: `grep -nE "\-\-(accent|text|text-muted|panel|border|bg)\b" src/theme.css | head`
Use the real names where they exist; the fallbacks below cover any gaps.

- [ ] **Step 2: Append the stylesheet to `src/App.css`**

```css
/* ── Teams view ─────────────────────────────────────────────── */
.teams {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg, #12110f);
  color: var(--text, #ece6da);
  overflow: auto;
}
.teams-switcher,
.teams-role,
.teams-input {
  background: var(--panel, #1c1a16);
  color: var(--text, #ece6da);
  border: 1px solid var(--border, #2e2a23);
  border-radius: 8px;
  padding: 6px 10px;
  font: inherit;
}
.teams-switcher { margin-left: 8px; }
.teams-error {
  margin: 10px 16px 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--danger, #d9534f) 18%, transparent);
  color: var(--danger, #e88);
  font-size: 13px;
}
.teams-loading,
.teams-placeholder { color: var(--text-muted, #9a9183); padding: 16px; font-size: 14px; }

.teams-body {
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  padding: 28px 20px 60px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

/* org core "sun" */
.teams-core {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 40%,
    color-mix(in srgb, var(--accent, #d79a3d) 55%, transparent),
    color-mix(in srgb, var(--accent, #d79a3d) 12%, transparent));
  box-shadow: 0 0 24px color-mix(in srgb, var(--accent, #d79a3d) 35%, transparent);
  color: var(--text, #ece6da);
  font-weight: 600;
  overflow: hidden;
}
.teams-core img { width: 100%; height: 100%; object-fit: cover; }
.teams-core-lg { width: 84px; height: 84px; font-size: 34px; }

.teams-hero { display: flex; align-items: center; gap: 18px; }
.teams-hero-meta { display: flex; flex-direction: column; gap: 4px; }
.teams-hero-meta h1 { margin: 0; font-size: 26px; font-weight: 600; }
.teams-hero-sub { color: var(--text-muted, #9a9183); font-size: 13px; }
.teams-code {
  margin-top: 6px;
  align-self: flex-start;
  background: var(--panel, #1c1a16);
  border: 1px solid var(--border, #2e2a23);
  border-radius: 8px;
  padding: 4px 10px;
  color: var(--text-muted, #9a9183);
  cursor: pointer;
  font-size: 12px;
}
.teams-code strong { color: var(--accent, #d79a3d); letter-spacing: 1px; }

.teams-panel {
  background: var(--panel, #1c1a16);
  border: 1px solid var(--border, #2e2a23);
  border-radius: 12px;
  padding: 16px 18px;
}
.teams-panel-title { margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted, #9a9183); }

.teams-members, .teams-invites { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.teams-member, .teams-invite { display: flex; align-items: center; gap: 10px; }
.teams-avatar {
  display: grid; place-items: center;
  width: 32px; height: 32px; border-radius: 50%;
  background: color-mix(in srgb, var(--accent, #d79a3d) 25%, var(--panel, #1c1a16));
  font-size: 13px; font-weight: 600; overflow: hidden; flex: none;
}
.teams-avatar img { width: 100%; height: 100%; object-fit: cover; }
.teams-member-name, .teams-invite-email { flex: 1; font-size: 14px; }
.teams-you { color: var(--text-muted, #9a9183); }
.teams-role-badge { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted, #9a9183); }
.teams-invite-pending { font-size: 11px; color: var(--accent, #d79a3d); }
.teams-remove {
  background: none; border: none; color: var(--text-muted, #9a9183);
  font-size: 18px; line-height: 1; cursor: pointer; padding: 0 4px;
}
.teams-remove:hover { color: var(--danger, #e88); }

.teams-form-row { display: flex; gap: 8px; align-items: center; }
.teams-input { flex: 1; }
.teams-btn {
  background: var(--panel, #1c1a16);
  color: var(--text, #ece6da);
  border: 1px solid var(--border, #2e2a23);
  border-radius: 8px; padding: 7px 16px; font: inherit; cursor: pointer;
}
.teams-btn.primary { background: var(--accent, #d79a3d); border-color: var(--accent, #d79a3d); color: #1a1308; font-weight: 600; }
.teams-btn:disabled { opacity: .5; cursor: default; }

.teams-empty { display: flex; flex-wrap: wrap; gap: 20px; max-width: 720px; margin: 40px auto; padding: 0 20px; }
.teams-empty-card, .teams-upsell-card {
  flex: 1; min-width: 280px;
  background: var(--panel, #1c1a16);
  border: 1px solid var(--border, #2e2a23);
  border-radius: 14px; padding: 22px;
}
.teams-empty-card h2, .teams-upsell-card h2 { margin: 0 0 6px; font-size: 18px; }
.teams-empty-card p, .teams-upsell-card p { margin: 0 0 14px; color: var(--text-muted, #9a9183); font-size: 14px; }
.teams-upsell { display: grid; place-items: center; flex: 1; }
.teams-upsell-card { max-width: 420px; text-align: center; }
.teams-upsell-card .teams-core { margin: 0 auto 14px; }
.teams-upsell-tier { color: var(--text, #ece6da) !important; }
.teams-upsell-tier strong { color: var(--accent, #d79a3d); }
```

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "style(teams): Teams view styling"
```


### Task 6: Verify and manually smoke-test

**Files:** none (verification).

- [ ] **Step 1: Type-check + full test suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests pass (the 199 from Plan 2; this plan adds no unit tests — it's UI).

- [ ] **Step 2: Lint (if configured)**

Run: `npm run lint`
Expected: no new errors in `src/teams/**` or the modified files. (If there is no `lint`
script, skip.)

- [ ] **Step 3: Manual smoke test (the visible payoff)**

Start the app: `npm run tauri dev`. Signed in as a **Team-tier** user:
1. Click the **Teams** button (toolbar, beside the taskboard icon, or on the start page).
2. The empty state shows. Create an org ("Acme") → the hero, your owner row, and the
   join code appear.
3. Invite `someone@example.com` → it appears under pending invites; revoke it.
4. Back out and reopen Teams → the org persists (loaded from Supabase).

As a **non-Team** user (set `publicMetadata.tier` to `free` in Clerk), the Teams button
still appears (with a "Team" pill on the start page) and the view shows the upgrade panel.

Expected: all four steps work; data round-trips through Supabase under RLS.

- [ ] **Step 4: No extra commit** (covered by Tasks 1–5).


## Done criteria (Plan 3)

- A **Teams** button sits beside the taskboard button in the wall toolbar and on the
  start page; both open the Teams view.
- Team-tier users can create an org, see the hero + members + join code, invite/revoke,
  switch orgs, and the data persists via Supabase.
- Non-Team users see an inline upgrade panel (no hard wall) and a "Team" pill.
- `tsc` clean; full test suite passes.

**Next:** Plan 4 — Presence + Solar System (replace the members list with the orbiting
avatar visualization, live status via Realtime presence, hover status lines, current/last
space).

