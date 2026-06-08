-- Aggregates for the Overview. SECURITY INVOKER so RLS applies (authenticated read).
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
    (select round(avg((rankmath_analyzer + seo_homepage + health_score) / 3.0))::int
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

create or replace function public.rankings_top10_trend(p_site_id uuid default null)
returns table (week_date date, count integer)
language sql stable security invoker set search_path = public as $$
  select week_date, count(*)::int
  from public.rankings
  where position is not null and position <= 10
    and (p_site_id is null or site_id = p_site_id)
  group by week_date
  order by week_date;
$$;

grant execute on function public.dashboard_overview(uuid) to authenticated;
grant execute on function public.rankings_top10_trend(uuid) to authenticated;
