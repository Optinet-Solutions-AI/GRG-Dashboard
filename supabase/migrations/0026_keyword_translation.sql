-- Link an English keyword to the Arabic keyword it translates.
--
-- The English grid is meant to mirror the Arabic one: same blocks, same order, English text.
-- That only works if each English keyword knows which Arabic keyword it stands for, which
-- nothing recorded until now — the English set simply arrived in an export and was adopted.
--
-- Worth stating plainly: OpenSEO's English set is NOT a translation of the Arabic roster. It
-- is a separate, much smaller list (around 12-13 keywords per market against 99 Arabic), so
-- most English keywords have no Arabic counterpart to point at and this stays null for them.
-- A full mirror needs an English keyword sheet the way the Arabic roster has one.
alter table public.keywords
  add column if not exists translation_of uuid references public.keywords (id) on delete set null;

comment on column public.keywords.translation_of is
  'For an English keyword: the Arabic keyword it translates, so the English grid can borrow its block and markets. Null when no counterpart is known.';

create index if not exists keywords_translation_of_idx on public.keywords (translation_of);
