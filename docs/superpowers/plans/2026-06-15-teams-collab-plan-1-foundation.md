# Teams Collaboration — Plan 1: Foundation (Identity Bridge, Schema, RLS)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Supabase backend foundation for team collaboration — the Clerk→Supabase identity bridge, the org/member/invite/space schema with row-level security, and storage buckets — so later plans can read/write org data directly under RLS.

**Architecture:** Clerk stays the identity provider; the frontend gets a `@supabase/supabase-js` client whose `accessToken` callback returns the live Clerk session token. Supabase is configured to accept Clerk JWTs (third-party auth), exposing the Clerk user id as `auth.jwt()->>'sub'`. All org tables carry that id as `text` and are protected by RLS, with membership/role checks routed through `SECURITY DEFINER` helpers to avoid recursive policies.

**Tech Stack:** Supabase (Postgres + RLS + Storage), `@supabase/supabase-js` v2, Clerk third-party auth, Vite/`import.meta.env`, Vitest. All Supabase operations use the **`supabase-vibespace`** MCP.

**Spec:** `docs/superpowers/specs/2026-06-15-vibe-space-teams-collab-design.md` (Sections 1, 2).

**Plan series:** Plan 1 Foundation (this) → Plan 2 Orgs & Membership → Plan 3 Teams View Shell → Plan 4 Presence + Solar System → Plan 5 Publish & Sync.

---

### Task 1: Add the Supabase client dependency and env scaffolding

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `.env.example`
- Modify: `src/vite-env.d.ts`

- [ ] **Step 1: Install the Supabase JS client**

Run: `npm install @supabase/supabase-js@^2`
Expected: `package.json` gains `"@supabase/supabase-js": "^2.x"` and `package-lock.json` updates.

- [ ] **Step 2: Add the two new env vars to `.env.example`**

Append to `.env.example`:

```
# Supabase (the `supabase-vibespace` project). Both are safe to expose to the
# client. URL + anon/publishable key from the Supabase dashboard → Project
# Settings → API. Copy this file to `.env` and fill these in.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 3: Type the new env vars**

Add the two new members to the existing `ImportMetaEnv` interface. The file must end up as:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_VIBE_SIGNIN_URL?: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 4: Fill your local `.env`**

Get the URL + anon key from the `supabase-vibespace` project (MCP `get_project_url` and `get_publishable_keys`, or the dashboard) and put them in `.env` (NOT `.env.example`). The anon key is the publishable/`anon` key, not the service role key.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example src/vite-env.d.ts
git commit -m "chore(teams): add @supabase/supabase-js + env scaffolding"
```


### Task 2: Clerk token bridge + Supabase client factory

The Supabase client must attach the **live** Clerk session token to every request
(REST and Realtime). Clerk exposes a `window.Clerk` global once `ClerkProvider`
has mounted; `window.Clerk.session.getToken()` returns a fresh JWT (auto-refreshed).
We isolate the token read into a tiny, testable helper.

**Files:**
- Create: `src/supabase/clerkToken.ts`
- Create: `src/supabase/clerkToken.test.ts`
- Create: `src/supabase/client.ts`

- [ ] **Step 1: Write the failing test for the token helper**

Create `src/supabase/clerkToken.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getClerkToken } from "./clerkToken";

type W = { Clerk?: { session?: { getToken: () => Promise<string | null> } | null } };
const w = globalThis as unknown as W;

afterEach(() => { delete w.Clerk; });

describe("getClerkToken", () => {
  it("returns null when Clerk is not on window yet", async () => {
    expect(await getClerkToken()).toBeNull();
  });

  it("returns null when there is no active session", async () => {
    w.Clerk = { session: null };
    expect(await getClerkToken()).toBeNull();
  });

  it("returns the session token when signed in", async () => {
    w.Clerk = { session: { getToken: vi.fn().mockResolvedValue("jwt-123") } };
    expect(await getClerkToken()).toBe("jwt-123");
  });

  it("returns null and swallows errors if getToken throws", async () => {
    w.Clerk = { session: { getToken: vi.fn().mockRejectedValue(new Error("boom")) } };
    expect(await getClerkToken()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/supabase/clerkToken.test.ts`
