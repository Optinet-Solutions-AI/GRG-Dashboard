-- Keywords Ahrefs sees a site ranking for that we do NOT track.
--
-- The rankings grid only ever shows the rank-tracker's own list — 30 keywords a site. Ahrefs
-- Site Explorer knows every keyword it has seen the domain rank for, which is how we find out
-- what the sites earn that nobody chose to watch.
--
-- Unlike the rankings sync, this SPENDS Ahrefs API units, so the fetch table records what each
-- call actually cost: a cycle that was already bought is never bought again, and an unexpected
-- charge is visible rather than silent.

-- One row per keyword/market/cycle. `cycle` is the first day of the month the pull belongs to,
-- so "last month's list" — which decides what counts as NEW — is a plain date comparison.
create table if not exists public.keyword_discovery (
  id             bigserial   primary key,
  cycle          date        not null,
  site_id        uuid        not null references public.sites(id) on delete cascade,
  country_id     uuid        not null references public.countries(id) on delete cascade,
  keyword        text        not null,
  position       integer     not null,
  position_kind  text,                   -- Ahrefs best_position_kind: organic, ai_overview, …
  url            text        not null default '',
  volume         integer,
  ahrefs_checked timestamptz,            -- when Ahrefs last checked this keyword's SERP
  created_at     timestamptz not null default now(),
  unique (cycle, site_id, country_id, keyword)
);

create index if not exists keyword_discovery_site_cycle_idx
  on public.keyword_discovery (site_id, cycle);

-- What each paid call cost, so a retry after a failure resumes instead of re-buying, and so an
-- overcharge can be seen after the fact. Keyed on the pair, so re-running a cycle is a no-op
-- for pairs already fetched.
create table if not exists public.keyword_discovery_fetches (
  cycle      date        not null,
  site_id    uuid        not null references public.sites(id) on delete cascade,
  country_id uuid        not null references public.countries(id) on delete cascade,
  row_count  integer     not null,
  units      integer     not null,
  fetched_at timestamptz not null default now(),
  primary key (cycle, site_id, country_id)
);

-- Readable by signed-in users like the rest of the dashboard; written only by the service role.
alter table public.keyword_discovery          enable row level security;
alter table public.keyword_discovery_fetches  enable row level security;

drop policy if exists keyword_discovery_read on public.keyword_discovery;
create policy keyword_discovery_read on public.keyword_discovery
  for select to authenticated using (true);

drop policy if exists keyword_discovery_fetches_read on public.keyword_discovery_fetches;
create policy keyword_discovery_fetches_read on public.keyword_discovery_fetches
  for select to authenticated using (true);
