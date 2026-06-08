-- Private screenshots bucket: any authenticated user reads; admins write.
insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do nothing;

create policy "screenshots_read_authenticated" on storage.objects
  for select to authenticated using (bucket_id = 'screenshots');

create policy "screenshots_admin_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'screenshots' and public.is_admin());

create policy "screenshots_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'screenshots' and public.is_admin())
  with check (bucket_id = 'screenshots' and public.is_admin());

create policy "screenshots_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'screenshots' and public.is_admin());
