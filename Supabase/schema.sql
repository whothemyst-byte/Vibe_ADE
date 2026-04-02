-- 1) User profile table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  avatar_url text,
  company text,
  role text,
  timezone text,
  notifications_enabled boolean not null default true,
  theme text not null default 'system',
  default_workspace_id uuid,
  tier text not null default 'spark',
  usage_month text not null default to_char(now(), 'YYYY-MM'),
  tasks_created integer not null default 0,
  swarms_started integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists company text,
  add column if not exists role text,
  add column if not exists timezone text,
  add column if not exists notifications_enabled boolean not null default true,
  add column if not exists theme text not null default 'system',
  add column if not exists default_workspace_id uuid,
  add column if not exists tier text not null default 'spark',
  add column if not exists usage_month text not null default to_char(now(), 'YYYY-MM'),
  add column if not exists tasks_created integer not null default 0,
  add column if not exists swarms_started integer not null default 0;

alter table public.profiles
  drop constraint if exists profiles_theme_check;

alter table public.profiles
  add constraint profiles_theme_check check (theme = any (array['light'::text, 'dark'::text, 'system'::text]));

alter table public.profiles
  drop constraint if exists profiles_default_workspace_id_fkey;

alter table public.profiles
  add constraint profiles_default_workspace_id_fkey
  foreign key (default_workspace_id) references public.workspaces(id) on delete set null;

-- 2) Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- 3) Auto-create profile row after signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 4) Row Level Security
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- 5) API key storage
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}'::text[],
  revoked boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_api_keys_user_id on public.api_keys(user_id);
create index if not exists idx_api_keys_created_at on public.api_keys(created_at desc);

create or replace function public.api_keys_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_api_keys_updated_at on public.api_keys;
create trigger trg_api_keys_updated_at
before update on public.api_keys
for each row execute function public.api_keys_set_updated_at();

alter table public.api_keys enable row level security;

drop policy if exists "api_keys_select_own" on public.api_keys;
create policy "api_keys_select_own"
on public.api_keys
for select
using (auth.uid() = user_id);

drop policy if exists "api_keys_insert_own" on public.api_keys;
create policy "api_keys_insert_own"
on public.api_keys
for insert
with check (auth.uid() = user_id);

drop policy if exists "api_keys_update_own" on public.api_keys;
create policy "api_keys_update_own"
on public.api_keys
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "api_keys_delete_own" on public.api_keys;
create policy "api_keys_delete_own"
on public.api_keys
for delete
using (auth.uid() = user_id);

create or replace function public.create_api_key(api_name text, scopes_in text[] default '{}'::text[])
returns table (
  id uuid,
  key text,
  key_prefix text,
  name text,
  scopes_out text[],
  created_at timestamptz,
  last_used_at timestamptz,
  revoked boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_secret text := 'qs_live_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_prefix text := left(v_secret, 16);
  v_hash text := encode(digest(v_secret, 'sha256'), 'hex');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if api_name is null or btrim(api_name) = '' then
    raise exception 'Name is required';
  end if;

  insert into public.api_keys (user_id, name, key_prefix, key_hash, scopes)
  values (v_user_id, api_name, v_prefix, v_hash, coalesce(scopes_in, '{}'::text[]))
  returning public.api_keys.id, v_secret, public.api_keys.key_prefix, public.api_keys.name, public.api_keys.scopes, public.api_keys.created_at, public.api_keys.last_used_at, public.api_keys.revoked
  into id, key, key_prefix, name, scopes_out, created_at, last_used_at, revoked;

  return next;
end;
$$;

create or replace function public.revoke_api_key(api_key_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.api_keys
  set revoked = true,
      updated_at = now()
  where id = api_key_id
    and user_id = v_user_id;
end;
$$;

-- 5) Atomic usage event recorder
-- Requires: public.usage_events and public.usage_counters tables
create or replace function public.record_usage_event(event_type text, amount integer default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_month text := to_char(now(), 'YYYY-MM');
  v_period_start date := date_trunc('month', now())::date;
  v_period_end date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
  v_task_amount integer := case when event_type = 'task' then greatest(amount, 0) else 0 end;
  v_swarm_amount integer := case when event_type = 'swarm' then greatest(amount, 0) else 0 end;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if event_type not in ('task', 'swarm') then
    raise exception 'Unsupported usage event type: %', event_type;
  end if;

  if amount is null or amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  insert into public.usage_events (user_id, event_type, amount)
  values (v_user_id, event_type, amount);

  insert into public.usage_counters (user_id, period_start, period_end, tasks_created, swarms_started)
  values (v_user_id, v_period_start, v_period_end, v_task_amount, v_swarm_amount)
  on conflict (user_id, period_start) do update
    set period_end = excluded.period_end,
        tasks_created = public.usage_counters.tasks_created + excluded.tasks_created,
        swarms_started = public.usage_counters.swarms_started + excluded.swarms_started,
        updated_at = now();

  insert into public.profiles (id, tier, usage_month, tasks_created, swarms_started)
  values (v_user_id, 'spark', v_month, v_task_amount, v_swarm_amount)
  on conflict (id) do update
    set usage_month = excluded.usage_month,
        tasks_created = case
          when public.profiles.usage_month = excluded.usage_month then public.profiles.tasks_created + excluded.tasks_created
          else excluded.tasks_created
        end,
        swarms_started = case
          when public.profiles.usage_month = excluded.usage_month then public.profiles.swarms_started + excluded.swarms_started
          else excluded.swarms_started
        end,
        updated_at = now();
end;
$$;
