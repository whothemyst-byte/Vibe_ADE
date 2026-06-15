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
-- Returns the number of orgs joined. Requires `email` in the Clerk JWT.
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
