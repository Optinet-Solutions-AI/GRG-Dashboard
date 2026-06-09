-- Extra backlink fields synced from the Google Sheet (Indexed In Google / STATUS / REMARKS).
alter table public.backlinks
  add column if not exists indexed text,
  add column if not exists status text,
  add column if not exists remarks text;

create index if not exists backlinks_status on public.backlinks (status);
