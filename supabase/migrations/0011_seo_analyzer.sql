-- Reshape SEO Score to mirror the Rankmath SEO Analyzer: a single SEO score (0-100),
-- passed / warnings / failed test counts, and an analyzer screenshot. Legacy columns
-- (rankmath_analyzer, seo_homepage, health_score) are left in place but unused.
alter table public.seo_scores
  add column if not exists seo_score integer check (seo_score between 0 and 100),
  add column if not exists passed_tests integer,
  add column if not exists warnings integer,
  add column if not exists failed_tests integer,
  add column if not exists screenshot_path text;

-- Overview "AVG SEO SCORE" now uses seo_score (falling back to legacy rankmath_analyzer).
create or replace function public.dashboard_overview(p_site_id uuid default null)
returns table (
  avg_seo integer,
  avg_pagespeed integer,
  keywords_top10 integer,
  qa_passing integer,
  qa_total integer,
  total_backlinks integer,
  latest_week date
)
language sql stable security invoker set search_path = public as $$
  with lw as (select max(week_date) w from public.rankings)
  select
    (select round(avg(coalesce(seo_score, rankmath_analyzer)))::int
       from public.seo_scores
      where (p_site_id is null or site_id = p_site_id)
        and date = (select max(date) from public.seo_scores)),
    (select round(avg((mobile_score + desktop_score) / 2.0))::int
       from public.pagespeed_entries pe
      where date = (select max(date) from public.pagespeed_entries)
        and (p_site_id is null or pe.pagespeed_url_id in
             (select id from public.pagespeed_urls where site_id = p_site_id))),
    (select count(*)::int from public.rankings, lw
      where week_date = lw.w and position is not null and position <= 10
        and (p_site_id is null or site_id = p_site_id)),
    (select count(*) filter (where passed)::int from public.qa_checks qc
      where (p_site_id is null or qc.qa_page_id in
             (select id from public.qa_pages where site_id = p_site_id))),
    (select count(*)::int from public.qa_checks qc
      where (p_site_id is null or qc.qa_page_id in
             (select id from public.qa_pages where site_id = p_site_id))),
    (select count(*)::int from public.backlinks
      where (p_site_id is null or site_id = p_site_id)),
    (select w from lw);
$$;

grant execute on function public.dashboard_overview(uuid) to authenticated;
