-- Admin-entered scores are percentages, not counts: allow decimals (e.g. 87.5).
--
-- Widened only for score/percentage columns. Counts (passed_tests, warnings,
-- failed_tests, backlink_count, search volume), ranks (rankings.position) and
-- sort_order stay integer, where a fraction would be meaningless.
--
-- integer -> numeric(5,2) is a widening conversion: existing values convert
-- exactly, and the 0..100 check constraints stay in force.

alter table public.seo_scores
  alter column seo_score         type numeric(5,2),
  alter column rankmath_analyzer type numeric(5,2),
  alter column seo_homepage      type numeric(5,2),
  alter column health_score      type numeric(5,2);

alter table public.pagespeed_entries
  alter column mobile_score           type numeric(5,2),
  alter column mobile_accessibility   type numeric(5,2),
  alter column mobile_best_practices  type numeric(5,2),
  alter column mobile_seo             type numeric(5,2),
  alter column desktop_score          type numeric(5,2),
  alter column desktop_accessibility  type numeric(5,2),
  alter column desktop_best_practices type numeric(5,2),
  alter column desktop_seo            type numeric(5,2);

-- The overview cards rounded their averages back to whole numbers with ::int,
-- which would throw away the precision we just enabled. Return numeric to 1dp.
-- Return type changes, so the function must be dropped rather than replaced.
drop function if exists public.dashboard_overview(uuid);

create function public.dashboard_overview(p_site_id uuid default null)
returns table (
  avg_seo numeric,
  avg_pagespeed numeric,
  keywords_top10 integer,
  qa_passing integer,
  qa_total integer,
  total_backlinks integer,
  latest_week date
)
language sql stable security invoker set search_path = public as $$
  with lw as (select max(week_date) w from public.rankings)
  select
    (select round(avg(coalesce(seo_score, rankmath_analyzer)), 1)
       from public.seo_scores
      where (p_site_id is null or site_id = p_site_id)
        and date = (select max(date) from public.seo_scores)),
    (select round(avg((mobile_score + desktop_score) / 2.0), 1)
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
grant execute on function public.dashboard_overview(uuid) to anon;
