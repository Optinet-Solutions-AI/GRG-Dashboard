-- PageSpeed now mirrors the PSI report's four Lighthouse categories (per device).
-- mobile_score / desktop_score remain the Performance score; add the other three.
alter table public.pagespeed_entries
  add column if not exists mobile_accessibility integer check (mobile_accessibility between 0 and 100),
  add column if not exists mobile_best_practices integer check (mobile_best_practices between 0 and 100),
  add column if not exists mobile_seo integer check (mobile_seo between 0 and 100),
  add column if not exists desktop_accessibility integer check (desktop_accessibility between 0 and 100),
  add column if not exists desktop_best_practices integer check (desktop_best_practices between 0 and 100),
  add column if not exists desktop_seo integer check (desktop_seo between 0 and 100);
