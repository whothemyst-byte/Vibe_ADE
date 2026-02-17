-- Cloud sync schema for workspaces + terminal layouts
-- Requires: public.profiles table (from schema.sql)

-- Shared updated_at trigger function (safe to re-run)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1) Workspaces
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  root_dir text not null,
  selected_model text,
  active_pane_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspaces_user_id on public.workspaces(user_id);
create index if not exists idx_workspaces_updated_at on public.workspaces(updated_at desc);

drop trigger if exists trg_workspaces_updated_at on public.workspaces;
create trigger trg_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

-- 2) Terminal layouts (versioned snapshots)
create table if not exists public.terminal_layouts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1,
  preset_id text,
  pane_order jsonb not null default '[]'::jsonb,
  layout jsonb not null, -- full layout tree from app
  pane_shells jsonb not null default '{}'::jsonb,
  pane_agents jsonb not null default '{}'::jsonb,
  command_blocks jsonb not null default '{}'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terminal_layouts_version_positive check (version > 0)
);

create index if not exists idx_terminal_layouts_workspace_id on public.terminal_layouts(workspace_id);
create index if not exists idx_terminal_layouts_user_id on public.terminal_layouts(user_id);
create index if not exists idx_terminal_layouts_workspace_current
  on public.terminal_layouts(workspace_id, is_current);
create unique index if not exists uq_terminal_layouts_workspace_version
  on public.terminal_layouts(workspace_id, version);
create unique index if not exists uq_terminal_layouts_workspace_current_true
  on public.terminal_layouts(workspace_id)
  where is_current = true;

drop trigger if exists trg_terminal_layouts_updated_at on public.terminal_layouts;
create trigger trg_terminal_layouts_updated_at
before update on public.terminal_layouts
for each row execute function public.set_updated_at();

-- 3) Helper function: when setting a layout as current, unset others in same workspace
create or replace function public.enforce_single_current_layout()
returns trigger
language plpgsql
as $$
begin
  if new.is_current then
    update public.terminal_layouts
    set is_current = false,
        updated_at = now()
    where workspace_id = new.workspace_id
      and id <> new.id
      and is_current = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_terminal_layouts_single_current on public.terminal_layouts;
create trigger trg_terminal_layouts_single_current
before insert or update of is_current on public.terminal_layouts
for each row execute function public.enforce_single_current_layout();

-- 4) RLS
alter table public.workspaces enable row level security;
alter table public.terminal_layouts enable row level security;

-- Workspaces policies
drop policy if exists "workspaces_select_own" on public.workspaces;
create policy "workspaces_select_own"
on public.workspaces
for select
using (auth.uid() = user_id);

drop policy if exists "workspaces_insert_own" on public.workspaces;
create policy "workspaces_insert_own"
on public.workspaces
for insert
with check (auth.uid() = user_id);

drop policy if exists "workspaces_update_own" on public.workspaces;
create policy "workspaces_update_own"
on public.workspaces
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "workspaces_delete_own" on public.workspaces;
create policy "workspaces_delete_own"
on public.workspaces
for delete
using (auth.uid() = user_id);

-- Terminal layouts policies
drop policy if exists "terminal_layouts_select_own" on public.terminal_layouts;
create policy "terminal_layouts_select_own"
on public.terminal_layouts
for select
using (auth.uid() = user_id);

drop policy if exists "terminal_layouts_insert_own" on public.terminal_layouts;
create policy "terminal_layouts_insert_own"
on public.terminal_layouts
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.workspaces w
    where w.id = workspace_id
      and w.user_id = auth.uid()
  )
);

drop policy if exists "terminal_layouts_update_own" on public.terminal_layouts;
create policy "terminal_layouts_update_own"
on public.terminal_layouts
for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.workspaces w
    where w.id = workspace_id
      and w.user_id = auth.uid()
  )
);

drop policy if exists "terminal_layouts_delete_own" on public.terminal_layouts;
create policy "terminal_layouts_delete_own"
on public.terminal_layouts
for delete
using (auth.uid() = user_id);

