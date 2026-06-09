-- Perf: return the grid for the most recent N weeks in ONE round-trip,
-- instead of the page fanning out one ranking_grid() call per week.
-- prev_position is the prior week's position for the same site/country/keyword
-- (computed across ALL weeks via lag(), then filtered to the recent window).
create or replace function public.ranking_grid_multi(p_site_id uuid, p_limit integer default 26)
returns table (
  week_date date,
  keyword text,
  keyword_sort integer,
  country text,
  country_sort integer,
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

grant execute on function public.ranking_grid_multi(uuid, integer) to anon, authenticated;
