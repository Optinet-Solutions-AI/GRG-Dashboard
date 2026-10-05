-- Which markets a keyword is MEANT to be tracked in, per site.
--
-- Until now the grid worked this out from the ranking rows themselves: a keyword with rows in
-- all six markets was "All markets", one with rows in a single market belonged to that market.
-- That is only true when a sweep is complete. When it isn't, the shape of the table follows
-- whatever the checker happened to return, which is how .org ended up as one shapeless block —
-- 59 of its 98 keywords landed in exactly 2 markets, so they were grouped as "Selected
-- markets" instead of 20 cross-market keywords plus 20 per country.
--
-- The keyword sheet is the authority on that structure, so it is recorded here rather than
-- re-derived every time. With it the grid can draw the intended shape on day one and mark the
-- gaps honestly, instead of quietly reshaping itself around missing data.
--
-- Sites with no rows here keep the old inferred behaviour, so .com — whose layout is correct
-- and is the model the others follow — is untouched.

create table if not exists public.keyword_targets (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  keyword_id uuid not null references public.keywords (id) on delete cascade,
  country_id uuid not null references public.countries (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (site_id, keyword_id, country_id)
);

comment on table public.keyword_targets is
  'The intended keyword x market roster per site, from the keyword sheet. Drives the grid''s grouping and its "Not checked" gaps. A site with no rows here falls back to inferring the roster from its ranking rows.';

create index if not exists keyword_targets_site_idx on public.keyword_targets (site_id);

alter table public.keyword_targets enable row level security;
create policy "read_authenticated" on public.keyword_targets for select to authenticated using (true);
create policy "admin_insert" on public.keyword_targets for insert to authenticated with check (public.is_admin());
create policy "admin_update" on public.keyword_targets for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_delete" on public.keyword_targets for delete to authenticated using (public.is_admin());

-- Which column of the sheet the target came from: 'ALL' for the cross-market list, otherwise
-- the country code. The sheet repeats the same keyword across several country columns (one
-- phrasing serves Kuwait and Bahrain, say), and the grid shows it under each of those markets.
-- Grouping by markets alone cannot express that — a keyword targeted at two countries would
-- collapse into a single "Selected markets" block instead of appearing in both — so the
-- grouping is recorded rather than derived.
alter table public.keyword_targets
  add column if not exists group_code text not null default 'ALL';

comment on column public.keyword_targets.group_code is
  'ALL = cross-market list; otherwise the country code whose column the keyword came from.';

-- A keyword can be targeted at one market via the cross-market list and again via that
-- market's own column, so the group is part of what makes a target unique.
alter table public.keyword_targets drop constraint if exists keyword_targets_site_id_keyword_id_country_id_key;
create unique index if not exists keyword_targets_unique
  on public.keyword_targets (site_id, keyword_id, country_id, group_code);
