# Teams Collaboration — Plan 4: Presence + Solar System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat members list with the **solar-system view** — the org logo at the center, member avatars orbiting on concentric rings with a gentle rotation, each showing a live status ring and, on hover, a resolved status line ("Online · in *Redesign*"). Powered by a Supabase **Realtime presence** channel plus `org_member` "last space" writes, with an optional manual custom status.

**Architecture:** A presence runtime (`presence.ts`) joins `org:<id>`, tracks the signed-in user's `{ status, currentSpace, manualStatus }`, and exposes the live roster via a zustand store. Auto status (online/idle/offline) is derived from window visibility + input recency. The current space is fed in from `App`/`WallView`; on every space open we also persist `last_space_*` + `last_active_at` to `org_member` (offline members still show "last worked in …"). Pure helpers (status-line composition, orbit layout) are unit-tested; the channel and the `SolarSystem` component are integration/visual.

**Tech Stack:** Supabase Realtime presence (`@supabase/supabase-js` 2.108, the Clerk-token client from Plan 1), zustand, React, rAF, the existing icon/CSS conventions.

**Spec:** `docs/superpowers/specs/2026-06-15-vibe-space-teams-collab-design.md` (Section 4 — presence, status resolution, the solar-system view).

**Prerequisite:** Plans 1–3 complete (orgStore, TeamsView, RLS `org_member_update_self` policy for self status writes).

---

### Task 1: Status-line helpers (pure, TDD)

The hover line is the heart of the feature; isolate its composition so it's fully
unit-tested without Realtime.

**Files:**
- Create: `src/teams/presenceHelpers.ts`
- Create: `src/teams/presenceHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/teams/presenceHelpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { agoText, deriveSelfStatus, statusLine } from "./presenceHelpers";

const NOW = 1_000_000_000_000;

describe("deriveSelfStatus", () => {
  it("is online when visible and recently active", () => {
    expect(deriveSelfStatus(true, NOW - 1000, NOW)).toBe("online");
  });
  it("is idle when visible but inactive past the threshold", () => {
    expect(deriveSelfStatus(true, NOW - 6 * 60_000, NOW)).toBe("idle");
  });
  it("is idle when the window is hidden", () => {
    expect(deriveSelfStatus(false, NOW, NOW)).toBe("idle");
  });
});

describe("agoText", () => {
  it("formats coarse durations", () => {
    expect(agoText(NOW, NOW)).toBe("just now");
    expect(agoText(NOW - 90_000, NOW)).toBe("1m ago");
    expect(agoText(NOW - 3 * 3600_000, NOW)).toBe("3h ago");
    expect(agoText(NOW - 2 * 86_400_000, NOW)).toBe("2d ago");
  });
});

describe("statusLine", () => {
  it("online in a space", () => {
    expect(statusLine({
      online: "online", currentSpaceName: "Redesign", lastSpaceName: null,
      lastActiveAt: null, manualStatus: null, manualEmoji: null, now: NOW,
    })).toBe("Online · in Redesign");
  });
  it("online with no space falls back to last worked in", () => {
    expect(statusLine({
      online: "online", currentSpaceName: null, lastSpaceName: "Redesign",
      lastActiveAt: null, manualStatus: null, manualEmoji: null, now: NOW,
    })).toBe("Online · last worked in Redesign");
  });
  it("offline shows last seen and last space", () => {
    expect(statusLine({
      online: null, currentSpaceName: null, lastSpaceName: "Redesign",
      lastActiveAt: NOW - 2 * 3600_000, manualStatus: null, manualEmoji: null, now: NOW,
    })).toBe("Offline · last seen 2h ago · last in Redesign");
  });
  it("manual status replaces the presence word and keeps location", () => {
    expect(statusLine({
      online: "online", currentSpaceName: "Redesign", lastSpaceName: null,
      lastActiveAt: null, manualStatus: "Heads-down", manualEmoji: "🎧", now: NOW,
    })).toBe("🎧 Heads-down · in Redesign");
  });
  it("plain online with nothing else", () => {
    expect(statusLine({
      online: "online", currentSpaceName: null, lastSpaceName: null,
      lastActiveAt: null, manualStatus: null, manualEmoji: null, now: NOW,
    })).toBe("Online");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/teams/presenceHelpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `src/teams/presenceHelpers.ts`:

```ts
export type LiveStatus = "online" | "idle";

