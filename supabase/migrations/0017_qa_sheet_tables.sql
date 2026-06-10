-- Per-page technical SEO audit synced from Google Sheet "FOR EACH PAGE" tab (gid=792540578)
CREATE TABLE IF NOT EXISTS public.qa_page_audit (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id              UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  sheet_row            INTEGER,
  group_name           TEXT,
  url                  TEXT,
  indexed_gsc          TEXT,
  en_equivalent        TEXT,
  permalink            TEXT,
  status               TEXT,
  lang                 TEXT,
  dir                  TEXT,
  title                TEXT,
  title_length         TEXT,
  meta_description     TEXT,
  meta_length          TEXT,
  canonical            TEXT,
  h1_count             TEXT,
  h1                   TEXT,
  h2_count             TEXT,
  h2_list              TEXT,
  h3_count             TEXT,
  h3_list              TEXT,
  images_total         TEXT,
  images_with_alt      TEXT,
  images_decorative    TEXT,
  images_missing_alt   TEXT,
  missing_alt_srcs     TEXT,
  seo_issues           TEXT,
  ar_alignment_issues  TEXT,
  synced_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.qa_page_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read qa_page_audit"   ON public.qa_page_audit FOR SELECT USING (true);
CREATE POLICY "service write qa_page_audit" ON public.qa_page_audit USING (auth.role() = 'service_role');

-- Whole-site checklist synced from Google Sheet "WHOLE WEBSITE" tab (gid=0) — one row per site
CREATE TABLE IF NOT EXISTS public.qa_site_audit (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                   UUID NOT NULL UNIQUE REFERENCES public.sites(id) ON DELETE CASCADE,
  sheet_row                 INTEGER,
  website                   TEXT,
  rankmath_seo              TEXT,
  imagify                   TEXT,
  caching_plugins           TEXT,
  page_seo_score            TEXT,
  rankmath_seo_analyzer     TEXT,
  ahrefs_health_issue       TEXT,
  gsc                       TEXT,
  ga                        TEXT,
  pagespeed_desktop         TEXT,
  pagespeed_mobile          TEXT,
  meta_tags                 TEXT,
  nofollow                  TEXT,
  html_lang                 TEXT,
  site_icon                 TEXT,
  search_engine_visibility  TEXT,
  schema                    TEXT,
  fallback_behavior         TEXT,
  gen_settings_title_tag    TEXT,
  sitemap_gsc               TEXT,
  alt_tags_logo             TEXT,
  twitter_data1_name        TEXT,
  img_logo_name             TEXT,
  gen_settings_content_ai   TEXT,
  index_status              TEXT,
  synced_at                 TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.qa_site_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read qa_site_audit"   ON public.qa_site_audit FOR SELECT USING (true);
CREATE POLICY "service write qa_site_audit" ON public.qa_site_audit USING (auth.role() = 'service_role');