Expected: FAIL — `Failed to resolve import "./clerkToken"`.

- [ ] **Step 3: Implement the token helper**

Create `src/supabase/clerkToken.ts`:

```ts
type ClerkWindow = {
  Clerk?: { session?: { getToken: () => Promise<string | null> } | null };
};

/**
 * Reads a fresh Clerk session JWT from the global Clerk instance. Returns null
 * when Clerk has not mounted yet or there is no signed-in session, so callers
 * (the Supabase client) degrade to an anonymous request instead of throwing.
 */
export async function getClerkToken(): Promise<string | null> {
  const clerk = (globalThis as unknown as ClerkWindow).Clerk;
  const session = clerk?.session;
  if (!session) return null;
  try {
    return await session.getToken();
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/supabase/clerkToken.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 5: Create the Supabase client factory**

Create `src/supabase/client.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { getClerkToken } from "./clerkToken";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.",
  );
}

/**
 * App-wide Supabase client. The `accessToken` callback hands Supabase a live
 * Clerk JWT on every REST and Realtime request, so RLS sees the Clerk user id as
 * auth.jwt()->>'sub'. We disable Supabase's own auth persistence — Clerk is the
 * sole identity provider; Supabase never holds its own session here.
 */
export const supabase = createClient(url, anonKey, {
  accessToken: getClerkToken,
  auth: { persistSession: false, autoRefreshToken: false },
});
```

- [ ] **Step 6: Verify the project still type-checks and builds**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/supabase/clerkToken.ts src/supabase/clerkToken.test.ts src/supabase/client.ts
git commit -m "feat(teams): Supabase client with Clerk access-token bridge"
```


### Task 3: Configure Clerk as a Supabase third-party auth provider

This is a one-time **dashboard configuration** (no app code). Until it's done,
Supabase rejects Clerk JWTs and every RLS policy denies, so this gates Tasks 5–7.

**Files:** none (configuration only). Record completion in the migration header
comment added in Task 4.

- [ ] **Step 1: Enable Clerk's Supabase integration**

In the **Clerk dashboard** → **Configure** → **Integrations** (or **Supabase**),
enable the Supabase integration. Clerk shows a **Clerk domain** (issuer URL like
`https://<your-subdomain>.clerk.accounts.dev`). Copy it.

Reference (fetch current exact steps if the UI differs): the Clerk MCP —
`mcp__clerk__clerk_sdk_snippet` / `list_clerk_sdk_snippets` with a "supabase
third party auth" query — and Supabase docs via the `supabase-vibespace` MCP
`search_docs` for "Clerk third-party auth".

- [ ] **Step 2: Register Clerk as a third-party auth provider in Supabase**

In the **Supabase dashboard** for `supabase-vibespace` → **Authentication** →
**Sign In / Providers** → **Third Party Auth** → **Add provider** → **Clerk**, and
paste the Clerk domain from Step 1. Save.

- [ ] **Step 3: Verify Supabase accepts a Clerk token**

In the running app (after Task 2), temporarily log a probe from the browser
devtools console, or add a throwaway button that runs:

```ts
import { supabase } from "./supabase/client";
const { data, error } = await supabase.rpc("clerk_sub_probe"); // created in Task 5
console.log({ data, error });
```

Expected once Task 5 lands: `data` is your Clerk user id (e.g. `user_2abc...`),
`error` is null. If `data` is null while signed in, the provider is misconfigured —
re-check the domain. (Run this verification at the end of Task 5; listed here so
the dependency is explicit.)

- [ ] **Step 4: Commit a note (no code)**

No file changes in this task. Proceed to Task 4.


### Task 4: Schema migration — tables

Create the four org tables. We keep the SQL in a migration file under
`supabase/migrations/` (matching the existing `20260612_groq_usage.sql`) AND apply
it to the remote project via the MCP so dev and source stay in sync.

**Files:**
- Create: `supabase/migrations/20260615_teams_tables.sql`

- [ ] **Step 1: Write the tables migration file**

Create `supabase/migrations/20260615_teams_tables.sql`:

