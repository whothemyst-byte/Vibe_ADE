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
