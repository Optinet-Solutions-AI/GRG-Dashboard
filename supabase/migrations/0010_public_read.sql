-- Public (anon) read-only access; writes remain admin-only (is_admin() policies from 0003 are untouched).
do $$
declare t text;
begin
  foreach t in array array[
    'sites','keywords','countries','pagespeed_urls','qa_pages','qa_elements',
    'seo_scores','health_snapshots','pagespeed_entries','rankings',
    'keyword_volumes','backlinks','qa_checks','backlink_summary'
  ]
  loop
    execute format('drop policy if exists "read_authenticated" on public.%I;', t);
    execute format('drop policy if exists "read_public" on public.%I;', t);
    execute format($f$create policy "read_public" on public.%I for select to anon, authenticated using (true);$f$, t);
    execute format('grant select on public.%I to anon;', t);
  end loop;
end $$;

-- profiles stays restricted (NOT public): leave its existing authenticated self/admin policy as-is.

-- Storage: allow public read of the screenshots bucket; writes stay admin-only (0004 unchanged).
drop policy if exists "screenshots_read_authenticated" on storage.objects;
drop policy if exists "screenshots_read_public" on storage.objects;
create policy "screenshots_read_public" on storage.objects
  for select to anon, authenticated using (bucket_id = 'screenshots');