```sql
-- Team collaboration foundation: org / membership / invites / shared spaces.
-- Identity is Clerk; user ids are the Clerk `sub` stored as text.
-- Prereq: Clerk configured as a Supabase third-party auth provider (Plan 1, Task 3).

create table if not exists public.org (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  logo_url    text,
  created_by  text not null,                 -- Clerk sub
  join_code   text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.org_member (
  org_id              uuid not null references public.org(id) on delete cascade,
  user_id             text not null,         -- Clerk sub
  role                text not null default 'member' check (role in ('owner','admin','member')),
  display_name        text,
  avatar_url          text,
  manual_status       text,
  manual_status_emoji text,
  last_space_id       text,
  last_space_name     text,
  last_active_at      timestamptz,
  created_at          timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists public.org_invite (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.org(id) on delete cascade,
  email       text not null,                 -- lowercased by the app
  role        text not null default 'member' check (role in ('owner','admin','member')),
  invited_by  text not null,                 -- Clerk sub
  status      text not null default 'pending' check (status in ('pending','accepted')),
  created_at  timestamptz not null default now(),
  unique (org_id, email)
);

create table if not exists public.org_space (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.org(id) on delete cascade,
  local_origin_id text,                       -- publisher's local space id
  name           text not null,
  owner_user_id  text not null,               -- Clerk sub
  thumb_url      text,
  content_path   text not null,               -- Storage key for scene.json
  background     jsonb,                        -- asset pointer OR solid color
  version        int  not null default 1,
  updated_at     timestamptz not null default now(),
  updated_by     text not null,               -- Clerk sub
  created_at     timestamptz not null default now()
);

create index if not exists org_member_user_idx on public.org_member (user_id);
create index if not exists org_space_org_idx   on public.org_space (org_id);
create index if not exists org_invite_email_idx on public.org_invite (lower(email));
```

- [ ] **Step 2: Apply the migration to the remote project**

Use the MCP `mcp__supabase-vibespace__apply_migration` with `name`
`20260615_teams_tables` and the exact SQL from Step 1.
Expected: success, no error.

- [ ] **Step 3: Verify the tables exist**

Use MCP `mcp__supabase-vibespace__list_tables` (schema `public`).
Expected: `org`, `org_member`, `org_invite`, `org_space` are present with the
columns above.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/20260615_teams_tables.sql
git commit -m "feat(teams): org/member/invite/space tables"
```


### Task 5: RLS helpers, enable RLS, and policies

Membership/role checks go through `SECURITY DEFINER` helpers so an `org_member`
policy never queries `org_member` directly (which would recurse). Direct
INSERT/DELETE of memberships, orgs, and invites are intentionally left without
permissive policies here — those writes happen through `SECURITY DEFINER` RPCs
added in Plan 2 (create org, join, invite, accept). `org_space` rows are written
directly by members (Plan 5), so they get full policies now.

**Files:**
- Create: `supabase/migrations/20260615_teams_rls.sql`

- [ ] **Step 1: Write the RLS migration file**

Create `supabase/migrations/20260615_teams_rls.sql`:

```sql
-- Identity helper: the Clerk user id from the verified JWT.
create or replace function public.clerk_sub() returns text
language sql stable as $$ select auth.jwt()->>'sub' $$;

-- Probe used to confirm Clerk third-party auth works end to end (Plan 1, Task 3).
create or replace function public.clerk_sub_probe() returns text
language sql stable as $$ select public.clerk_sub() $$;
grant execute on function public.clerk_sub_probe() to authenticated, anon;

-- Membership / role checks. SECURITY DEFINER so policies on org_member can call
-- them without recursing through org_member's own RLS.
create or replace function public.is_org_member(p_org uuid, p_user text)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.org_member where org_id = p_org and user_id = p_user
  );
$$;

create or replace function public.is_org_admin(p_org uuid, p_user text)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.org_member
    where org_id = p_org and user_id = p_user and role in ('owner','admin')
  );
$$;

grant execute on function public.is_org_member(uuid, text) to authenticated;
grant execute on function public.is_org_admin(uuid, text)  to authenticated;

alter table public.org        enable row level security;
alter table public.org_member enable row level security;
alter table public.org_invite enable row level security;
alter table public.org_space  enable row level security;

