-- Pin search_path on the identity helpers (auth.jwt() is schema-qualified).
create or replace function public.clerk_sub() returns text
language sql stable set search_path = '' as $$ select auth.jwt()->>'sub' $$;

create or replace function public.clerk_sub_probe() returns text
language sql stable set search_path = '' as $$ select public.clerk_sub() $$;
grant execute on function public.clerk_sub_probe() to authenticated, anon;

-- Membership predicates are RLS helpers; only signed-in users need them.
-- Revoke the default PUBLIC/anon EXECUTE so they can't be probed anonymously.
revoke execute on function public.is_org_member(uuid, text) from public, anon;
revoke execute on function public.is_org_admin(uuid, text)  from public, anon;
grant  execute on function public.is_org_member(uuid, text) to authenticated;
grant  execute on function public.is_org_admin(uuid, text)  to authenticated;
