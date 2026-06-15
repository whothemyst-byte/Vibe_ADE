# Teams: Full-bleed Orbit, Settings-housed Management & Open-space — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the Teams orbit to a responsive full-bleed space, move its
management panels into the main Settings modal as gated sections, and add an
"Open <space>" hover affordance for teammates working in shared org projects.

**Architecture:** Pure frontend (React + Zustand). `orbit.ts` gains radius
scaling; `SolarSystem` measures its container and fills it; the five panels in
`TeamsView` move into new panes inside `src/settings/SettingsModal.tsx`, gated by
`canUseTeams` + a current org. `SettingsModal` gains an optional `background`
(space-only sections hide when absent) and `initialSection`. Presence carries the
shared `orgSpaceId` so the orbit can offer "Open space".

**Tech Stack:** React 19, Zustand, Excalidraw-adjacent CSS, Vitest, Supabase JS
(existing `useOrgStore` / presence / `spaceSync`).

Implements phases 1–3 of
`docs/superpowers/specs/2026-06-15-teams-orbit-settings-and-invites-design.md`.
Phase 4 (My Card photo) and phase 5 (invite links) are separate plans.

---

### Task 1: Scale orbit radii to a configurable max

Today `orbit.ts` hard-codes ring radii for a 560px box. Make them a fraction of a
`maxRadius` so the orbit can fill any container, keeping the current 560px layout
as the default.

**Files:**
- Modify: `src/teams/orbit.ts`
- Test: `src/teams/orbit.test.ts`

- [ ] **Step 1: Add the failing test**

Append inside the `describe("orbitPositions", …)` block in `src/teams/orbit.test.ts`:

```ts
  it("scales ring radius with the maxRadius argument", () => {
    const small = orbitPositions(1, 100)[0].radius;
    const big = orbitPositions(1, 200)[0].radius;
    expect(big).toBeCloseTo(small * 2);
    expect(small).toBeGreaterThan(0);
  });

  it("defaults to the original 560-box scale", () => {
    // ring 0 radius was 110 in the fixed layout (maxRadius 280)
    expect(orbitPositions(1)[0].radius).toBeCloseTo(110);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/teams/orbit.test.ts`
Expected: FAIL — `orbitPositions` ignores the second arg / radius differs.

- [ ] **Step 3: Implement radius scaling**

Replace the top of `src/teams/orbit.ts` (the `RING_RADIUS` constant and
`ringRadius` function) with fraction-based scaling:

```ts
export type OrbitPos = { ring: number; angle: number; radius: number };

/** Max avatars per ring, innermost first. Beyond the last, the outer ring keeps filling. */
export const RING_CAPACITY = [6, 12, 18];
/** Ring radius as a fraction of maxRadius. Mirrors the original 110/180/250 over 280. */
const RING_FRACTION = [110 / 280, 180 / 280, 250 / 280];
const DEFAULT_MAX_RADIUS = 280;

function ringRadius(ring: number, maxRadius: number): number {
  const last = RING_FRACTION.length - 1;
  const frac = ring <= last
    ? RING_FRACTION[ring]
    : Math.min(1, RING_FRACTION[last] + (ring - last) * 0.25);
  return frac * maxRadius;
}
```

Then change the signature and the `ringRadius` call:

```ts
/** Assigns each of `count` members to a ring + even angle. Angles in degrees. */
export function orbitPositions(count: number, maxRadius = DEFAULT_MAX_RADIUS): OrbitPos[] {
```

and inside the `rings.forEach`:

```ts
      out.push({ ring: r, angle: (360 / n) * i, radius: ringRadius(r, maxRadius) });
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/teams/orbit.test.ts`
Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/teams/orbit.ts src/teams/orbit.test.ts
git commit -m "feat(teams): scale orbit radii to a configurable maxRadius"
```

---

### Task 2: Make SolarSystem fill and scale to its container

Replace the fixed 560px box with a measured, responsive stage. The component
measures its own size via `ResizeObserver`, derives `maxRadius`, and renders one
ring per used radius.

**Files:**
- Modify: `src/teams/SolarSystem.tsx`

- [ ] **Step 1: Add a size hook and responsive geometry**

Replace the top of `src/teams/SolarSystem.tsx` (imports through the `SIZE`/`C`
constants and the start of the component) with:

```tsx
import { useEffect, useRef, useState } from "react";
import { type Member, type Org } from "./orgStore";
import { usePresenceStore } from "./presence";
import { orbitPositions } from "./orbit";
import { statusLine } from "./presenceHelpers";

