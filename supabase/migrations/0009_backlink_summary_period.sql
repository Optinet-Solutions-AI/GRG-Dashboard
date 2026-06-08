-- Give the backlink summary a period (month/date) dimension so it can be tracked over time.
alter table public.backlink_summary
  add column if not exists period_date date not null default '2026-06-05';

-- Re-key on (site_id, sub_url, period_date) so each sub-page can have a count per period.
alter table public.backlink_summary drop constraint if exists backlink_summary_site_id_sub_url_key;
alter table public.backlink_summary
  add constraint backlink_summary_site_sub_period_key unique (site_id, sub_url, period_date);

create index if not exists backlink_summary_period on public.backlink_summary (period_date desc);
