# Teams Collaboration — Plan 2: Orgs & Membership

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the organization data layer — create/join/invite/accept membership through `SECURITY DEFINER` RPCs, a zustand `orgStore`, invite-claim-on-sign-in, and the `canUseTeams` entitlement — so a Team-tier user's membership state is fully manageable (UI arrives in Plan 3).

**Architecture:** RLS (Plan 1) intentionally has no INSERT/DELETE policies for `org`/`org_member`/`org_invite`; all membership writes go through `SECURITY DEFINER` RPCs that derive identity from `clerk_sub()` server-side (never trusting the client for who you are). The React layer reads the Clerk user for cosmetic profile fields and drives a zustand store; pure helpers (slug, email validation) are unit-tested in isolation.

**Tech Stack:** Supabase Postgres RPCs, `@supabase/supabase-js` (typed client from Plan 1), zustand, Clerk, Vitest. All Supabase operations use the **`supabase-vibespace`** MCP.

**Spec:** `docs/superpowers/specs/2026-06-15-vibe-space-teams-collab-design.md` (decisions 2, 6, 7, 9).

**Prerequisite:** Plan 1 complete and the Clerk↔Supabase third-party auth verified (`clerk_sub_probe` returns the Clerk id).

---

### Task 1: Add the `canUseTeams` entitlement

The whole Teams feature is Team-tier. Add the flag to the entitlements module so
every gate reads from one place (per the tiers spec).

**Files:**
- Modify: `src/entitlements.ts`
- Modify: `src/entitlements.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/entitlements.test.ts`, add to the existing `entitlementsFor` describe block:

```ts
  it("only team can use collaboration", () => {
    expect(entitlementsFor("free").canUseTeams).toBe(false);
    expect(entitlementsFor("pro").canUseTeams).toBe(false);
    expect(entitlementsFor("team").canUseTeams).toBe(true);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/entitlements.test.ts`
Expected: FAIL — `canUseTeams` does not exist on type `Entitlements`.

- [ ] **Step 3: Add the flag to the type and all three tiers**