-- org: members read; admins update. (insert/delete via definer RPCs in Plan 2)
create policy org_select on public.org
  for select to authenticated
  using (public.is_org_member(id, public.clerk_sub()));
create policy org_update on public.org
  for update to authenticated
  using (public.is_org_admin(id, public.clerk_sub()))
  with check (public.is_org_admin(id, public.clerk_sub()));

-- org_member: members read all rows in their orgs; a user updates only their own
-- row (status / last-space). (insert/delete via definer RPCs in Plan 2)
create policy org_member_select on public.org_member
  for select to authenticated
  using (public.is_org_member(org_id, public.clerk_sub()));
create policy org_member_update_self on public.org_member
  for update to authenticated
  using (user_id = public.clerk_sub())
  with check (user_id = public.clerk_sub());

-- org_invite: admins manage; an invitee may see invites addressed to their email.
-- (Requires the Clerk Supabase JWT to include an `email` claim; configure the
-- token's custom claims in the Clerk dashboard.)
create policy org_invite_select on public.org_invite
  for select to authenticated
  using (
    public.is_org_admin(org_id, public.clerk_sub())
    or lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
  );

-- org_space: members read; a member inserts their own; owner or admins mutate.
create policy org_space_select on public.org_space
  for select to authenticated
  using (public.is_org_member(org_id, public.clerk_sub()));
create policy org_space_insert on public.org_space
  for insert to authenticated
  with check (
    public.is_org_member(org_id, public.clerk_sub())
    and owner_user_id = public.clerk_sub()
  );
create policy org_space_update on public.org_space
  for update to authenticated
  using (owner_user_id = public.clerk_sub() or public.is_org_admin(org_id, public.clerk_sub()))
  with check (owner_user_id = public.clerk_sub() or public.is_org_admin(org_id, public.clerk_sub()));
create policy org_space_delete on public.org_space
  for delete to authenticated
  using (owner_user_id = public.clerk_sub() or public.is_org_admin(org_id, public.clerk_sub()));
```

- [ ] **Step 2: Apply the migration**

MCP `mcp__supabase-vibespace__apply_migration`, name `20260615_teams_rls`, with
the SQL from Step 1.
Expected: success.

- [ ] **Step 3: Confirm the Clerk bridge end-to-end (closes Task 3)**

With the app signed in, call `supabase.rpc("clerk_sub_probe")` (devtools console
or a throwaway button). Expected: returns your Clerk user id (e.g. `user_2...`),
`error` null. If it returns null while signed in, fix the third-party-auth
config (Task 3) before continuing.

- [ ] **Step 4: Check advisors for RLS/security warnings**

MCP `mcp__supabase-vibespace__get_advisors` with `type: "security"`.
Expected: no "RLS disabled" findings for the four new tables. Address any
flagged issues.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260615_teams_rls.sql
git commit -m "feat(teams): RLS policies + membership helpers"
```


### Task 6: Storage buckets + storage policies

Two private buckets hold shared-space content and assets. Object keys are
`<org_id>/<space_id>/...`, so the first path segment is the org id — storage
policies gate access by membership in that org. (Plan 5 does the actual
upload/download.)

**Files:**
- Create: `supabase/migrations/20260615_teams_storage.sql`

- [ ] **Step 1: Write the storage migration file**

Create `supabase/migrations/20260615_teams_storage.sql`:

```sql
-- Private buckets for shared-space content and assets.
insert into storage.buckets (id, name, public)
values ('org-space-content', 'org-space-content', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('org-space-assets', 'org-space-assets', false)
on conflict (id) do nothing;

-- Access gated by org membership; the org id is the first folder in the key.
-- (storage.foldername(name))[1] -> '<org_id>'.
create policy org_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id in ('org-space-content', 'org-space-assets')
    and public.is_org_member(((storage.foldername(name))[1])::uuid, public.clerk_sub())
  );

create policy org_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('org-space-content', 'org-space-assets')
    and public.is_org_member(((storage.foldername(name))[1])::uuid, public.clerk_sub())
  );

create policy org_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('org-space-content', 'org-space-assets')
    and public.is_org_member(((storage.foldername(name))[1])::uuid, public.clerk_sub())
  )
  with check (
    bucket_id in ('org-space-content', 'org-space-assets')
    and public.is_org_member(((storage.foldername(name))[1])::uuid, public.clerk_sub())
  );

create policy org_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('org-space-content', 'org-space-assets')
    and public.is_org_member(((storage.foldername(name))[1])::uuid, public.clerk_sub())
  );
```

- [ ] **Step 2: Apply the migration**

MCP `mcp__supabase-vibespace__apply_migration`, name `20260615_teams_storage`,
with the SQL from Step 1.
Expected: success.

- [ ] **Step 3: Verify buckets exist**

MCP `mcp__supabase-vibespace__execute_sql`:

```sql
select id, public from storage.buckets where id like 'org-space-%';
```

Expected: two rows, both `public = false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260615_teams_storage.sql
git commit -m "feat(teams): private storage buckets + membership policies"
```


### Task 7: RLS isolation smoke test (proof the foundation is safe)

Prove that a member of one org cannot read another org's rows. We seed two orgs
as the privileged MCP role (which bypasses RLS), then impersonate the
`authenticated` role with a faked Clerk claim and confirm the policies filter
correctly. Everything runs inside a transaction that is rolled back, so no test
data persists.

**Files:** none (verification only).

- [ ] **Step 1: Run the isolation check**

MCP `mcp__supabase-vibespace__execute_sql` with exactly:

```sql
begin;
insert into public.org (id, name, slug, created_by, join_code) values
  ('00000000-0000-0000-0000-000000000001','Acme','acme-rlstest','user_a','RLSAAA1'),
  ('00000000-0000-0000-0000-000000000002','Globex','globex-rlstest','user_b','RLSBBB2');
insert into public.org_member (org_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000001','user_a','owner'),
  ('00000000-0000-0000-0000-000000000002','user_b','owner');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"user_a","role":"authenticated"}', true);

-- Expectation: exactly one row, slug = 'acme-rlstest'.
select slug as visible_orgs from public.org order by slug;

reset role;
rollback;
```

Expected result: a single row `visible_orgs = acme-rlstest`. If you see
`globex-rlstest` too, an RLS policy is wrong — stop and fix Task 5 before
proceeding.

- [ ] **Step 2: Confirm the rollback left nothing behind**

MCP `mcp__supabase-vibespace__execute_sql`:

```sql
select count(*) as leftover from public.org where slug like '%-rlstest';
```

Expected: `leftover = 0`.

- [ ] **Step 3: No commit needed**

This task changes no files.


### Task 8: Generate typed database definitions

Generate TypeScript types from the live schema so Plans 2–5 get autocomplete and
compile-time safety on every table/column.

**Files:**
- Create: `src/supabase/types.ts`

- [ ] **Step 1: Generate the types**

MCP `mcp__supabase-vibespace__generate_typescript_types`. Save the returned
output verbatim to `src/supabase/types.ts`. The file's first line should be a
generated-code banner and it should export a `Database` type containing
`public.org`, `org_member`, `org_invite`, and `org_space`.

- [ ] **Step 2: Wire the types into the client (optional but recommended)**

In `src/supabase/client.ts`, change the import and `createClient` call to be
generic over `Database`:

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getClerkToken } from "./clerkToken";
// ...
export const supabase = createClient<Database>(url, anonKey, {
  accessToken: getClerkToken,
  auth: { persistSession: false, autoRefreshToken: false },
});
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/supabase/types.ts src/supabase/client.ts
git commit -m "chore(teams): generated Supabase DB types"
```

---

## Done criteria (Plan 1)

- A signed-in user calling `supabase.rpc("clerk_sub_probe")` gets their Clerk id.
- The four tables exist with RLS enabled and no security-advisor warnings.
- The isolation smoke test (Task 7) shows cross-org reads are blocked.
- Two private storage buckets exist with membership-gated policies.
- `src/supabase/types.ts` compiles and the client is generic over `Database`.

**Next:** Plan 2 — Orgs & Membership (create/join/invite via `SECURITY DEFINER`
RPCs, `orgStore`, invite-claim-on-sign-in, `canUseTeams` entitlement).

