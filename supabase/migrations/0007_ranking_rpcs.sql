-- Distinct ranking weeks, newest first.
create or replace function public.ranking_weeks()
returns table (week_date date)
language sql stable security invoker set search_path = public as $$
  select distinct week_date from public.rankings order by week_date desc;
$$;

-- For a site + week: each keyword×country with its position and the prior week's position.
create or replace function public.ranking_grid(p_site_id uuid, p_week date)
returns table (
  keyword text,
  keyword_sort integer,
  country text,
  country_sort integer,
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

grant execute on function public.ranking_weeks() to authenticated;
grant execute on function public.ranking_grid(uuid, date) to authenticated;
