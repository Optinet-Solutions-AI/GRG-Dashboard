-- Every remaining hand-entered number becomes numeric(_,2), finishing what 0019
-- started for scores only.
--
-- Why: an integer column forces `<input type="number">` with the default step of 1,
-- and the browser then refuses a decimal before the form is ever submitted —
-- "Please enter a valid value. The two nearest valid values are 0 and 1." That is
-- the error reported against Passed/Warnings/Failed, the Ahrefs health metrics,
-- the backlink count, search volumes and every Sort order box.
--
-- integer -> numeric is a widening conversion: existing values convert exactly and
-- the `not null default 0` on the sort_order columns is recast with them.
--
-- Deliberately still integer: rankings.position (a rank, constrained 1..100 and
-- written only by the importer) and qa_*_audit.sheet_row (a Google Sheet row index).
-- Neither has an input box, so neither can reject a decimal.

alter table public.seo_scores
  alter column passed_tests type numeric(10,2),
  alter column warnings     type numeric(10,2),
  alter column failed_tests type numeric(10,2);

alter table public.health_snapshots
  alter column domain_rating     type numeric(8,2),
  alter column referring_domains type numeric(14,2),
  alter column total_visitors    type numeric(18,2),
  alter column organic_traffic   type numeric(18,2),
  alter column organic_keywords  type numeric(18,2);

alter table public.backlink_summary
  alter column backlink_count type numeric(14,2),
  alter column sort_order     type numeric(10,2);

alter table public.keywords
  alter column global_volume type numeric(14,2),
  alter column sort_order    type numeric(10,2);

alter table public.keyword_volumes
  alter column volume type numeric(14,2);

alter table public.sites          alter column sort_order type numeric(10,2);
alter table public.countries      alter column sort_order type numeric(10,2);
alter table public.pagespeed_urls alter column sort_order type numeric(10,2);
alter table public.qa_pages       alter column sort_order type numeric(10,2);
alter table public.qa_elements    alter column sort_order type numeric(10,2);

-- The two ranking RPCs return keywords.sort_order / countries.sort_order and declare
-- them `integer`. Postgres checks a set-returning function's row type at call time,
-- so leaving them would break the whole ranking grid with "structure of query does
-- not match function result type". Return type changes => drop, don't replace.
drop function if exists public.ranking_grid(uuid, date);

create function public.ranking_grid(p_site_id uuid, p_week date)
returns table (
  keyword text,
  keyword_sort numeric,
  country text,
  country_sort numeric,
  "position" integer,
  prev_position integer
)
language sql stable security invoker set search_path = public as $$
  with ranked as (
    select r.keyword_id, r.country_id, r.week_date, r.position,
           lag(r.position) over (
             partition by r.site_id, r.country_id, r.keyword_id order by r.week_date
           ) as prev_position
    from public.rankings r
    where r.site_id = p_site_id
  )
  select k.text, k.sort_order, c.code, c.sort_order, ranked.position, ranked.prev_position
  from ranked
  join public.keywords k on k.id = ranked.keyword_id
  join public.countries c on c.id = ranked.country_id
  where ranked.week_date = p_week
  order by k.sort_order, c.sort_order;
$$;

grant execute on function public.ranking_grid(uuid, date) to anon, authenticated, service_role;

drop function if exists public.ranking_grid_multi(uuid, integer);

create function public.ranking_grid_multi(p_site_id uuid, p_limit integer default 26)
returns table (
  week_date date,
  keyword text,
  keyword_sort numeric,
  country text,
  country_sort numeric,
  "position" integer,
  prev_position integer
)
language sql stable security invoker set search_path = public as $$
  with recent_weeks as (
    select distinct r.week_date
    from public.rankings r
    where r.site_id = p_site_id
    order by r.week_date desc
    limit greatest(p_limit, 1)
  ),
  ranked as (
    select r.keyword_id, r.country_id, r.week_date, r.position,
           lag(r.position) over (
             partition by r.site_id, r.country_id, r.keyword_id order by r.week_date
           ) as prev_position
    from public.rankings r
    where r.site_id = p_site_id
  )
  select ranked.week_date, k.text, k.sort_order, c.code, c.sort_order,
         ranked.position, ranked.prev_position
  from ranked
  join recent_weeks rw on rw.week_date = ranked.week_date
  join public.keywords k on k.id = ranked.keyword_id
  join public.countries c on c.id = ranked.country_id
  order by ranked.week_date desc, k.sort_order, c.sort_order;
$$;

grant execute on function public.ranking_grid_multi(uuid, integer) to anon, authenticated, service_role;