const MIN_SIZE = 360;       // never shrink the orbit below this
const AVATAR_HALF = 26;     // keep outer avatars off the edge

export function SolarSystem({ org, members, myId }: { org: Org; members: Member[]; myId: string | null }) {
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

  const C = size / 2;
  const maxRadius = C - AVATAR_HALF;
  const positions = orbitPositions(members.length, maxRadius);
  const ringRadii = [...new Set(positions.map((p) => p.radius))];
  const monogram = org.name.trim().charAt(0).toUpperCase() || "?";
```

- [ ] **Step 2: Make the stage fill the parent and render dynamic rings**

Replace the `return ( … )` JSX. The outer element becomes a full-size stage that
centers a `size`×`size` solar box; rings are derived from `ringRadii`:

```tsx
  return (
    <div ref={stageRef} className="solar-stage">
      <div className="solar" style={{ width: size, height: size }}>
        <div className="solar-rings" aria-hidden>
          {ringRadii.map((r) => (
            <span key={r} style={{ width: r * 2, height: r * 2 }} />
          ))}
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
    </div>
  );
}
```

- [ ] **Step 3: Add the stage style**

In `src/App.css`, just above the `/* ── Solar system ─ */` block, add:

```css
.solar-stage { position: absolute; inset: 0; display: grid; place-items: center; }
```

and change the existing `.solar` rule from `margin: 6px auto 4px;` to:

```css
.solar { position: relative; }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/teams/SolarSystem.tsx src/App.css
git commit -m "feat(teams): orbit fills and scales to its container"
```

---
### Task 3: Carry the shared org-space id through presence

So the orbit can offer "Open space" for a teammate currently in a shared
project, presence must report the `org_space` id (not just the local id).

**Files:**
- Modify: `src/teams/presence.ts`
- Modify: `src/wall/WallView.tsx:214-223`

- [ ] **Step 1: Add `orgSpaceId` to the roster entry + self payload**

In `src/teams/presence.ts`, extend `RosterEntry`:

```ts
export type RosterEntry = {
  status: LiveStatus;
  spaceId: string | null;
  spaceName: string | null;
  orgSpaceId: string | null;
  manualStatus: string | null;
  manualEmoji: string | null;
};
```

Add `orgSpaceId` to the `self` object:

```ts
const self = {
  spaceId: null as string | null,
  spaceName: null as string | null,
  orgSpaceId: null as string | null,
  manualStatus: null as string | null,
  manualEmoji: null as string | null,
};
```

Include it in `selfPayload()`:

```ts
    spaceId: self.spaceId,
    spaceName: self.spaceName,
    orgSpaceId: self.orgSpaceId,
```

Update `setPresenceSpace` to accept it:

```ts
/** Update the space the user is currently in (null when not in a space). */
export function setPresenceSpace(
  spaceId: string | null,
  spaceName: string | null,
  orgSpaceId: string | null = null,
): void {
  self.spaceId = spaceId;
  self.spaceName = spaceName;
  self.orgSpaceId = orgSpaceId;
  lastActivity = Date.now();
  retrack();
}
```

- [ ] **Step 2: Report the shared id from WallView**

In `src/wall/WallView.tsx`, the presence effect currently reads the index to get
the space name. Pass the meta's `sharedOrgSpaceId` too. Replace the body of that
effect (the `loadIndex().then` block, ~lines 215-221) with:

```tsx
    void loadIndex().then((idx) => {
      if (cancelled) return;
      const meta = idx.find((w) => w.id === wallId);
      const name = meta?.name ?? "space";
      setPresenceSpace(wallId, name, meta?.sharedOrgSpaceId ?? null);
      void useOrgStore.getState().recordSpaceActivity(wallId, name);
    });
