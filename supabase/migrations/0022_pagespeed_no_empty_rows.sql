-- A PageSpeed entry must carry something.
--
-- Twice now the dashboard has shown cards with four empty dials and no screenshot:
-- 2026-09-16 (three per run) and 2026-10-01 (two). Both came from the proof-screenshot
-- script inserting its row whether or not any capture had succeeded. The script was fixed
-- on 2026-09-16 to store nothing when nothing is captured — but the machine that runs it
-- on a schedule is still on an older copy, and it happened again two weeks later.
--
-- Application fixes only protect the callers you control. This constraint protects the
-- table from every caller, including the stale copy out there and whatever runs it next:
-- a row with no score, no category and no screenshot is now rejected outright, so a failed
-- capture writes nothing instead of a blank card on a client-facing dashboard.
--
-- Deliberately permissive about WHICH field is present: a capture that only managed the
-- desktop pass, or only a screenshot, is partial data worth keeping — unlike a row that
-- says nothing at all.

alter table public.pagespeed_entries
  add constraint pagespeed_entries_not_empty check (
    mobile_score is not null
    or desktop_score is not null
    or mobile_accessibility is not null
    or desktop_accessibility is not null
    or mobile_best_practices is not null
    or desktop_best_practices is not null
    or mobile_seo is not null
    or desktop_seo is not null
    or mobile_screenshot_path is not null
    or desktop_screenshot_path is not null
  );

comment on constraint pagespeed_entries_not_empty on public.pagespeed_entries is
  'A failed capture must store nothing rather than a blank card. See migration 0022.';