In `src/entitlements.ts`:
- Add to the `Entitlements` type: `canUseTeams: boolean;`
- In `TIERS.free` and `TIERS.pro`: `canUseTeams: false,`
- In `TIERS.team`: `canUseTeams: true,`

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/entitlements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entitlements.ts src/entitlements.test.ts
git commit -m "feat(teams): canUseTeams entitlement (team tier only)"
```


### Task 2: Membership RPCs (`SECURITY DEFINER`)

All identity comes from `clerk_sub()` inside the function — clients never pass
their own user id. Profile fields (`display_name`, `avatar_url`) are cosmetic and
may be passed by the client. Functions are granted to `authenticated` only.

**Files:**
- Create: `supabase/migrations/20260615_teams_rpcs.sql`

- [ ] **Step 1: Write the RPC migration file**

Create `supabase/migrations/20260615_teams_rpcs.sql`:

```sql
-- Create an org and make the caller its owner. Returns the new org id.
create or replace function public.create_org(
  p_name text,
  p_logo_url text default null,
  p_display_name text default null,
  p_avatar_url text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid  text := public.clerk_sub();
  v_org  uuid;
  v_code text;
  v_slug text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;

  -- slug from name; ensure uniqueness with a short random suffix if taken
  v_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'org'; end if;
  if exists (select 1 from public.org where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
  end if;

  -- unique 6-char join code
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.org where join_code = v_code);
  end loop;

  insert into public.org (name, slug, logo_url, created_by, join_code)
  values (trim(p_name), v_slug, p_logo_url, v_uid, v_code)
  returning id into v_org;

  insert into public.org_member (org_id, user_id, role, display_name, avatar_url, last_active_at)
  values (v_org, v_uid, 'owner', p_display_name, p_avatar_url, now());

  return v_org;
end; $$;

-- Join an org by its join code. Idempotent. Returns the org id.
create or replace function public.join_org_by_code(
  p_code text,
  p_display_name text default null,
  p_avatar_url text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid text := public.clerk_sub(); v_org uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select id into v_org from public.org where join_code = upper(trim(p_code));
  if v_org is null then raise exception 'invalid join code'; end if;
  insert into public.org_member (org_id, user_id, role, display_name, avatar_url, last_active_at)
  values (v_org, v_uid, 'member', p_display_name, p_avatar_url, now())
  on conflict (org_id, user_id) do nothing;
  return v_org;
end; $$;

-- Invite by email (owner/admin only). Upserts a pending invite. Returns invite id.
create or replace function public.invite_member(
  p_org uuid, p_email text, p_role text default 'member'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid text := public.clerk_sub(); v_invite uuid;
begin
  if not public.is_org_admin(p_org, v_uid) then raise exception 'not authorized'; end if;
  if p_role not in ('admin', 'member') then raise exception 'invalid role'; end if;
  insert into public.org_invite (org_id, email, role, invited_by, status)
  values (p_org, lower(trim(p_email)), p_role, v_uid, 'pending')
  on conflict (org_id, email)
    do update set role = excluded.role, status = 'pending', invited_by = excluded.invited_by
  returning id into v_invite;
  return v_invite;
end; $$;

-- Revoke a pending invite (owner/admin only).
create or replace function public.revoke_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid text := public.clerk_sub(); v_org uuid;
begin
  select org_id into v_org from public.org_invite where id = p_invite;
  if v_org is null then return; end if;
  if not public.is_org_admin(v_org, v_uid) then raise exception 'not authorized'; end if;
  delete from public.org_invite where id = p_invite;
end; $$;

-- Claim all pending invites addressed to the caller's verified email.
-- Returns the number of orgs joined. Requires `email` in the Clerk JWT (Task 3).
create or replace function public.accept_invites(
  p_display_name text default null,
  p_avatar_url text default null
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid   text := public.clerk_sub();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_count int  := 0;
  inv     record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_email = '' then return 0; end if;
  for inv in
    select * from public.org_invite where lower(email) = v_email and status = 'pending'
  loop
    insert into public.org_member (org_id, user_id, role, display_name, avatar_url, last_active_at)
    values (inv.org_id, v_uid, inv.role, p_display_name, p_avatar_url, now())
    on conflict (org_id, user_id) do nothing;
    update public.org_invite set status = 'accepted' where id = inv.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;

-- Change a member's role (owner/admin only); never demote the last owner.
create or replace function public.set_member_role(
  p_org uuid, p_user text, p_role text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid text := public.clerk_sub();
begin
  if not public.is_org_admin(p_org, v_uid) then raise exception 'not authorized'; end if;
  if p_role not in ('owner', 'admin', 'member') then raise exception 'invalid role'; end if;
  if p_role <> 'owner' then
    if (select role from public.org_member where org_id = p_org and user_id = p_user) = 'owner'
       and (select count(*) from public.org_member where org_id = p_org and role = 'owner') <= 1 then
      raise exception 'cannot demote the last owner';
    end if;
  end if;
  update public.org_member set role = p_role where org_id = p_org and user_id = p_user;
end; $$;

-- Remove a member. Admins can remove others; anyone can remove themself (leave).
-- The last owner cannot be removed.
create or replace function public.remove_member(p_org uuid, p_user text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid text := public.clerk_sub();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_user <> v_uid and not public.is_org_admin(p_org, v_uid) then
    raise exception 'not authorized';
  end if;
  if (select role from public.org_member where org_id = p_org and user_id = p_user) = 'owner'
     and (select count(*) from public.org_member where org_id = p_org and role = 'owner') <= 1 then
    raise exception 'cannot remove the last owner';
  end if;
  delete from public.org_member where org_id = p_org and user_id = p_user;
end; $$;

grant execute on function public.create_org(text, text, text, text)       to authenticated;
grant execute on function public.join_org_by_code(text, text, text)         to authenticated;
grant execute on function public.invite_member(uuid, text, text)            to authenticated;
grant execute on function public.revoke_invite(uuid)                        to authenticated;
grant execute on function public.accept_invites(text, text)                 to authenticated;
grant execute on function public.set_member_role(uuid, text, text)          to authenticated;
grant execute on function public.remove_member(uuid, text)                  to authenticated;

revoke execute on function public.create_org(text, text, text, text)       from anon, public;
revoke execute on function public.join_org_by_code(text, text, text)        from anon, public;
revoke execute on function public.invite_member(uuid, text, text)           from anon, public;
revoke execute on function public.revoke_invite(uuid)                       from anon, public;
revoke execute on function public.accept_invites(text, text)                from anon, public;
revoke execute on function public.set_member_role(uuid, text, text)         from anon, public;
revoke execute on function public.remove_member(uuid, text)                 from anon, public;
```

- [ ] **Step 2: Apply the migration**

MCP `mcp__supabase-vibespace__apply_migration`, name `20260615_teams_rpcs`, with
the SQL from Step 1.
Expected: success.

- [ ] **Step 3: SQL-level verification of the RPC behavior**

MCP `mcp__supabase-vibespace__execute_sql` (impersonates two users; rolls back):

```sql
begin;
set local role authenticated;

-- user_a creates an org (return value ignored; looked up by slug below)
select set_config('request.jwt.claims', '{"sub":"user_a","role":"authenticated"}', true);
perform public.create_org('Acme Inc');

-- caller is owner
select count(*) as a_is_owner from public.org_member
  where user_id = 'user_a' and role = 'owner';        -- expect 1

-- invite user_b by email
select public.invite_member(
  (select id from public.org where slug like 'acme-inc%' limit 1),
  'b@example.com', 'member');

-- user_b (email b@example.com) accepts on sign-in
select set_config('request.jwt.claims',
  '{"sub":"user_b","role":"authenticated","email":"b@example.com"}', true);
select public.accept_invites() as joined;            -- expect 1
select count(*) as b_is_member from public.org_member where user_id = 'user_b'; -- expect 1

rollback;
```

Expected: `a_is_owner = 1`, `joined = 1`, `b_is_member = 1`. Note: `perform` is
only valid inside a PL/pgSQL block — if the MCP runs statements as plain SQL,
change `perform public.create_org('Acme Inc');` to
`select public.create_org('Acme Inc');` (the returned uuid is simply ignored).

- [ ] **Step 4: Verify the authorization guard rejects a non-admin invite**

MCP `mcp__supabase-vibespace__execute_sql`:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_a","role":"authenticated"}', true);
select public.create_org('Guard Test');
select set_config('request.jwt.claims', '{"sub":"user_c","role":"authenticated"}', true);
-- user_c is not a member/admin -> expect: ERROR "not authorized"
select public.invite_member((select id from public.org where slug like 'guard-test%'),
                            'x@example.com', 'member');
rollback;
```

Expected: the final `select` raises `not authorized`. (Seeing the error here is the
pass condition; the `rollback` still runs.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260615_teams_rpcs.sql
git commit -m "feat(teams): membership RPCs (create/join/invite/accept/roles)"
```


### Task 3: Regenerate the DB types (so the new RPCs are typed)

`supabase.rpc("create_org", …)` is only type-safe if `src/supabase/types.ts`
knows about the new functions. Regenerate after Task 2.

**Files:**
- Modify: `src/supabase/types.ts`

- [ ] **Step 1: Regenerate**

MCP `mcp__supabase-vibespace__generate_typescript_types`. Overwrite
`src/supabase/types.ts` with the returned output verbatim.

- [ ] **Step 2: Confirm the new functions are present**

Grep the file for the new RPCs:

Run: `grep -E "create_org|join_org_by_code|invite_member|accept_invites|set_member_role|remove_member|revoke_invite" src/supabase/types.ts`
Expected: each name appears under `Functions`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/supabase/types.ts
git commit -m "chore(teams): regenerate DB types with membership RPCs"
```


### Task 4: Add the `email` claim to the Clerk session token (dashboard config)

`accept_invites()` matches invites by the caller's **verified** email, read from
`auth.jwt()->>'email'`. Clerk's Supabase token carries `role` by default but not
`email`, so add it as a custom session-token claim. This is a one-time dashboard
step (no app code), analogous to Plan 1 Task 3.

**Files:** none (configuration only).

- [ ] **Step 1: Add the claim in Clerk**

In the **Clerk dashboard** → **Configure** → **Sessions** → **Customize session
token** (Edit), add the `email` claim to the JSON:

```json
{
  "email": "{{user.primary_email_address}}"
}
```

Save. (If a `role` claim is already present from the Supabase integration, keep it
and just add the `email` line.)

- [ ] **Step 2: Verify the claim reaches Postgres**

In the running app (signed in), DevTools console:

```js
const t = await window.Clerk.session.getToken();
const r = await fetch(
  "https://tfaouguiyvmfarfqungk.supabase.co/rest/v1/rpc/accept_invites",
  { method: "POST",
    headers: {
      apikey: "sb_publishable_v8wsw73IIk2hMpoSIjz55Q_CeHSJRNA",
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
    },
    body: "{}" }
);
console.log(r.status, await r.json());   // expect 200 and a number (0 if no invites)
```

Expected: `200` and a number. A `200` with `0` is correct when you have no pending
invites — it proves the function ran and the email claim was readable (no error).

- [ ] **Step 3: No commit** (configuration only).


### Task 5: Pure helpers (`isValidEmail`, `resolveCurrentOrg`)

Isolate the store's pure logic so it's unit-tested without mocking Supabase.

**Files:**
- Create: `src/teams/orgHelpers.ts`
- Create: `src/teams/orgHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/teams/orgHelpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isValidEmail, resolveCurrentOrg, type OrgLike } from "./orgHelpers";

const orgs: OrgLike[] = [
  { id: "a", name: "Acme" },
  { id: "b", name: "Globex" },
];

describe("isValidEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("jane@example.com")).toBe(true);
  });
  it("rejects junk", () => {
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("  ")).toBe(false);
  });
  it("trims surrounding whitespace", () => {
    expect(isValidEmail("  jane@example.com  ")).toBe(true);
  });
});

describe("resolveCurrentOrg", () => {
  it("returns the saved org when still a member", () => {
    expect(resolveCurrentOrg(orgs, "b")?.id).toBe("b");
  });
  it("falls back to the first org when the saved id is gone", () => {
    expect(resolveCurrentOrg(orgs, "zzz")?.id).toBe("a");
  });
  it("returns null when there are no orgs", () => {
    expect(resolveCurrentOrg([], "a")).toBeNull();
  });
  it("handles a null saved id", () => {
    expect(resolveCurrentOrg(orgs, null)?.id).toBe("a");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/teams/orgHelpers.test.ts`
Expected: FAIL — `Failed to resolve import "./orgHelpers"`.

- [ ] **Step 3: Implement the helpers**

Create `src/teams/orgHelpers.ts`:

```ts
export type OrgLike = { id: string; name: string };

/** Pragmatic email check: a single @, a dot in the domain, no spaces. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Picks which org should be active: the previously-selected one if the user is
 * still a member, else the first available, else null.
 */
export function resolveCurrentOrg(orgs: OrgLike[], savedId: string | null): OrgLike | null {
  if (orgs.length === 0) return null;
  return orgs.find((o) => o.id === savedId) ?? orgs[0];
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/teams/orgHelpers.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/teams/orgHelpers.ts src/teams/orgHelpers.test.ts
git commit -m "feat(teams): pure org helpers (email validation, current-org resolution)"
```


### Task 6: Clerk identity reader + `orgStore`

The store calls the typed RPCs and selects, and holds the current org, members, and
pending invites. Identity (display name + avatar) is read from the global Clerk
user for the cosmetic profile fields.

**Files:**
- Create: `src/teams/identity.ts`
- Create: `src/teams/orgStore.ts`

- [ ] **Step 1: Write the Clerk identity reader**

Create `src/teams/identity.ts`:

```ts
type ClerkUser = {
  fullName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress?: string } | null;
  imageUrl?: string | null;
};
type ClerkWindow = { Clerk?: { user?: ClerkUser | null } };

/** Cosmetic profile snapshot passed into membership RPCs. Identity (the user id)
 *  is derived server-side from the JWT, never from this. */
export function currentProfile(): { displayName: string | null; avatarUrl: string | null } {
  const u = (globalThis as unknown as ClerkWindow).Clerk?.user;
  const displayName =
    u?.fullName || u?.username || u?.primaryEmailAddress?.emailAddress || null;
  return { displayName, avatarUrl: u?.imageUrl ?? null };
}
```

- [ ] **Step 2: Write the org store**

Create `src/teams/orgStore.ts`:

```ts
import { create } from "zustand";
import { supabase } from "../supabase/client";
import type { Tables } from "../supabase/types";
import { resolveCurrentOrg } from "./orgHelpers";
import { currentProfile } from "./identity";

export type Org = Tables<"org">;
export type Member = Tables<"org_member">;
export type Invite = Tables<"org_invite">;

const CURRENT_ORG_KEY = "vibe.teams.currentOrg";

type OrgStore = {
  orgs: Org[];
  currentOrgId: string | null;
  members: Member[];
  invites: Invite[];
  loading: boolean;
  error: string | null;

  loadMyOrgs: () => Promise<void>;
  setCurrentOrg: (id: string | null) => void;
  createOrg: (name: string, logoUrl?: string | null) => Promise<string>;
  joinByCode: (code: string) => Promise<string>;
  claimInvites: () => Promise<number>;
  loadMembers: (orgId: string) => Promise<void>;
  loadInvites: (orgId: string) => Promise<void>;
  invite: (orgId: string, email: string, role: "admin" | "member") => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  setRole: (orgId: string, userId: string, role: "owner" | "admin" | "member") => Promise<void>;
  removeMember: (orgId: string, userId: string) => Promise<void>;
};

function throwIf<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export const useOrgStore = create<OrgStore>((set, get) => ({
  orgs: [],
  currentOrgId: localStorage.getItem(CURRENT_ORG_KEY),
  members: [],
  invites: [],
  loading: false,
  error: null,

  loadMyOrgs: async () => {
    set({ loading: true, error: null });
    try {
      const data = throwIf(await supabase.from("org").select("*").order("created_at"));
      const orgs = data ?? [];
      const current = resolveCurrentOrg(orgs, get().currentOrgId);
      set({ orgs, currentOrgId: current?.id ?? null, loading: false });
      if (current) {
        await get().loadMembers(current.id);
        await get().loadInvites(current.id);
      } else {
        set({ members: [], invites: [] });
      }
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  setCurrentOrg: (id) => {
    if (id) localStorage.setItem(CURRENT_ORG_KEY, id);
    else localStorage.removeItem(CURRENT_ORG_KEY);
    set({ currentOrgId: id });
    if (id) {
      void get().loadMembers(id);
      void get().loadInvites(id);
    } else {
      set({ members: [], invites: [] });
    }
  },

  createOrg: async (name, logoUrl = null) => {
    const { displayName, avatarUrl } = currentProfile();
    const id = throwIf(
      await supabase.rpc("create_org", {
        p_name: name,
        p_logo_url: logoUrl,
        p_display_name: displayName,
        p_avatar_url: avatarUrl,
      }),
    );
    await get().loadMyOrgs();
    get().setCurrentOrg(id);
    return id;
  },

  joinByCode: async (code) => {
    const { displayName, avatarUrl } = currentProfile();
    const id = throwIf(
      await supabase.rpc("join_org_by_code", {
        p_code: code,
        p_display_name: displayName,
        p_avatar_url: avatarUrl,
      }),
    );
    await get().loadMyOrgs();
    get().setCurrentOrg(id);
    return id;
  },

  claimInvites: async () => {
    const { displayName, avatarUrl } = currentProfile();
    const count = throwIf(
      await supabase.rpc("accept_invites", {
        p_display_name: displayName,
        p_avatar_url: avatarUrl,
      }),
    );
    if (count > 0) await get().loadMyOrgs();
    return count ?? 0;
  },

  loadMembers: async (orgId) => {
    const data = throwIf(
      await supabase.from("org_member").select("*").eq("org_id", orgId),
    );
    set({ members: data ?? [] });
  },

  loadInvites: async (orgId) => {
    const data = throwIf(
      await supabase.from("org_invite").select("*").eq("org_id", orgId).eq("status", "pending"),
    );
    set({ invites: data ?? [] });
  },

  invite: async (orgId, email, role) => {
    throwIf(await supabase.rpc("invite_member", { p_org: orgId, p_email: email, p_role: role }));
    await get().loadInvites(orgId);
  },

  revokeInvite: async (inviteId) => {
    throwIf(await supabase.rpc("revoke_invite", { p_invite: inviteId }));
    const cur = get().currentOrgId;
    if (cur) await get().loadInvites(cur);
  },

  setRole: async (orgId, userId, role) => {
    throwIf(await supabase.rpc("set_member_role", { p_org: orgId, p_user: userId, p_role: role }));
    await get().loadMembers(orgId);
  },

  removeMember: async (orgId, userId) => {
    throwIf(await supabase.rpc("remove_member", { p_org: orgId, p_user: userId }));
    await get().loadMyOrgs();
  },
}));
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `throwIf`'s generic complains about the rpc result shape,
the rpc returns `{ data, error }` like the selects — the same helper applies.)

- [ ] **Step 4: Commit**

```bash
git add src/teams/identity.ts src/teams/orgStore.ts
git commit -m "feat(teams): orgStore + Clerk identity reader"
```


### Task 7: Claim invites on sign-in + wire into the app

When a Team-tier user signs in, claim any pending invites and load their orgs so the
Teams UI (Plan 3) has data. Runs once per mount, only when signed in and Team-tier.

**Files:**
- Create: `src/teams/useClaimInvites.ts`
- Create: `src/teams/TeamsBootstrap.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the hook**

Create `src/teams/useClaimInvites.ts`:

```ts
import { useEffect, useRef } from "react";
import { useUser } from "@clerk/clerk-react";
import { useEntitlements } from "../entitlements";
import { useOrgStore } from "./orgStore";

/** Once per mount, for signed-in Team-tier users: claim pending invites, then
 *  load orgs so the Teams view has data ready. */
export function useClaimInvites(): void {
  const { canUseTeams } = useEntitlements();
  const { isSignedIn } = useUser();
  const ran = useRef(false);

  useEffect(() => {
    if (!canUseTeams || !isSignedIn || ran.current) return;
    ran.current = true;
    void (async () => {
      try {
        await useOrgStore.getState().claimInvites();
      } catch {
        /* claiming is best-effort; loadMyOrgs still runs below */
      }
      await useOrgStore.getState().loadMyOrgs();
    })();
  }, [canUseTeams, isSignedIn]);
}
```

- [ ] **Step 2: Write the mount-only bootstrap component**

Create `src/teams/TeamsBootstrap.tsx`:

```tsx
import { useClaimInvites } from "./useClaimInvites";

/** Renders nothing; runs invite-claim + org load while signed in. */
export function TeamsBootstrap() {
  useClaimInvites();
  return null;
}
```

- [ ] **Step 3: Mount it inside the signed-in tree**

In `src/App.tsx`, add the import near the other imports:

```tsx
import { TeamsBootstrap } from "./teams/TeamsBootstrap";
```

Then render it alongside `<VibeAgent />` inside `<SignedIn>`:

```tsx
        <SignedIn>
          {page}
          <VibeAgent />
          <TeamsBootstrap />
        </SignedIn>
```

- [ ] **Step 4: Type-check and run the full test suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests pass (existing 191 + the new entitlement and orgHelpers tests).

- [ ] **Step 5: Manual smoke test (optional but recommended)**

Requires Task 4's email claim configured. Start the app (`npm run tauri dev`),
sign in as a Team-tier user, and from the DevTools console:

```js
const { useOrgStore } = await import("/src/teams/orgStore.ts");
await useOrgStore.getState().createOrg("My First Org");
console.log(useOrgStore.getState().orgs, useOrgStore.getState().members);
```

Expected: one org listed, and you as an `owner` member. (This is dev-only
verification; remove nothing — it leaves a real org you can reuse in Plan 3.)

- [ ] **Step 6: Commit**

```bash
git add src/teams/useClaimInvites.ts src/teams/TeamsBootstrap.tsx src/App.tsx
git commit -m "feat(teams): claim invites + load orgs on sign-in"
```


## Done criteria (Plan 2)

- `canUseTeams` is `true` only for the team tier (unit-tested).
- The membership RPCs exist and the SQL-level checks pass: create → owner, invite →
  accept → member, and a non-admin invite is rejected.
- DB types include the new RPCs; `orgStore` and helpers compile under `tsc`.
- Invites are claimed and orgs loaded on sign-in for Team-tier users.
- Full test suite passes.

**Carried into Plan 3 (UI):** org logo upload (needs an `org-logos` bucket),
the Teams toolbar button + view, and rendering the members/projects rail from
`orgStore`.

**Next:** Plan 3 — Teams View Shell (toolbar entry, view routing, side rail,
empty/create-org state, gating affordance).

