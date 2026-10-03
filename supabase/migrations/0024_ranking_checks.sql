-- Record that a rank check HAPPENED, separately from what it found.
--
-- The keyword policy only stores a ranking row for a keyword that earned its place: the
-- permanent set, plus new keywords that reach the top 100. That is right for the grid — it
-- stops hundreds of never-ranking candidates from burying the 12 per market — but it leaves
-- a site that was checked and ranked nowhere looking exactly like a site that was never
-- checked at all. The first OpenSEO run for .org did precisely that: 50 keywords across two
-- markets came back, none in the top 100, so zero rows were written and the page said
-- "No ranking data yet".
--
-- One row per site per week, written by scripts/openseo-import.mjs on every import, so the
-- empty state can say what actually happened: checked, and nothing reached the top 100 yet.
-- Counts only — the keyword texts are deliberately not stored here, because a candidate that
-- has never ranked is not something the dashboard tracks.

create table if not exists public.ranking_checks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  week_date date not null,
  keywords_checked integer not null default 0,
  pairs_checked integer not null default 0,
  pairs_ranked integer not null default 0,
  markets text[] not null default '{}',
  source text not null default 'openseo',
  updated_at timestamptz not null default now(),
  unique (site_id, week_date)
);

comment on table public.ranking_checks is
  'Per site per week: how much the rank checker actually looked at, whether or not anything ranked. Lets an empty grid distinguish "checked, nothing in the top 100" from "never checked".';
comment on column public.ranking_checks.pairs_checked is
  'Keyword x market pairs the checker returned a verdict for, including NR.';
comment on column public.ranking_checks.pairs_ranked is
  'How many of those came back inside the top 100.';

create index if not exists ranking_checks_site_week_idx
  on public.ranking_checks (site_id, week_date desc);

alter table public.ranking_checks enable row level security;
create policy "read_authenticated" on public.ranking_checks for select to authenticated using (true);
create policy "admin_insert" on public.ranking_checks for insert to authenticated with check (public.is_admin());
create policy "admin_update" on public.ranking_checks for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_delete" on public.ranking_checks for delete to authenticated using (public.is_admin());

-- A sweep arrives in pieces: several exports land for the same week, each covering a
-- different slice. Totals therefore cannot be a simple overwrite (the last file would erase
-- the others) nor a blind add (re-importing a file would double-count). Each file's
-- contribution is kept under its own name and the totals are the sum, so re-importing the
-- same file replaces only its own share.
alter table public.ranking_checks
  add column if not exists contributions jsonb not null default '{}'::jsonb;

comment on column public.ranking_checks.contributions is
  'filename -> {keywords, pairs, ranked, markets[]} for each export that fed this week. Totals are derived from it, so a re-import is idempotent.';