```

- [ ] **Step 3: Type-check + existing presence tests**

Run: `npx tsc --noEmit && npx vitest run src/teams/presenceHelpers.test.ts`
Expected: no type errors; presence-helper tests still PASS (they don't touch the
new field).

- [ ] **Step 4: Commit**

```bash
git add src/teams/presence.ts src/wall/WallView.tsx
git commit -m "feat(teams): carry shared org-space id through presence"
```

---

### Task 4: SettingsModal scaffolding — optional background, initialSection, team sections

Prepare `SettingsModal` to host team panes: make `background` optional (space-only
sections hide when absent), accept `initialSection`, and register the five team
sections gated by `canUseTeams` + a current org. Pane bodies land in Tasks 5–9;
this task wires the shell with placeholder panes so it compiles and renders.

**Files:**
- Modify: `src/settings/SettingsModal.tsx`

- [ ] **Step 1: Extend the Section union and SECTIONS list**

In `src/settings/SettingsModal.tsx`, replace the `Section` type and `SECTIONS`
constant (lines 13-23) with team-aware versions:

```tsx
type Section =
  | "account" | "agents" | "terminal" | "themes" | "canvas" | "vibe" | "about"
  | "organization" | "members" | "invites" | "projects" | "mycard";

const APP_SECTIONS: { key: Section; label: string; icon: () => React.ReactElement }[] = [
  { key: "account", label: "Account", icon: UserIcon },
  { key: "agents", label: "Agents", icon: SelectIcon },
  { key: "terminal", label: "Terminal", icon: RectangleIcon },
  { key: "themes", label: "Themes", icon: PaletteIcon },
  { key: "canvas", label: "Canvas", icon: ImageIcon },
  { key: "vibe", label: "Vibe", icon: EllipseIcon },
  { key: "about", label: "About", icon: EllipseIcon },
];

const TEAM_SECTIONS: { key: Section; label: string; icon: () => React.ReactElement }[] = [
  { key: "organization", label: "Organization", icon: TeamsIcon },
  { key: "members", label: "Members", icon: UserIcon },
  { key: "invites", label: "Invites", icon: PlusIcon },
  { key: "projects", label: "Projects", icon: GridIcon },
  { key: "mycard", label: "My Card", icon: EllipseIcon },
];

/** Space-scoped sections that only make sense with an active wall. */
const SPACE_ONLY: Section[] = ["themes", "canvas"];
```

Update the icon import line (line 9) to add `TeamsIcon` and `GridIcon`:

```tsx
import { CloseIcon, EllipseIcon, GearIcon, GridIcon, ImageIcon, PaletteIcon, PlusIcon, RectangleIcon, SelectIcon, TeamsIcon, UserIcon } from "../wall/icons";
```

Add these imports near the top (after the existing imports):

```tsx
import { useEntitlements } from "../entitlements";
import { useOrgStore } from "../teams/orgStore";
```

- [ ] **Step 2: Add placeholder team panes**

Add these stub components above `SettingsModal` (filled in Tasks 5–9):

```tsx
function OrganizationPane() { return <><h2 className="set-title">Organization</h2></>; }
function MembersPane() { return <><h2 className="set-title">Members</h2></>; }
function InvitesPane() { return <><h2 className="set-title">Invites</h2></>; }
function ProjectsPane({ onOpenWall }: { onOpenWall?: (id: string) => void }) {
  void onOpenWall; return <><h2 className="set-title">Projects</h2></>;
}
function MyCardPane() { return <><h2 className="set-title">My Card</h2></>; }
```

- [ ] **Step 3: Rework the SettingsModal signature and body**

Replace the `SettingsModal` function (lines 354-395) with:

```tsx
export function SettingsModal({ background, onChangeBackground, onClose, initialSection, onOpenWall }: {
  background?: Background;
  onChangeBackground?: (bg: Background) => void;
  onClose: () => void;
  initialSection?: Section;
  onOpenWall?: (id: string) => void;
}) {
  const ent = useEntitlements();
  const hasOrg = useOrgStore((s) => s.currentOrgId != null);
  const showTeam = ent.canUseTeams && hasOrg;

  const sections = [
    ...APP_SECTIONS.filter((s) => background != null || !SPACE_ONLY.includes(s.key)),
    ...(showTeam ? TEAM_SECTIONS : []),
  ];
  const [section, setSection] = useState<Section>(
    initialSection && sections.some((s) => s.key === initialSection) ? initialSection : "agents",
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="settings-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-modal" role="dialog" aria-label="Settings">
        <aside className="settings-side">
          <span className="settings-head"><GearIcon /> Settings</span>
          {sections.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`settings-item${section === key ? " active" : ""}`}
              onClick={() => setSection(key)}
            >
              <Icon /> {label}
            </button>
          ))}
        </aside>
        <section className="settings-pane">
          <button className="settings-close" title="Close" onClick={onClose}><CloseIcon /></button>
          {section === "account" && <AccountPane />}
          {section === "agents" && <AgentsPane />}
          {section === "terminal" && <TerminalPane />}
          {section === "themes" && background != null && onChangeBackground && <ThemesPane background={background} onChangeBackground={onChangeBackground} />}
          {section === "canvas" && <CanvasPane />}
          {section === "vibe" && <VibePane />}
          {section === "about" && <AboutPane />}
          {section === "organization" && <OrganizationPane />}
          {section === "members" && <MembersPane />}
          {section === "invites" && <InvitesPane />}
          {section === "projects" && <ProjectsPane onOpenWall={onOpenWall} />}
          {section === "mycard" && <MyCardPane />}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check (WallView still passes background, so unaffected)**

