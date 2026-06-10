-- Allow multiple PageSpeed records per URL per day so every capture/run is its own
-- historical record (ordered by created_at) instead of overwriting the day's row.
alter table public.pagespeed_entries drop constraint if exists pagespeed_entries_pagespeed_url_id_date_key;
