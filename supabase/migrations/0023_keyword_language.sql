-- Keywords get a language, so the ranking grid can be split Arabic / English.
--
-- Every keyword tracked so far is Arabic. English versions are being added to the rank
-- tracker but aren't translated yet, so the English grid will sit empty for now — the
-- toggle exists so it is ready the moment they arrive, and so an English keyword can never
-- land in the middle of the Arabic table and make it unreadable.
--
-- A column rather than a second table: the rankings, countries and volume joins all stay
-- exactly as they are, one import path keeps working, and "show me the English grid"
-- becomes a filter rather than a parallel schema to keep in step.

alter table public.keywords
  add column if not exists language text not null default 'ar'
    check (language in ('ar', 'en'));

comment on column public.keywords.language is
  'Language of the keyword text: ar (default, everything tracked to date) or en.';

-- Grids are always read one language at a time.
create index if not exists keywords_language_idx on public.keywords (language, sort_order);