Run: `npx tsc --noEmit`
Expected: no errors. `WallView` still calls `<SettingsModal background=… onChangeBackground=… onClose=… />`, all now-optional-but-present.

- [ ] **Step 5: Commit**

```bash
git add src/settings/SettingsModal.tsx
git commit -m "feat(settings): optional background + initialSection + gated team sections"
```

---
### Task 5: Invite-link util + Organization pane

**Files:**
- Create: `src/teams/inviteLink.ts`
- Test: `src/teams/inviteLink.test.ts`
- Modify: `src/settings/SettingsModal.tsx`

- [ ] **Step 1: Write the failing test**

`src/teams/inviteLink.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { inviteLinkFor, JOIN_BASE } from "./inviteLink";

describe("inviteLinkFor", () => {
  it("builds a quansynd.com join URL from a code", () => {
    expect(inviteLinkFor("AB12CD")).toBe(`${JOIN_BASE}/AB12CD`);
  });
  it("url-encodes the code", () => {
    expect(inviteLinkFor("a b")).toBe(`${JOIN_BASE}/a%20b`);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/teams/inviteLink.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the util**

`src/teams/inviteLink.ts`:

```ts
/** Public landing page that deep-links into the app (see the invite-link plan). */
export const JOIN_BASE = "https://quansynd.com/join";

