-- Record which export wrote each ranking row.
--
-- Without it, a corrected export could not undo what its earlier version had written. The
-- operator replaced grg-com-openseo-2026-10-02.csv with different contents; the importer
-- merges, so it rewrote the pairs the new file contained and left the rest of the old
-- file's rows behind forever. Three .net keywords stayed on the .com grid that way, showing
-- as freshly ranked (#19, #6, #5) on a site they were never checked for.
--
-- With the source recorded, re-importing a file first clears what that file wrote for the
-- week, so a replaced export removes its own stale rows and nothing else's.
alter table public.rankings
  add column if not exists source_file text;

comment on column public.rankings.source_file is
  'Basename of the export that wrote this row. Re-importing that file replaces exactly its own rows for the week; null means the row predates this tracking (hand import or the BPN tracker).';

create index if not exists rankings_source_file_idx on public.rankings (site_id, week_date, source_file);
