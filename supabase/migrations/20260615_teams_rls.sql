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
