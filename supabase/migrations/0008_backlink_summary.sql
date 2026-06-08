-- Per-site backlink count summary (by sub-page / "SUB Language"), from the BACKLINKS sheet.
create table public.backlink_summary (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  sub_url text not null,
  backlink_count integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (site_id, sub_url)
);
create index backlink_summary_site on public.backlink_summary (site_id, sort_order);

alter table public.backlink_summary enable row level security;
create policy "read_authenticated" on public.backlink_summary for select to authenticated using (true);
create policy "admin_insert" on public.backlink_summary for insert to authenticated with check (public.is_admin());
create policy "admin_update" on public.backlink_summary for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_delete" on public.backlink_summary for delete to authenticated using (public.is_admin());