const IDLE_MS = 5 * 60_000;

/** Auto status from window visibility + last input recency. */
export function deriveSelfStatus(visible: boolean, lastActivity: number, now: number): LiveStatus {
  if (!visible) return "idle";
  return now - lastActivity < IDLE_MS ? "online" : "idle";
}

/** Coarse "x ago" text for last-seen. */
export function agoText(then: number, now: number): string {
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export type StatusLineInput = {
  online: LiveStatus | null;        // null = offline
  currentSpaceName: string | null;
  lastSpaceName: string | null;
  lastActiveAt: number | null;
  manualStatus: string | null;
  manualEmoji: string | null;
  now: number;
};

/** Composes the resolved hover line, e.g. "Online · in Redesign". */
export function statusLine(i: StatusLineInput): string {
  const isPresent = i.online !== null;
  const parts: string[] = [];

  if (isPresent && i.manualStatus) {
    parts.push(i.manualEmoji ? `${i.manualEmoji} ${i.manualStatus}` : i.manualStatus);
  } else if (i.online === "online") {
    parts.push("Online");
  } else if (i.online === "idle") {
    parts.push("Idle");
  } else {
    parts.push("Offline");
  }

  if (!isPresent && i.lastActiveAt) {
    parts.push(`last seen ${agoText(i.lastActiveAt, i.now)}`);
  }

  if (isPresent && i.currentSpaceName) {
    parts.push(`in ${i.currentSpaceName}`);
  } else if (isPresent && i.lastSpaceName) {
    parts.push(`last worked in ${i.lastSpaceName}`);
  } else if (!isPresent && i.lastSpaceName) {
    parts.push(`last in ${i.lastSpaceName}`);
  }

  return parts.join(" · ");
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/teams/presenceHelpers.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/teams/presenceHelpers.ts src/teams/presenceHelpers.test.ts
git commit -m "feat(teams): presence status-line helpers"
```


### Task 2: Orbit layout helper (pure, TDD)

Distributes N avatars across concentric rings with even angular spacing. Pure, so the
visual component just consumes positions.

**Files:**
- Create: `src/teams/orbit.ts`
- Create: `src/teams/orbit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/teams/orbit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { orbitPositions, RING_CAPACITY } from "./orbit";

describe("orbitPositions", () => {
  it("returns one position per member", () => {
    expect(orbitPositions(0)).toHaveLength(0);
    expect(orbitPositions(1)).toHaveLength(1);
    expect(orbitPositions(20)).toHaveLength(20);
  });

  it("fills the inner ring first, then spills outward", () => {
    const inner = RING_CAPACITY[0];
    const pos = orbitPositions(inner + 1);
    expect(pos.slice(0, inner).every((p) => p.ring === 0)).toBe(true);
    expect(pos[inner].ring).toBe(1);
  });

  it("gives each ring a larger radius", () => {
    const pos = orbitPositions(RING_CAPACITY[0] + 2);
    const r0 = pos.find((p) => p.ring === 0)!.radius;
    const r1 = pos.find((p) => p.ring === 1)!.radius;
    expect(r1).toBeGreaterThan(r0);
  });

  it("spaces members evenly within a ring", () => {
    const pos = orbitPositions(4); // 4 on ring 0
    const angles = pos.map((p) => p.angle).sort((a, b) => a - b);
    expect(angles).toEqual([0, 90, 180, 270]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/teams/orbit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the layout**

Create `src/teams/orbit.ts`:

```ts
export type OrbitPos = { ring: number; angle: number; radius: number };

/** Max avatars per ring, innermost first. Beyond the last, the outer ring keeps filling. */
export const RING_CAPACITY = [6, 12, 18];
const RING_RADIUS = [110, 180, 250];

function ringRadius(ring: number): number {
  return RING_RADIUS[ring] ?? RING_RADIUS[RING_RADIUS.length - 1] + (ring - RING_RADIUS.length + 1) * 70;
}

/** Assigns each of `count` members to a ring + even angle. Angles in degrees. */
export function orbitPositions(count: number): OrbitPos[] {
  // Bucket indices into rings by capacity.
  const rings: number[] = [];
  let remaining = count;
  let ring = 0;
  while (remaining > 0) {
    const cap = RING_CAPACITY[ring] ?? RING_CAPACITY[RING_CAPACITY.length - 1];
    const take = Math.min(cap, remaining);
    rings.push(take);
    remaining -= take;
    ring += 1;
  }
  const out: OrbitPos[] = [];
  rings.forEach((n, r) => {
    for (let i = 0; i < n; i++) {
      out.push({ ring: r, angle: (360 / n) * i, radius: ringRadius(r) });
    }
  });
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/teams/orbit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/teams/orbit.ts src/teams/orbit.test.ts
git commit -m "feat(teams): concentric orbit layout helper"
```


### Task 3: Presence runtime (`presence.ts`)

Joins the org's Realtime presence channel, tracks the signed-in user's live state, and
publishes the roster through a zustand store the `SolarSystem` subscribes to. Auto status
updates on activity/visibility and on a slow interval (to catch online→idle).

**Files:**
- Create: `src/teams/presence.ts`

- [ ] **Step 1: Write the presence runtime**

Create `src/teams/presence.ts`:

```ts
import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { getClerkToken } from "../supabase/clerkToken";
import { currentUserId } from "./identity";
import { deriveSelfStatus, type LiveStatus } from "./presenceHelpers";

export type RosterEntry = {
  status: LiveStatus;
  spaceId: string | null;
  spaceName: string | null;
  manualStatus: string | null;
  manualEmoji: string | null;
};

type PresenceStore = { roster: Record<string, RosterEntry> };
export const usePresenceStore = create<PresenceStore>(() => ({ roster: {} }));

let channel: RealtimeChannel | null = null;
let subscribed = false;
let userId: string | null = null;

const self = {
  spaceId: null as string | null,
  spaceName: null as string | null,
  manualStatus: null as string | null,
  manualEmoji: null as string | null,
};
let lastActivity = Date.now();
let visible = typeof document === "undefined" ? true : document.visibilityState === "visible";
let statusTimer: number | null = null;

function selfPayload(): RosterEntry {
  return {
    status: deriveSelfStatus(visible, lastActivity, Date.now()),
    spaceId: self.spaceId,
    spaceName: self.spaceName,
    manualStatus: self.manualStatus,
    manualEmoji: self.manualEmoji,
  };
}

function retrack() {
  if (channel && subscribed) void channel.track(selfPayload());
}

function syncRoster() {
  if (!channel) return;
  const state = channel.presenceState() as Record<string, RosterEntry[]>;
  const roster: Record<string, RosterEntry> = {};
  for (const [key, metas] of Object.entries(state)) {
    if (metas[0]) roster[key] = metas[0];
  }
  usePresenceStore.setState({ roster });
}

const onActivity = () => { lastActivity = Date.now(); };
const onVisibility = () => {
  visible = document.visibilityState === "visible";
  if (visible) lastActivity = Date.now();
  retrack();
};

function attachActivityListeners() {
  window.addEventListener("pointerdown", onActivity, { passive: true });
  window.addEventListener("keydown", onActivity, { passive: true });
  window.addEventListener("focus", onVisibility);
  window.addEventListener("blur", onVisibility);
  document.addEventListener("visibilitychange", onVisibility);
  // Slow tick so a quiet window flips online -> idle without any event.
  statusTimer = window.setInterval(retrack, 30_000);
}
function detachActivityListeners() {
  window.removeEventListener("pointerdown", onActivity);
  window.removeEventListener("keydown", onActivity);
  window.removeEventListener("focus", onVisibility);
  window.removeEventListener("blur", onVisibility);
  document.removeEventListener("visibilitychange", onVisibility);
  if (statusTimer) { window.clearInterval(statusTimer); statusTimer = null; }
}

/** Join (or re-join) the presence channel for an org. */
export async function joinOrgPresence(orgId: string): Promise<void> {
  await leavePresence();
  userId = currentUserId();
  if (!userId) return; // not signed in yet

  // Make sure Realtime carries the Clerk JWT so the channel is authorized.
  const token = await getClerkToken();
  if (token) supabase.realtime.setAuth(token);

  lastActivity = Date.now();
  visible = document.visibilityState === "visible";

  channel = supabase.channel(`org:${orgId}`, {
    config: { presence: { key: userId } },
  });
  channel.on("presence", { event: "sync" }, syncRoster);
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      subscribed = true;
      void channel!.track(selfPayload());
    }
  });
  attachActivityListeners();
}

/** Leave the current presence channel and clear the roster. */
export async function leavePresence(): Promise<void> {
  detachActivityListeners();
  if (channel) {
    try { await channel.untrack(); } catch { /* ignore */ }
    await supabase.removeChannel(channel);
  }
  channel = null;
  subscribed = false;
  usePresenceStore.setState({ roster: {} });
}

/** Update the space the user is currently in (null when not in a space). */
export function setPresenceSpace(spaceId: string | null, spaceName: string | null): void {
  self.spaceId = spaceId;
  self.spaceName = spaceName;
  lastActivity = Date.now();
  retrack();
}

/** Update the manual custom status shown to teammates. */
export function setPresenceManualStatus(text: string | null, emoji: string | null): void {
  self.manualStatus = text && text.trim() ? text.trim() : null;
  self.manualEmoji = emoji && emoji.trim() ? emoji.trim() : null;
  retrack();
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `RealtimeChannel` is not exported from the version in use,
import it as `import { type RealtimeChannel } from "@supabase/supabase-js"` — it is
exported in 2.108.)

- [ ] **Step 3: Commit**

```bash
git add src/teams/presence.ts
git commit -m "feat(teams): Realtime presence runtime + roster store"
```


### Task 4: Persist last-space + manual status (`orgStore`)

Two own-row writes (allowed by the `org_member_update_self` RLS policy): record the space
you just opened, and set your manual custom status.

**Files:**
- Modify: `src/teams/orgStore.ts`

- [ ] **Step 1: Import `currentUserId`**

Change the identity import:

```ts
import { currentProfile, currentUserId } from "./identity";
```

- [ ] **Step 2: Add the two actions to the `OrgStore` type**

In the `OrgStore` type, after `removeMember`, add:

```ts
  recordSpaceActivity: (spaceId: string, spaceName: string) => Promise<void>;
  setMyStatus: (text: string | null, emoji: string | null) => Promise<void>;
```

- [ ] **Step 3: Implement them in the store body**

After the `removeMember` implementation (before the closing `}));`), add:

```ts
  recordSpaceActivity: async (spaceId, spaceName) => {
    const orgId = get().currentOrgId;
    const me = currentUserId();
    if (!orgId || !me) return;
    // best-effort; never block opening a space on a presence write
    await supabase
      .from("org_member")
      .update({ last_space_id: spaceId, last_space_name: spaceName, last_active_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("user_id", me);
  },

  setMyStatus: async (text, emoji) => {
    const orgId = get().currentOrgId;
    const me = currentUserId();
    if (!orgId || !me) return;
    const { error } = await supabase
      .from("org_member")
      .update({ manual_status: text, manual_status_emoji: emoji })
      .eq("org_id", orgId)
      .eq("user_id", me);
    if (error) throw new Error(error.message);
    await get().loadMembers(orgId);
  },
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/teams/orgStore.ts
git commit -m "feat(teams): persist last-space activity + manual status"
```


### Task 5: Wire presence into the app lifecycle + current space

Presence must stay joined **across views** (you leave your space to look at the orbit), so
the channel lifecycle lives in the app-level `TeamsBootstrap`, keyed to the current org.
`WallView` reports the space you're in.

**Files:**
- Create: `src/teams/usePresenceLifecycle.ts`
- Modify: `src/teams/TeamsBootstrap.tsx`
- Modify: `src/wall/WallView.tsx`

- [ ] **Step 1: Write the lifecycle hook**

Create `src/teams/usePresenceLifecycle.ts`:

```ts
import { useEffect } from "react";
import { useEntitlements } from "../entitlements";
import { useOrgStore } from "./orgStore";
import { joinOrgPresence, leavePresence } from "./presence";

/** Keeps the Realtime presence channel joined for the current org, across views. */
export function usePresenceLifecycle(): void {
  const { canUseTeams } = useEntitlements();
  const currentOrgId = useOrgStore((s) => s.currentOrgId);

  useEffect(() => {
    if (!canUseTeams || !currentOrgId) return;
    void joinOrgPresence(currentOrgId);
    return () => { void leavePresence(); };
  }, [canUseTeams, currentOrgId]);
}
```

- [ ] **Step 2: Run the lifecycle hook from `TeamsBootstrap`**

In `src/teams/TeamsBootstrap.tsx`:

```tsx
import { useClaimInvites } from "./useClaimInvites";
import { usePresenceLifecycle } from "./usePresenceLifecycle";

/** Renders nothing; runs invite-claim + org load + presence while signed in. */
export function TeamsBootstrap() {
  useClaimInvites();
  usePresenceLifecycle();
  return null;
}
```

- [ ] **Step 3: Report the current space from `WallView`**

In `src/wall/WallView.tsx`, add the imports:

```tsx
import { setPresenceSpace } from "../teams/presence";
import { useOrgStore } from "../teams/orgStore";
```

Then add a dedicated effect (place it near the other `useEffect`s, e.g. right after the
`useEffect(() => useCardStore.subscribe(scheduleSave), [scheduleSave]);` line):

```tsx
  // Report this space to team presence + persist it as the member's last space.
  useEffect(() => {
    let cancelled = false;
    void loadIndex().then((idx) => {
      if (cancelled) return;
      const name = idx.find((w) => w.id === wallId)?.name ?? "space";
      setPresenceSpace(wallId, name);
      void useOrgStore.getState().recordSpaceActivity(wallId, name);
    });
    return () => { cancelled = true; setPresenceSpace(null, null); };
  }, [wallId]);
```

(`loadIndex` is already imported in `WallView.tsx`.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/teams/usePresenceLifecycle.ts src/teams/TeamsBootstrap.tsx src/wall/WallView.tsx
git commit -m "feat(teams): app-level presence lifecycle + current-space reporting"
```


### Task 6: `SolarSystem` component + TeamsView integration + CSS

**Files:**
- Create: `src/teams/SolarSystem.tsx`
- Modify: `src/teams/TeamsView.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Create `src/teams/SolarSystem.tsx`**

```tsx
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
```

- [ ] **Step 2: Integrate into `TeamsView.tsx`**

Add imports at the top:

```tsx
import { SolarSystem } from "./SolarSystem";
import { setPresenceManualStatus } from "./presence";
```

In the org body, replace:

```tsx
        <div className="teams-body">
          <OrgHero org={currentOrg} memberCount={members.length} isAdmin={isAdmin} />
          <MembersPanel members={members} myId={myId} isAdmin={isAdmin} orgId={currentOrg.id} />
```

with:

```tsx
        <div className="teams-body">
          <SolarSystem org={currentOrg} members={members} myId={myId} />
          <OrgHero org={currentOrg} memberCount={members.length} isAdmin={isAdmin} />
          <MyStatusBar />
          <MembersPanel members={members} myId={myId} isAdmin={isAdmin} orgId={currentOrg.id} />
```

- [ ] **Step 3: Turn `OrgHero` into a caption (the orbit now owns the "sun")**

Replace the whole `OrgHero` function with:

```tsx
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
```

(`useOrgStore` and `useState` are already imported in `TeamsView.tsx`.)

- [ ] **Step 4: Append the solar-system styles to `src/App.css`**

```css
/* ── Solar system ───────────────────────────────────────────── */
.solar { position: relative; margin: 6px auto 4px; }
.solar-rings { position: absolute; inset: 0; }
.solar-rings span {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  border: 1px solid var(--rule); border-radius: 50%;
}
.solar-core {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 96px; height: 96px; border-radius: 50%;
  display: grid; place-items: center; font-size: 38px; font-weight: 600; overflow: hidden;
  background: radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--accent) 70%, transparent), var(--accent-soft));
  box-shadow: 0 0 40px color-mix(in srgb, var(--accent) 45%, transparent);
  color: var(--text); z-index: 2;
}
.solar-core img { width: 100%; height: 100%; object-fit: cover; }
.solar-rotor { position: absolute; inset: 0; transform-origin: 50% 50%; animation: solar-spin 140s linear infinite; }
.solar:hover .solar-rotor, .solar:hover .solar-avatar { animation-play-state: paused; }
.solar-node { position: absolute; transform: translate(-50%, -50%); }
.solar-avatar {
  position: relative; width: 44px; height: 44px; border-radius: 50%;
  display: grid; place-items: center; font-weight: 600; font-size: 15px; cursor: default;
  background: color-mix(in srgb, var(--accent) 25%, var(--surface-2)); color: var(--text);
  box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--rule);
  animation: solar-spin 140s linear infinite reverse;
}
.solar-avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.solar-avatar.is-online { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px #4caf6a, 0 0 14px #4caf6a66; }
.solar-avatar.is-idle { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent); }
.solar-avatar.is-offline { opacity: .5; }
@keyframes solar-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .solar-rotor, .solar-avatar { animation: none !important; } }
.solar-tip {
  position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
  white-space: nowrap; background: var(--surface-2); border: 1px solid var(--rule);
  border-radius: 8px; padding: 6px 10px; display: none; flex-direction: column; gap: 2px;
  z-index: 5; pointer-events: none;
}
.solar-tip strong { font-size: 13px; }
.solar-tip span { font-size: 12px; color: var(--text-muted); }
.solar-avatar:hover { z-index: 6; }
.solar-avatar:hover .solar-tip { display: flex; }

.teams-caption { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.teams-caption h1 { margin: 0; font-size: 24px; font-weight: 600; }
.teams-status-bar { display: flex; gap: 8px; align-items: center; justify-content: center; }
.teams-emoji-input {
  width: 48px; text-align: center; background: var(--surface-2); color: var(--text);
  border: 1px solid var(--rule); border-radius: var(--radius-sm); padding: 6px; font: inherit;
}
.teams-status-bar .teams-input { max-width: 320px; flex: initial; }
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/teams/SolarSystem.tsx src/teams/TeamsView.tsx src/App.css
git commit -m "feat(teams): solar-system view with live presence + manual status"
```


### Task 7: Verify

**Files:** none.

- [ ] **Step 1: Type-check + tests + build**

Run: `npx tsc --noEmit` → no errors.
Run: `npx vitest run` → all pass (199 + the new presenceHelpers and orbit cases).
Run: `npm run build` → succeeds.

- [ ] **Step 2: Manual smoke test (two accounts)**

Start the app (`npm run tauri dev`). With the two Team-tier accounts (Plan 2 setup):
1. Account A opens **Teams** → the org logo sits at the center with avatars orbiting.
2. Account B signs in (separate machine/profile) and opens a space → on A's screen,
   B's avatar turns **online** with a green ring; hovering shows "Online · in *<space>*".
3. B closes the app → within ~30s B fades to **offline**; hover shows "Offline · last
   seen … · last in *<space>*".
4. Set a manual status ("🎧 Heads-down") → teammates' hover shows it as the prefix.
5. Hovering the orbit pauses the rotation; `prefers-reduced-motion` disables it.

Expected: live status + current/last space resolve correctly across the two clients.


## Done criteria (Plan 4)

- The Teams view shows the org logo at the center with member avatars orbiting on
  concentric rings, rotating gently (paused on hover / reduced-motion).
- Avatars carry a live status ring (online/idle/offline); hover reveals the resolved
  status line with current or last-worked-in space.
- Presence is live across two clients via the Realtime channel; `last_space` persists for
  offline members; manual custom status works.
- Unit tests cover status-line and orbit logic; `tsc`, tests, and build are green.

**Next:** Plan 5 — Publish & Sync ("Share to org", open a shared space from the Projects
panel, last-write-wins, background upload). That fills the Projects placeholder and makes
the "Open *space*" hover affordance functional.

