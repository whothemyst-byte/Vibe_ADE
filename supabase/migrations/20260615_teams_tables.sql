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