/** Shareable invite link carrying an org's reusable join code. */
export function inviteLinkFor(joinCode: string): string {
  return `${JOIN_BASE}/${encodeURIComponent(joinCode)}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/teams/inviteLink.test.ts`
Expected: PASS.

- [ ] **Step 5: Add imports + replace the OrganizationPane stub**

In `src/settings/SettingsModal.tsx`, add imports:

```tsx
import { currentUserId } from "../teams/identity";
import { inviteLinkFor } from "../teams/inviteLink";
```

Replace the `OrganizationPane` stub from Task 4 with:

```tsx
function OrganizationPane() {
  const orgs = useOrgStore((s) => s.orgs);
  const currentOrgId = useOrgStore((s) => s.currentOrgId);
  const members = useOrgStore((s) => s.members);
  const org = orgs.find((o) => o.id === currentOrgId) ?? null;
  const myId = currentUserId();
  const myRole = members.find((m) => m.user_id === myId)?.role ?? null;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  if (!org) return null;
  const copy = (kind: "code" | "link", text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <>
      <h2 className="set-title">Organization</h2>
      <p className="set-sub">{members.length} {members.length === 1 ? "member" : "members"}.</p>
      <div className="set-row"><span className="set-label">Name</span><span>{org.name}</span></div>
      {isAdmin && (
        <>
          <div className="set-row">
            <span className="set-label">Join code</span>
            <button className="teams-code" onClick={() => copy("code", org.join_code)}>
              <strong>{org.join_code}</strong> {copied === "code" ? "✓" : "⧉"}
            </button>
          </div>
          <div className="set-row">
            <span className="set-label">Invite link</span>
            <button className="set-btn" onClick={() => copy("link", inviteLinkFor(org.join_code))}>
              {copied === "link" ? "Copied ✓" : "Copy invite link"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc --noEmit && npx vitest run src/teams/inviteLink.test.ts`
Expected: no errors; PASS.

```bash
git add src/teams/inviteLink.ts src/teams/inviteLink.test.ts src/settings/SettingsModal.tsx
git commit -m "feat(teams): invite-link util + Organization settings pane"
```

---

### Task 6: Members pane

Move `MembersPanel`'s logic into `MembersPane`, reading from the store.

**Files:**
- Modify: `src/settings/SettingsModal.tsx`

- [ ] **Step 1: Replace the MembersPane stub**

```tsx
function MembersPane() {
  const members = useOrgStore((s) => s.members);
  const orgId = useOrgStore((s) => s.currentOrgId);
  const setRole = useOrgStore((s) => s.setRole);
  const removeMember = useOrgStore((s) => s.removeMember);
  const myId = currentUserId();
  const myRole = members.find((m) => m.user_id === myId)?.role ?? null;
  const isAdmin = myRole === "owner" || myRole === "admin";
  if (!orgId) return null;
  return (
    <>
      <h2 className="set-title">Members</h2>
      <p className="set-sub">Everyone in this organization.</p>
      <ul className="teams-members">
        {members.map((m) => {
          const name = m.display_name || m.user_id;
          const initial = (m.display_name || "?").trim().charAt(0).toUpperCase();
          const isMe = m.user_id === myId;
          return (
            <li key={m.user_id} className="teams-member">
              <span className="teams-avatar">{m.avatar_url ? <img src={m.avatar_url} alt="" /> : initial}</span>
              <span className="teams-member-name">{name}{isMe && <span className="teams-you"> (you)</span>}</span>
              {isAdmin && !isMe ? (
                <select className="teams-role" value={m.role}
                  onChange={(e) => void setRole(orgId, m.user_id, e.target.value as "owner" | "admin" | "member")}>
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
              ) : (
                <span className="teams-role-badge">{m.role}</span>
              )}
              {isAdmin && !isMe && (
                <button className="teams-remove" title="Remove member" onClick={() => void removeMember(orgId, m.user_id)}>×</button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/settings/SettingsModal.tsx
git commit -m "feat(teams): Members settings pane"
```

---

### Task 7: Invites pane

Move `InvitesPanel` into `InvitesPane`; admins get the invite form + revoke + a
copy-invite-link button, non-admins see a read-only note.

**Files:**
- Modify: `src/settings/SettingsModal.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { isValidEmail } from "../teams/orgHelpers";
```

- [ ] **Step 2: Replace the InvitesPane stub**

```tsx
function InvitesPane() {
  const orgId = useOrgStore((s) => s.currentOrgId);
  const orgs = useOrgStore((s) => s.orgs);
  const members = useOrgStore((s) => s.members);
  const invites = useOrgStore((s) => s.invites);
  const invite = useOrgStore((s) => s.invite);
  const revokeInvite = useOrgStore((s) => s.revokeInvite);
  const org = orgs.find((o) => o.id === orgId) ?? null;
  const myRole = members.find((m) => m.user_id === currentUserId())?.role ?? null;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!orgId || !org) return null;
  if (!isAdmin) {
    return (
      <>
        <h2 className="set-title">Invites</h2>
        <p className="set-sub">Only owners and admins can invite people.</p>
      </>
    );
  }
  const valid = isValidEmail(email);
  return (
    <>
      <h2 className="set-title">Invites</h2>
      <p className="set-sub">Invite by email, or share the invite link.</p>
      <div className="set-row">
        <span className="set-label">Invite link</span>
        <button className="set-btn" onClick={() => {
          void navigator.clipboard.writeText(inviteLinkFor(org.join_code));
          setCopied(true); setTimeout(() => setCopied(false), 1500);
        }}>{copied ? "Copied ✓" : "Copy invite link"}</button>
      </div>
      <div className="teams-form-row">
        <input className="teams-input" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="teams-role" value={role} onChange={(e) => setRole(e.target.value as "admin" | "member")}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button className="teams-btn primary" disabled={busy || !valid}
          onClick={async () => { setBusy(true); try { await invite(orgId, email.trim(), role); setEmail(""); } finally { setBusy(false); } }}>
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
              <button className="teams-remove" title="Revoke invite" onClick={() => void revokeInvite(inv.id)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/settings/SettingsModal.tsx
git commit -m "feat(teams): Invites settings pane"
```

---

### Task 8: Projects pane

Move `ProjectsPanel` into `ProjectsPane`. "Open" calls the passed `onOpenWall`.

**Files:**
- Modify: `src/settings/SettingsModal.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { loadIndex } from "../store/persistence";
import type { WallMeta } from "../store/types";
import { publishLocalSpace, openSharedSpace, unpublishSharedSpace } from "../teams/spaceSync";
```

- [ ] **Step 2: Replace the ProjectsPane stub**

```tsx
function ProjectsPane({ onOpenWall }: { onOpenWall?: (id: string) => void }) {
  const orgId = useOrgStore((s) => s.currentOrgId);
  const members = useOrgStore((s) => s.members);
  const projects = useOrgStore((s) => s.projects);
  const loadProjects = useOrgStore((s) => s.loadProjects);
  const myId = currentUserId();
  const myRole = members.find((m) => m.user_id === myId)?.role ?? null;
  const isAdmin = myRole === "owner" || myRole === "admin";
  const [locals, setLocals] = useState<WallMeta[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadIndex().then((idx) => setLocals(idx.filter((w) => w.sharedOrgSpaceId == null)));
  }, [projects]);

  if (!orgId) return null;
  const share = async () => {
    if (!pick) return;
    setBusy(true);
    try { await publishLocalSpace(pick, orgId); await loadProjects(orgId); setPick(""); } finally { setBusy(false); }
  };
  const open = async (id: string) => {
    setBusy(true);
    try { onOpenWall?.(await openSharedSpace(id)); } finally { setBusy(false); }
  };
  const unpublish = async (id: string) => {
    setBusy(true);
    try { await unpublishSharedSpace(id); await loadProjects(orgId); } finally { setBusy(false); }
  };
  return (
    <>
      <h2 className="set-title">Projects</h2>
      <p className="set-sub">Spaces shared to this organization.</p>
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
    </>
  );
}
```

- [ ] **Step 3: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/settings/SettingsModal.tsx
git commit -m "feat(teams): Projects settings pane"
```

---
### Task 9: My Card pane (+ store action)

The self-status editor, modeled on the reference screenshot's "Community" pane:
username, emoji fallback grid, status line, and mood. Photo upload is deferred to
the My-Card-photo plan. Add a store action that writes `display_name`,
`manual_status`, and `manual_status_emoji` in one call.

**Files:**
- Modify: `src/teams/orgStore.ts`
- Modify: `src/settings/SettingsModal.tsx`

- [ ] **Step 1: Add `setMyCard` to the store type**

In `src/teams/orgStore.ts`, add to the `OrgStore` type (next to `setMyStatus`):

```ts
  setMyCard: (patch: { display_name?: string; manual_status?: string | null; manual_status_emoji?: string | null }) => Promise<void>;
```

- [ ] **Step 2: Implement `setMyCard`**

In `src/teams/orgStore.ts`, add after the `setMyStatus` implementation:

```ts
  setMyCard: async (patch) => {
    const orgId = get().currentOrgId;
    const me = currentUserId();
    if (!orgId || !me) return;
    const { error } = await supabase
      .from("org_member")
      .update(patch)
      .eq("org_id", orgId)
      .eq("user_id", me);
    if (error) throw new Error(error.message);
    await get().loadMembers(orgId);
  },
```

- [ ] **Step 3: Replace the MyCardPane stub**

In `src/settings/SettingsModal.tsx`, add the import:

```tsx
import { setPresenceManualStatus } from "../teams/presence";
```

Replace the `MyCardPane` stub with:

```tsx
const CARD_EMOJI = ["🧠","🚀","⚡","🔥","🌟","🎧","☕","🐛","🛠️","🎯","🌙","🧪","📦","🔭","🦊","🐢","🧩","🎨","💤","🌈"];

function MyCardPane() {
  const members = useOrgStore((s) => s.members);
  const setMyCard = useOrgStore((s) => s.setMyCard);
  const me = members.find((m) => m.user_id === currentUserId());
  const [name, setName] = useState(me?.display_name ?? "");
  const [status, setStatus] = useState(me?.manual_status ?? "");
  const [emoji, setEmoji] = useState(me?.manual_status_emoji ?? "");
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const saveName = async () => {
    const display = name.trim();
    if (!display || display === me.display_name) return;
    setBusy(true); try { await setMyCard({ display_name: display }); } finally { setBusy(false); }
  };
  const saveStatus = async () => {
    setBusy(true);
    try {
      const t = status.trim() || null;
      const em = emoji.trim() || null;
      await setMyCard({ manual_status: t, manual_status_emoji: em });
      setPresenceManualStatus(t, em);
    } finally { setBusy(false); }
  };
  const pickEmoji = async (em: string) => {
    setEmoji(em);
    setBusy(true);
    try { await setMyCard({ manual_status_emoji: em }); setPresenceManualStatus(status.trim() || null, em); }
    finally { setBusy(false); }
  };

  return (
    <>
      <h2 className="set-title">My Card</h2>
      <p className="set-sub">How you appear to teammates in the orbit.</p>
      <div className="set-row">
        <span className="set-label">Username</span>
        <input className="set-input" value={name} placeholder="what should people call you"
          onChange={(e) => setName(e.target.value)} onBlur={() => void saveName()} />
      </div>
      <div className="set-group">
        <span className="set-label">Emoji / mood</span>
        <div className="mycard-emoji">
          {CARD_EMOJI.map((em) => (
            <button key={em} className={`mycard-emoji-btn${emoji === em ? " active" : ""}`}
              disabled={busy} onClick={() => void pickEmoji(em)}>{em}</button>
          ))}
        </div>
      </div>
      <div className="set-row">
        <span className="set-label">Status line</span>
        <input className="set-input" value={status} placeholder="shipping the thing"
          onChange={(e) => setStatus(e.target.value)} onBlur={() => void saveStatus()} />
      </div>
    </>
  );
}
```

- [ ] **Step 4: Add emoji-grid styles**

In `src/App.css`, append near the other `.set-*` rules:

```css
.mycard-emoji { display: grid; grid-template-columns: repeat(9, 1fr); gap: 6px; }
.mycard-emoji-btn {
  display: grid; place-items: center; aspect-ratio: 1; font-size: 18px;
  background: var(--surface-2); border: 1px solid var(--rule);
  border-radius: var(--radius-sm); cursor: pointer;
}
.mycard-emoji-btn:hover { background: rgba(243, 238, 229, .06); }
.mycard-emoji-btn.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
```

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/teams/orgStore.ts src/settings/SettingsModal.tsx src/App.css
git commit -m "feat(teams): My Card settings pane + setMyCard action"
```

---

### Task 10: TeamsView becomes a full-bleed orbit with a settings gear

Remove the five panels from `TeamsView`; the body becomes the orbit stage. Add a
gear button (and org-core click) that opens `SettingsModal` at the relevant
section. Empty state stays.

**Files:**
- Modify: `src/teams/TeamsView.tsx`
- Modify: `src/teams/SolarSystem.tsx` (core click → open settings)

- [ ] **Step 1: Rewrite TeamsView**

Replace the entire body of `src/teams/TeamsView.tsx` with the version below.
`OrgHero`, `MyStatusBar`, `MembersPanel`, `InvitesPanel`, `ProjectsPanel` and
their now-unused imports are deleted (they live in `SettingsModal` panes now).
`TeamsEmptyState` stays.

```tsx
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
```

Keep the existing `TeamsEmptyState` function exactly as it is (it uses
`useState`, `useOrgStore`'s `createOrg`/`joinByCode`). Delete `OrgHero`,
`MyStatusBar`, `MembersPanel`, `InvitesPanel`, `ProjectsPanel`.

- [ ] **Step 2: Make the org core open settings**

In `src/teams/SolarSystem.tsx`, add `onOpenSettings` to the props and wire the
core. Update the signature:

```tsx
export function SolarSystem({ org, members, myId, onOpenSpace, onOpenSettings }: {
  org: Org; members: Member[]; myId: string | null;
  onOpenSpace?: (orgSpaceId: string) => void;
  onOpenSettings?: () => void;
}) {
```

(`onOpenSpace` is consumed in Task 11.) Make the core a button:

```tsx
        <button className="solar-core" title={`${org.name} — settings`} onClick={() => onOpenSettings?.()}>
          {org.logo_url ? <img src={org.logo_url} alt="" /> : <span>{monogram}</span>}
        </button>
```

In `src/App.css`, ensure the core works as a button by adding `border: none;` and
`cursor: pointer;` to the `.solar-core` rule.

- [ ] **Step 3: Type-check + run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/teams/TeamsView.tsx src/teams/SolarSystem.tsx src/App.css
git commit -m "feat(teams): full-bleed orbit view; management moves to settings"
```

---

### Task 11: "Open space" hover affordance

When a teammate is currently in a shared org project (live presence carries its
`orgSpaceId`), or their last space was one they published (matched by
`local_origin_id`), show an "Open <name>" button in their orbit tooltip.

**Files:**
- Modify: `src/teams/SolarSystem.tsx`
- Create: `src/teams/openableSpace.ts`
- Test: `src/teams/openableSpace.test.ts`

- [ ] **Step 1: Write the failing test**

`src/teams/openableSpace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { openableSpaceFor } from "./openableSpace";
import type { Project } from "./orgStore";

const proj = (over: Partial<Project>): Project => ({
  id: "s1", org_id: "o1", local_origin_id: null, name: "Redesign",
  owner_user_id: "u1", thumb_url: null, content_path: "", background: null,
  version: 1, updated_at: "", updated_by: "u1", ...over,
} as Project);

describe("openableSpaceFor", () => {
  it("matches the live orgSpaceId to a project", () => {
    const p = proj({ id: "s1" });
    const got = openableSpaceFor({ liveOrgSpaceId: "s1", lastSpaceId: null, userId: "u1" }, [p]);
    expect(got).toBe(p);
  });
  it("falls back to a published last space by local_origin_id + owner", () => {
    const p = proj({ id: "s2", local_origin_id: "L9", owner_user_id: "u1" });
    const got = openableSpaceFor({ liveOrgSpaceId: null, lastSpaceId: "L9", userId: "u1" }, [p]);
    expect(got).toBe(p);
  });
  it("returns null when nothing matches", () => {
    expect(openableSpaceFor({ liveOrgSpaceId: null, lastSpaceId: "x", userId: "u1" }, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/teams/openableSpace.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the matcher**

`src/teams/openableSpace.ts`:

```ts
import type { Project } from "./orgStore";

/** Resolve which shared project (if any) a member's current/last space maps to. */
export function openableSpaceFor(
  m: { liveOrgSpaceId: string | null; lastSpaceId: string | null; userId: string },
  projects: Project[],
): Project | null {
  if (m.liveOrgSpaceId) {
    const live = projects.find((p) => p.id === m.liveOrgSpaceId);
    if (live) return live;
  }
  if (m.lastSpaceId) {
    const last = projects.find((p) => p.local_origin_id === m.lastSpaceId && p.owner_user_id === m.userId);
    if (last) return last;
  }
  return null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/teams/openableSpace.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the affordance into the tooltip**

In `src/teams/SolarSystem.tsx`, import the matcher and the store's projects:

```tsx
import { useOrgStore } from "./orgStore";
import { openableSpaceFor } from "./openableSpace";
```

Inside the component, read projects:

```tsx
  const projects = useOrgStore((s) => s.projects);
```

Inside the `members.map`, after computing `live`, compute the openable project
and render a button in the tooltip. Replace the `<div className="solar-tip">…`
block with:

```tsx
                <div className="solar-tip">
                  <strong>{name}{m.user_id === myId ? " (you)" : ""}</strong>
                  <span>{line}</span>
                  {(() => {
                    const sp = openableSpaceFor(
                      { liveOrgSpaceId: live?.orgSpaceId ?? null, lastSpaceId: m.last_space_id, userId: m.user_id },
                      projects,
                    );
                    return sp ? (
                      <button className="solar-open" onClick={(e) => { e.stopPropagation(); onOpenSpace?.(sp.id); }}>
                        Open {sp.name}
                      </button>
                    ) : null;
                  })()}
                </div>
```

- [ ] **Step 6: Add the button style**

In `src/App.css`, append in the solar-system block:

```css
.solar-open {
  margin-top: 6px; padding: 4px 10px; font: inherit; font-size: 12px;
  background: var(--accent); color: var(--on-accent); border: none;
  border-radius: var(--radius-sm); cursor: pointer; pointer-events: auto;
}
```

Ensure the tooltip allows pointer events on hover — confirm `.solar-tip` doesn't
set `pointer-events: none`; if it does, override it to `auto` on `.solar-avatar:hover .solar-tip`.

- [ ] **Step 7: Type-check + full suite + commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS.

```bash
git add src/teams/SolarSystem.tsx src/teams/openableSpace.ts src/teams/openableSpace.test.ts src/App.css
git commit -m "feat(teams): Open-space hover affordance in the orbit"
```

---

## Self-review notes

- **Spec coverage:** §1 full-bleed orbit → Tasks 1,2,10; §2 settings panes →
  Tasks 4–9; §C/§3-presence open-space → Tasks 3,11. Invite-link *generation*
  (copy button) is here (Tasks 5,7); the deep-link handler + landing page are the
  separate invite-link plan. My Card **photo** is the separate photo plan.
- **Manual verification (after Task 11):** run `npm run tauri dev`; as a Team-tier
  user, open Teams → orbit fills the window and rotates; gear and org-core open
  Settings with team sections and no Themes/Canvas; edit My Card and confirm the
  orbit updates; hover a teammate in a shared space → "Open <space>" opens it.
- **No schema changes** in this plan (presence `orgSpaceId` is ephemeral Realtime
  state, not a DB column).




