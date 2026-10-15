-- Return the week each previous position came from.
--
-- prev_position is lag() over the rows that exist, so it is last week's position only when
-- that keyword/market was actually checked last week. A market the rank checker never
-- returned leaves no row at all, and the comparison steps over the gap: in the week of
-- 2026-10-13, "تجميد حساب التداول" in Saudi Arabia read "↓ Lost was 31" against a #31 from
-- 2026-09-21, because Saudi was missing from the 2026-10-02 export entirely. Nothing was
-- lost that week — the cell was presenting a three-week-old position as last week's.
--
-- The fix is not to hide the number but to say when it is from, which the page cannot work
-- out on its own: an absent row looks the same as a pair that was never tracked. With the
-- week returned, the page compares it against the week before and dates anything older.
--
-- Dropped and recreated rather than replaced: a set-returning function's return type cannot
-- be changed in place, and the row type is checked at call time.
drop function if exists public.ranking_grid_multi(uuid, integer);

create function public.ranking_grid_multi(p_site_id uuid, p_limit integer default 26)
returns table (
  week_date date,
  keyword text,
  keyword_sort integer,
  country text,
  country_sort integer,
  "position" integer,
  prev_position integer,
  prev_week date
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
           lag(r.position) over w as prev_position,
           lag(r.week_date) over w as prev_week
    from public.rankings r
    where r.site_id = p_site_id
    window w as (partition by r.site_id, r.country_id, r.keyword_id order by r.week_date)
  )
  select ranked.week_date, k.text, k.sort_order, c.code, c.sort_order,
         ranked.position, ranked.prev_position, ranked.prev_week
  from ranked
  join recent_weeks rw on rw.week_date = ranked.week_date
  join public.keywords k on k.id = ranked.keyword_id
  join public.countries c on c.id = ranked.country_id
  order by ranked.week_date desc, k.sort_order, c.sort_order;
$$;

grant execute on function public.ranking_grid_multi(uuid, integer) to anon, authenticated;
